import { describe, expect, it } from "vitest";
import {
  ALLE_REGELN,
  DMB_BETRIEBSKOSTENSPIEGEL,
  erstelleStufe1,
  erstelleStufe2,
  LOESUNGSVORSCHLAEGE,
  loesungsvorschlag,
  MINDESTFAELLE_REGION,
  plzRegion,
  pruefeAbrechnung,
  regionaleReferenz,
  vergleicheKosten,
  wendeAntwortAn,
  Abrechnung,
  euro,
  type AbrechnungEingabe,
} from "../src/index";
import { fehlerhafteAbrechnung, korrekteAbrechnung } from "./faelle";
import { G001 } from "./golden/G-001";

const HEUTE = "2026-11-06";
const stufen = (a: AbrechnungEingabe, heute = HEUTE) => {
  const bericht = pruefeAbrechnung(a, { heute });
  const s1 = erstelleStufe1(bericht, a, { heute });
  return { bericht, s1, s2: erstelleStufe2(bericht, a, s1) };
};

describe("Stufe 1.1 – Fehlerpotenzial und Widerspruchsfrist (G-001)", () => {
  const { s1 } = stufen(wendeAntwortAn(G001, "meta.zugangAm", "2025-11-28"));

  it("zeigt sicheres und zu klärendes Einsparpotenzial", () => {
    expect(s1.fehlerpotenzial).toMatchObject({ sicher: 0, zuKlaeren: 1236.44 });
  });

  it("berechnet die Widerspruchsfrist mit verbleibenden Tagen", () => {
    expect(s1.widerspruchsfrist).toMatchObject({ status: "offen", bis: "2026-11-28", tageVerbleibend: 22 });
    expect(s1.widerspruchsfrist.abrechnungsfrist).toEqual({ status: "eingehalten", bis: "2025-12-31" });
  });

  it("ohne Zugangsdatum: Frist unbekannt und Rückfrage in Stufe 1", () => {
    const { s1: ohne } = stufen(G001);
    expect(ohne.widerspruchsfrist.status).toBe("unbekannt");
    expect(ohne.rueckfragen.map((r) => r.feld)).toContain("meta.zugangAm");
  });

  it("abgelaufene Frist", () => {
    const { s1: spaet } = stufen(wendeAntwortAn(G001, "meta.zugangAm", "2025-11-28"), "2026-12-01");
    expect(spaet.widerspruchsfrist).toMatchObject({ status: "abgelaufen", tageVerbleibend: 0 });
  });
});

describe("Stufe 1.2 – Kostenvergleich, Betriebskosten und Nachzahlung (G-001)", () => {
  const { s1 } = stufen(G001);

  it("zeigt Betriebskosten, Heizkosten, Vorauszahlungen und Nachzahlung", () => {
    expect(s1.kosten).toEqual({ betriebskosten: 2057.81, heizkosten: 1859.4, vorauszahlungen: 2702.33, saldo: 1214.88 });
  });

  it("vergleicht mit dem DMB-Betriebskostenspiegel des Abrechnungsjahres 2024", () => {
    if (!s1.vergleich.ok) throw new Error(s1.vergleich.grund);
    const v = s1.vergleich.vergleich;
    expect(v.jahr).toBe(2024);
    expect(v.region).toBe("Deutschland");
    expect(v.regionalFolgt).toBe("PLZ-Gebiet 80");
    // 3.917,21 € / 84,28 m² / 12 Monate (366 Tage) ≈ 3,87 €
    expect(v.gesamt).toMatchObject({ ihr: 3.87, durchschnitt: 2.67, maximum: 3.68, abweichungProzent: 45 });
    // 1.859,40 € / 84,28 m² / 12,02 Monate (2024 hat 366 Tage)
    expect(v.heizungWarmwasser).toMatchObject({ ihr: 1.83, durchschnitt: 1.32 });
    // Stärkste Abweichung zuerst: Müll/Straßenreinigung (+78 %), dann Wasser (+71 %)
    expect(v.gruppen.slice(0, 2)).toMatchObject([
      { gruppe: "muell_strassenreinigung", ihr: 0.36, durchschnitt: 0.2, abweichungProzent: 78 },
      { gruppe: "wasser_abwasser", ihr: 0.5, durchschnitt: 0.29, abweichungProzent: 71 },
    ]);
  });

  it("enthält keine Inhalte aus Stufe 2", () => {
    const { bericht } = stufen(G001);
    const json = JSON.stringify(s1);
    for (const e of bericht.ergebnisse) {
      if (e.status === "ok") continue;
      expect(json).not.toContain(e.titel);
      expect(json).not.toContain(e.erklaerung);
    }
    // Rückfragen, die Befunde verraten (z. B. Aufzug im EG), erst in Stufe 2
    expect(s1.rueckfragen.map((r) => r.feld)).not.toContain("mietvertrag.aufzugAusgenommen");
  });

  it("fragt nach der PLZ, wenn sie fehlt", () => {
    const ohnePlz = structuredClone(G001);
    delete ohnePlz.meta.plz;
    expect(stufen(ohnePlz).s1.rueckfragen.map((r) => r.feld)).toContain("meta.plz");
  });
});

