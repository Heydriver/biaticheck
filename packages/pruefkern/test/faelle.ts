import type { AbrechnungEingabe } from "../src/index.js";

/**
 * Synthetische Musterfälle (Golden Set, Teil 1).
 * Echte, anonymisierte Fälle aus den Expertenprüfungen kommen nach `test/golden/`.
 */

const wf = (anteilGesamt = 960) => ({ typ: "wohnflaeche" as const, anteilEinheit: 72, anteilGesamt });

/** Korrekte Abrechnung: 72 m² Wohnung in einem Haus mit 960 m² und 12 Einheiten, Jahr 2025. */
export function korrekteAbrechnung(): AbrechnungEingabe {
  return {
    meta: {
      objektAdresse: "Musterstraße 1, 10115 Berlin",
      wohnung: "2. OG links",
      abrechnungszeitraum: { von: "2025-01-01", bis: "2025-12-31" },
      erstelltAm: "2026-05-10",
      zugangAm: "2026-05-14",
    },
    flaechen: { wohnflaecheMieter: 72, gesamtflaeche: 960 },
    kostenpositionen: [
      { id: "p1", bezeichnung: "Grundsteuer", kategorie: "grundsteuer", gesamtkosten: 3840, umlageschluessel: wf(), anteilMieter: 288 },
      { id: "p2", bezeichnung: "Wasserversorgung", kategorie: "wasser", gesamtkosten: 5200, umlageschluessel: { typ: "personen", anteilEinheit: 2, anteilGesamt: 26 }, anteilMieter: 400 },
      { id: "p3", bezeichnung: "Entwässerung", kategorie: "entwaesserung", gesamtkosten: 3900, umlageschluessel: { typ: "personen", anteilEinheit: 2, anteilGesamt: 26 }, anteilMieter: 300 },
      { id: "p4", bezeichnung: "Müllabfuhr", kategorie: "strassenreinigung_muell", gesamtkosten: 2880, umlageschluessel: { typ: "einheiten", anteilEinheit: 1, anteilGesamt: 12 }, anteilMieter: 240 },
      { id: "p5", bezeichnung: "Hausreinigung", kategorie: "gebaeudereinigung_ungeziefer", gesamtkosten: 2400, umlageschluessel: wf(), anteilMieter: 180 },
      { id: "p6", bezeichnung: "Gartenpflege", kategorie: "gartenpflege", gesamtkosten: 1600, umlageschluessel: wf(), anteilMieter: 120 },
      { id: "p7", bezeichnung: "Allgemeinstrom", kategorie: "beleuchtung", gesamtkosten: 640, umlageschluessel: wf(), anteilMieter: 48 },
      { id: "p8", bezeichnung: "Gebäudeversicherung", kategorie: "versicherung", gesamtkosten: 4480, umlageschluessel: wf(), anteilMieter: 336 },
      { id: "p9", bezeichnung: "Hauswart", kategorie: "hauswart", gesamtkosten: 3200, umlageschluessel: wf(), anteilMieter: 240 },
    ],
    heizkosten: { gesamtkosten: 13_100, verbrauchsanteilProzent: 70, verbrauchErfasst: true, anteilMieter: 980 },
    vorauszahlungen: 3000,
    ausgewiesen: { summeKostenMieter: 3132, saldo: 132 },
    vorjahr: {
      kostenpositionen: [
        { kategorie: "grundsteuer", anteilMieter: 288 },
        { kategorie: "wasser", anteilMieter: 380 },
        { kategorie: "entwaesserung", anteilMieter: 290 },
        { kategorie: "strassenreinigung_muell", anteilMieter: 230 },
        { kategorie: "gebaeudereinigung_ungeziefer", anteilMieter: 175 },
        { kategorie: "gartenpflege", anteilMieter: 115 },
        { kategorie: "beleuchtung", anteilMieter: 45 },
        { kategorie: "versicherung", anteilMieter: 310 },
        { kategorie: "hauswart", anteilMieter: 235 },
      ],
    },
  };
}

/**
 * Abrechnung mit typischen Fehlern:
 * - Verwaltungskosten umgelegt (144 €)
 * - Hausreinigung falsch berechnet (198 statt 180 €)
 * - "Dachrinnenreinigung" als sonstige Kosten, aber nicht vereinbart (36 €)
 * - Versicherung stark gestiegen (Vorjahr 250 €)
 * - Heizkosten zu 80 % nach Verbrauch verteilt
 */
export function fehlerhafteAbrechnung(): AbrechnungEingabe {
  const a = korrekteAbrechnung();
  a.kostenpositionen = a.kostenpositionen.map((p) => (p.id === "p5" ? { ...p, anteilMieter: 198 } : p));
  a.kostenpositionen.push(
    { id: "p10", bezeichnung: "Verwaltungskosten", kategorie: "verwaltung", gesamtkosten: 1920, umlageschluessel: wf(), anteilMieter: 144 },
    { id: "p11", bezeichnung: "Dachrinnenreinigung", kategorie: "sonstige", gesamtkosten: 480, umlageschluessel: wf(), anteilMieter: 36 },
  );
  a.heizkosten = { ...a.heizkosten!, verbrauchsanteilProzent: 80 };
  a.ausgewiesen = { summeKostenMieter: 3330, saldo: 330 };
  a.mietvertrag = { vereinbarteSonstigeKosten: ["Wartung Rauchwarnmelder"] };
  a.vorjahr!.kostenpositionen = a.vorjahr!.kostenpositionen.map((p) =>
    p.kategorie === "versicherung" ? { ...p, anteilMieter: 250 } : p,
  );
  return a;
}
