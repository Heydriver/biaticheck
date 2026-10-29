import { describe, expect, it } from "vitest";
import { ordneKategorieZu, plusMonate, pruefeAbrechnung, type Regelergebnis } from "../src/index.js";
import { fehlerhafteAbrechnung, korrekteAbrechnung } from "./faelle.js";

const HEUTE = "2026-10-29";
const nur = (ergebnisse: Regelergebnis[], regelId: string) => ergebnisse.filter((e) => e.regelId === regelId);

describe("korrekte Abrechnung", () => {
  const bericht = pruefeAbrechnung(korrekteAbrechnung(), { heute: HEUTE });

  it("findet keine Abweichungen, Auffälligkeiten oder offenen Punkte", () => {
    const nichtOk = bericht.ergebnisse.filter((e) => e.status !== "ok");
    expect(nichtOk).toEqual([]);
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(0);
    expect(bericht.zusammenfassung.rueckfragen).toEqual([]);
  });

  it("nennt die Einwendungsfrist", () => {
    expect(nur(bericht.ergebnisse, "F-03")[0]?.titel).toBe("Einwendungen möglich bis 14.05.2027");
  });
});

describe("fehlerhafte Abrechnung", () => {
  const bericht = pruefeAbrechnung(fehlerhafteAbrechnung(), { heute: HEUTE });
  const e = bericht.ergebnisse;

  it("erkennt nicht umlagefähige Verwaltungskosten", () => {
    expect(nur(e, "I-01")).toMatchObject([{ status: "abweichung", positionId: "p10", betragZugunstenMieter: 144 }]);
  });

  it("erkennt den Rechenfehler bei der Hausreinigung", () => {
    expect(nur(e, "R-01")).toMatchObject([
      { status: "abweichung", positionId: "p5", betragZugunstenMieter: 18, beleg: { erwartet: 180 } },
    ]);
  });

  it("erkennt nicht vereinbarte sonstige Kosten", () => {
    expect(nur(e, "I-02")).toMatchObject([{ status: "abweichung", positionId: "p11", betragZugunstenMieter: 36 }]);
  });

  it("meldet starken Anstieg der Versicherung und neue Kostenarten", () => {
    const titel = nur(e, "P-01").map((x) => x.titel);
    expect(titel).toContain("Starker Anstieg: § 2 Nr. 13 – Sach- und Haftpflichtversicherung");
    expect(titel).toContain("Neue Kostenart: Verwaltungskosten (nicht umlagefähig)");
  });

  it("meldet ungewöhnlichen Verbrauchsanteil bei Heizkosten", () => {
    expect(nur(e, "I-04")).toMatchObject([{ status: "auffaelligkeit", beleg: { verbrauchsanteilProzent: 80 } }]);
  });

  it("meldet hohe Kosten pro m²", () => {
    expect(nur(e, "P-02")[0]?.status).toBe("auffaelligkeit");
  });

  it("rechnet Summe und Saldo nach (beides hier korrekt addiert)", () => {
    expect(nur(e, "R-02")[0]?.status).toBe("ok");
    expect(nur(e, "R-03")[0]?.status).toBe("ok");
  });

  it("summiert das Einsparpotenzial", () => {
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(144 + 18 + 36);
  });
});

describe("Fristen", () => {
  it("verspätete Abrechnung: Nachzahlung entfällt, Potenzial wird nicht doppelt gezählt", () => {
    const a = fehlerhafteAbrechnung();
    a.meta.zugangAm = "2027-01-05";
    const bericht = pruefeAbrechnung(a, { heute: "2027-01-10" });
    expect(nur(bericht.ergebnisse, "F-02")).toMatchObject([{ status: "abweichung", betragZugunstenMieter: 330 }]);
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(330);
  });

  it("erkennt Verspätung schon am Erstellungsdatum, auch ohne Zugangsdatum", () => {
    const a = korrekteAbrechnung();
    delete a.meta.zugangAm;
    a.meta.erstelltAm = "2026-12-31"; // Fristende ist der 31.12.2026 → Zugang könnte noch rechtzeitig sein
    expect(nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "F-02")[0]?.status).toBe("nicht_pruefbar");
    a.meta.erstelltAm = "2027-01-02";
    expect(nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "F-02")[0]?.status).toBe("abweichung");
  });

  it("Einwendungsfrist abgelaufen", () => {
    const bericht = pruefeAbrechnung(korrekteAbrechnung(), { heute: "2027-06-01" });
    expect(nur(bericht.ergebnisse, "F-03")[0]?.status).toBe("auffaelligkeit");
  });

  it("Zeitraum über 12 Monate", () => {
    const a = korrekteAbrechnung();
    a.meta.abrechnungszeitraum = { von: "2025-01-01", bis: "2026-01-31" };
    expect(nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "F-01")[0]?.status).toBe("abweichung");
  });
});