describe("Stufe 2 – Auffälligkeiten, Lösungsvorschläge, Zusammenfassung", () => {
  const { s2, bericht } = stufen(fehlerhafteAbrechnung());

  it("jeder Befund hat einen Lösungsvorschlag – Fehler zuerst, nach Betrag sortiert", () => {
    expect(s2.auffaelligkeiten.length).toBe(bericht.ergebnisse.filter((e) => e.status !== "ok").length);
    expect(s2.auffaelligkeiten.every((p) => p.loesung.length > 20)).toBe(true);
    expect(s2.auffaelligkeiten.slice(0, 3).map((p) => p.betrag)).toEqual([144, 36, 18]);
    expect(s2.auffaelligkeiten[0]?.grundlage).toBe("§ 556 Abs. 1 BGB, § 1 Abs. 2 BetrKV");
  });

  it("Zusammenfassung in ganzen Sätzen", () => {
    expect(s2.zusammenfassung[0]).toBe(`Wir haben Ihre Abrechnung 2025 anhand von ${ALLE_REGELN.length} Prüfregeln untersucht und dabei 3 Fehler und 5 Auffälligkeiten festgestellt.`);
    expect(s2.zusammenfassung).toContain(`Sicher bezifferbar ist ein Einsparpotenzial von ${euro(198)}.`);
    expect(s2.zusammenfassung).toContain(`Der wichtigste Punkt ist „Nicht umlagefähig: Verwaltungskosten“. Fordern Sie die Streichung dieser Position (${euro(144)}).`);
  });

  it("Anschreiben an die Hausverwaltung listet Einwände und Klärungspunkte", () => {
    expect(s2.anschreiben.betreff).toBe("Betriebskostenabrechnung 2025, Wohnung 2. OG links: Einwände und Bitte um Belegeinsicht");
    expect(s2.anschreiben.text).toContain(`1. Nicht umlagefähig: Verwaltungskosten (${euro(144)})`);
    // keine Dopplung und kein Durchschnittsvergleich im Brief
    expect(s2.anschreiben.text).not.toContain("Neue Kostenart: Verwaltungskosten");
    expect(s2.anschreiben.text).not.toContain("Überdurchschnittlich hohe Nebenkosten");
    expect(s2.anschreiben.text).toContain("Zu folgenden Punkten bitte ich um Erläuterung");
    expect(s2.anschreiben.text).toContain("[Ihr Name]");
  });
});

