import { describe, expect, it } from "vitest";
import {
  ALLE_REGELN,
  ANTWORT_FELDER,
  AntwortFehler,
  erstelleErstauswertung,
  pruefeAbrechnung,
  wendeAntwortAn,
  type AbrechnungEingabe,
} from "../src/index.js";
import { fehlerhafteAbrechnung, korrekteAbrechnung } from "./faelle.js";
import { G001 } from "./golden/G-001.js";

const HEUTE = "2026-10-29";

/** Abrechnung, in der möglichst viele Angaben fehlen – provoziert alle Rückfragen. */
function minimaleAbrechnung(): AbrechnungEingabe {
  return {
    meta: { abrechnungszeitraum: { von: "2025-01-01", bis: "2025-12-31" }, geschoss: 0 },
    kostenpositionen: [
      { id: "a", bezeichnung: "Heizung", kategorie: "heizung", anteilMieter: 500 },
      { id: "b", bezeichnung: "Wartung Rauchmelder", kategorie: "sonstige", anteilMieter: 10 },
      { id: "c", bezeichnung: "Aufzug", kategorie: "aufzug", anteilMieter: 50 },
    ],
    ausgewiesen: { saldo: 100 },
    vorauszahlungenDetail: { betriebskosten: 600, monatlich: { betriebskosten: 100 } },
  };
}

describe("Rückfragen", () => {
  it("jede Rückfrage, die eine Regel stellt, ist als Antwortfeld registriert", () => {
    const faelle = [korrekteAbrechnung(), fehlerhafteAbrechnung(), G001, minimaleAbrechnung()];
    const gestellt = new Set<string>();
    for (const fall of faelle) {
      for (const e of pruefeAbrechnung(fall, { heute: HEUTE }).ergebnisse) {
        if (e.rueckfrage) gestellt.add(e.rueckfrage.feld);
      }
    }
    // Absicherung, dass der Test überhaupt etwas prüft
    expect(gestellt.size).toBeGreaterThanOrEqual(7);
    for (const feld of gestellt) expect(ANTWORT_FELDER, `Feld ${feld} fehlt in ANTWORT_FELDER`).toHaveProperty([feld]);
  });

  it("übernimmt ein Zugangsdatum und die Frist wird prüfbar", () => {
    const vorher = pruefeAbrechnung(G001, { heute: HEUTE });
    expect(vorher.ergebnisse.find((e) => e.regelId === "F-02")?.status).toBe("nicht_pruefbar");

    const nachher = pruefeAbrechnung(wendeAntwortAn(G001, "meta.zugangAm", "2025-11-28"), { heute: HEUTE });
    expect(nachher.ergebnisse.find((e) => e.regelId === "F-02")?.status).toBe("ok");
    expect(nachher.ergebnisse.find((e) => e.regelId === "F-03")?.titel).toBe("Einwendungen möglich bis 28.11.2026");
  });

  it("legt fehlende Zwischenobjekte an und verändert das Original nicht", () => {
    const original = korrekteAbrechnung();
    const neu = wendeAntwortAn(original, "mietvertrag.aufzugAusgenommen", true);
    expect(neu.mietvertrag?.aufzugAusgenommen).toBe(true);
    expect(original.mietvertrag).toBeUndefined();
  });

  it.each([
    ["meta.zugangAm", "28.11.2025"],
    ["meta.zugangAm", "2025-13-45"],
    ["vorauszahlungen", -5],
    ["vorauszahlungen", "100"],
    ["mietvertrag.aufzugAusgenommen", "ja"],
    ["mietvertrag.vereinbarteSonstigeKosten", [""]],
    ["vorjahr", {}],
    ["meta.__proto__.x", 1],
    ["unbekannt", 1],
  ])("lehnt ungültige Antwort ab: %s = %j", (feld, wert) => {
    expect(() => wendeAntwortAn(korrekteAbrechnung(), feld, wert)).toThrow(AntwortFehler);
  });
});

describe("Erstauswertung (kostenlos)", () => {
  const bericht = pruefeAbrechnung(fehlerhafteAbrechnung(), { heute: HEUTE });
  const erst = erstelleErstauswertung(bericht);
  const json = JSON.stringify(erst);

  it("enthält keine Inhalte des bezahlten Berichts", () => {
    for (const e of bericht.ergebnisse) {
      expect(json).not.toContain(e.erklaerung);
      if (e.naechsterSchritt) expect(json).not.toContain(e.naechsterSchritt);
    }
    expect(json).not.toContain("beleg");
    expect(json).not.toContain("betragZugunstenMieter");
  });

  it("zeigt Überblick, Potenzial und auffällige Punkte – schwerste zuerst", () => {
    expect(erst.einsparpotenzial).toBe(198);
    expect(erst.punkte[0]?.status).toBe("abweichung");
    expect(erst.punkte.every((p) => (p.status as string) !== "ok")).toBe(true);
  });

  it("alle Regeln haben eindeutige IDs", () => {
    const ids = ALLE_REGELN.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