describe("fehlende Angaben", () => {
  it("führt zu 'nicht prüfbar' und gebündelten Rückfragen", () => {
    const a = korrekteAbrechnung();
    delete a.meta.zugangAm;
    delete a.vorauszahlungen;
    delete a.vorjahr;
    const bericht = pruefeAbrechnung(a, { heute: HEUTE });
    const felder = bericht.zusammenfassung.rueckfragen.map((r) => r.feld);
    expect(felder).toEqual(["meta.zugangAm", "vorauszahlungen", "vorjahr"]);
    expect(nur(bericht.ergebnisse, "F-02")[0]?.status).toBe("nicht_pruefbar");
    expect(nur(bericht.ergebnisse, "F-03")[0]?.status).toBe("nicht_pruefbar");
    expect(nur(bericht.ergebnisse, "R-03")[0]?.status).toBe("nicht_pruefbar");
  });

  it("fehlende Gesamtkosten werden als Auffälligkeit gemeldet", () => {
    const a = korrekteAbrechnung();
    delete a.kostenpositionen[0]!.gesamtkosten;
    expect(nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "F-04")).toMatchObject([
      { status: "auffaelligkeit", positionId: "p1" },
    ]);
  });

  it("sonstige Kosten ohne Mietvertragsangabe: Rückfrage", () => {
    const a = korrekteAbrechnung();
    a.kostenpositionen.push({ id: "px", bezeichnung: "Wartung Rauchwarnmelder", kategorie: "sonstige", anteilMieter: 12 });
    const bericht = pruefeAbrechnung(a, { heute: HEUTE });
    expect(bericht.zusammenfassung.rueckfragen.map((r) => r.feld)).toContain("mietvertrag.vereinbarteSonstigeKosten");
  });
});

describe("Sonderfälle", () => {
  it("rechnet bei Auszug während des Jahres zeitanteilig", () => {
    const a = korrekteAbrechnung();
    a.meta.nutzungszeitraum = { von: "2025-01-01", bis: "2025-06-30" }; // 181 von 365 Tagen
    a.kostenpositionen = [
      { id: "p1", bezeichnung: "Grundsteuer", kategorie: "grundsteuer", gesamtkosten: 3650, umlageschluessel: { typ: "wohnflaeche", anteilEinheit: 72, anteilGesamt: 960 }, anteilMieter: 136.12 },
    ];
    delete a.ausgewiesen;
    // 3650 × 72/960 × 181/365 = 135,75 → 0,37 € zu viel
    expect(nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "R-01")).toMatchObject([
      { status: "abweichung", beleg: { erwartet: 135.75 }, betragZugunstenMieter: 0.37 },
    ]);
  });

  it("Heizkosten ohne Verbrauchserfassung: 15 % Kürzung", () => {
    const a = korrekteAbrechnung();
    a.heizkosten = { ...a.heizkosten!, verbrauchErfasst: false };
    expect(nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "I-04")).toMatchObject([
      { status: "abweichung", betragZugunstenMieter: 147 },
    ]);
  });

  it("eine fehlerhafte Regel bricht die Prüfung nicht ab", () => {
    const kaputt = { id: "X-99", version: "0", titel: "Test", bereich: "formell" as const, grundlage: "", stand: "entwurf" as const, pruefe: () => { throw new Error("kaputt"); } };
    const bericht = pruefeAbrechnung(korrekteAbrechnung(), { heute: HEUTE, regeln: [kaputt] });
    expect(bericht.ergebnisse).toMatchObject([{ regelId: "X-99", status: "nicht_pruefbar" }]);
  });
});

describe("Hilfsfunktionen", () => {
  it("plusMonate rechnet kalendergenau", () => {
    expect(plusMonate("2025-12-31", 12)).toBe("2026-12-31");
    expect(plusMonate("2024-01-31", 1)).toBe("2024-02-29");
    expect(plusMonate("2024-02-29", 12)).toBe("2025-02-28");
  });

  it.each([
    ["Grundsteuer B", "grundsteuer"],
    ["Kaltwasser", "wasser"],
    ["Warmwasserkosten", "warmwasser"],
    ["Schmutzwasser / Abwasser", "entwaesserung"],
    ["Müllentsorgung", "strassenreinigung_muell"],
    ["Hausmeisterservice", "hauswart"],
    ["Verwaltergebühr Hausverwaltung", "verwaltung"],
    ["Reparatur Haustür", "instandhaltung"],
    ["Kabel-TV", "antenne_kabel"],
    ["Fahrstuhl", "aufzug"],
    ["Diverses", "unbekannt"],
  ])("ordnet „%s“ der Kategorie %s zu", (bezeichnung, kategorie) => {
    expect(ordneKategorieZu(bezeichnung)).toBe(kategorie);
  });
});