describe("Sprache der Kundentexte: sachlich, ohne KI-Formatierung", () => {
  // Emojis, Markdown-Hervorhebungen, Überschriften-Rauten, Aufzählungszeichen und typische Floskeln
  const VERBOTEN = [/\p{Extended_Pictographic}/u, /\*\*|__|^#+\s/m, /^\s*[-•*]\s/m, /✓|✔|✅|❌|⚠|→/, /\b(Gerne|Natürlich|Großartig|Fazit:)/];

  for (const [name, fall] of Object.entries({ korrekt: korrekteAbrechnung(), fehlerhaft: fehlerhafteAbrechnung(), G001 })) {
    it(`${name}: Befunde, Lösungen, Zusammenfassung und Anschreiben`, () => {
      const { s2 } = stufen(fall);
      const texte = [...s2.auffaelligkeiten.flatMap((p) => [p.titel, p.befund, p.loesung]), ...s2.zusammenfassung, s2.anschreiben.betreff, s2.anschreiben.text];
      for (const t of texte) for (const muster of VERBOTEN) expect(t, t).not.toMatch(muster);
    });
  }

  it("alle hinterlegten Lösungsvorschläge sind ebenfalls sauber", () => {
    for (const t of Object.values(LOESUNGSVORSCHLAEGE)) expect(t).not.toMatch(/\p{Extended_Pictographic}|\*\*/u);
  });
});

describe("Lösungsvorschläge sind vollständig", () => {
  it("jede Regel liefert bei jedem möglichen Befund einen Lösungsvorschlag", () => {
    const minimal: AbrechnungEingabe = {
      meta: { abrechnungszeitraum: { von: "2025-01-01", bis: "2025-12-31" }, geschoss: 0 },
      kostenpositionen: [
        { id: "a", bezeichnung: "Heizung", kategorie: "heizung", anteilMieter: 500 },
        { id: "b", bezeichnung: "Diverses", kategorie: "unbekannt", anteilMieter: 10 },
        { id: "c", bezeichnung: "Aufzug", kategorie: "aufzug", anteilMieter: 50 },
        { id: "d", bezeichnung: "Dachrinne", kategorie: "sonstige", anteilMieter: 5 },
      ],
      ausgewiesen: { saldo: 100 },
    };
    for (const fall of [korrekteAbrechnung(), fehlerhafteAbrechnung(), G001, minimal]) {
      for (const heute of ["2026-01-01", "2028-01-01"]) {
        for (const e of pruefeAbrechnung(fall, { heute }).ergebnisse) {
          if (e.status !== "ok") expect(loesungsvorschlag(e), `${e.regelId}:${e.status}`).toBeTruthy();
        }
      }
    }
  });

  it("Lösungsvorschläge beziehen sich nur auf existierende Regeln", () => {
    const ids = new Set(ALLE_REGELN.map((r) => r.id));
    for (const schluessel of Object.keys(LOESUNGSVORSCHLAEGE)) expect(ids.has(schluessel.split(":")[0]!)).toBe(true);
  });
});

describe("Vergleichswerte", () => {
  it("jeder DMB-Wert hat Quelle und Jahr", () => {
    for (const r of DMB_BETRIEBSKOSTENSPIEGEL) {
      expect(r.quelle).toMatch(/Deutscher Mieterbund/);
      expect(r.jahr).toBeGreaterThan(2020);
    }
  });

  it("PLZ-Region aus der Postleitzahl", () => {
    expect(plzRegion("80937")).toBe("80");
    expect(plzRegion("0193")).toBeUndefined();
    expect(plzRegion(undefined)).toBeUndefined();
  });

  it("regionale Werte erst ab der Mindestzahl an Fällen", () => {
    const fall = Abrechnung.parse(G001);
    expect(regionaleReferenz("80", Array(MINDESTFAELLE_REGION - 1).fill(fall), 2024)).toBeUndefined();
    const ref = regionaleReferenz("80", Array(MINDESTFAELLE_REGION).fill(fall), 2024)!;
    expect(ref).toMatchObject({ region: "PLZ-Gebiet 80", fallzahl: MINDESTFAELLE_REGION });
    const mitRegion = vergleicheKosten(fall, ref);
    expect(mitRegion.ok && mitRegion.vergleich.region).toBe("PLZ-Gebiet 80");
    expect(mitRegion.ok && mitRegion.vergleich.regionalFolgt).toBeUndefined();
  });

  it("ohne Wohnfläche kein Vergleich, sondern ein verständlicher Grund", () => {
    const a = structuredClone(G001);
    delete a.flaechen!.wohnflaecheMieter;
    expect(vergleicheKosten(Abrechnung.parse(a))).toMatchObject({ ok: false, grund: expect.stringContaining("Wohnfläche") });
  });
});
