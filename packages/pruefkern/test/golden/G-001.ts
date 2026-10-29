import type { AbrechnungEingabe } from "../../src/index";

/**
 * G-001 – Großvermieter München, Abrechnungsjahr 2024, EG-Wohnung 84,28 m².
 * Betriebskostenabrechnung des Vermieters + Heizkostenabrechnung eines Messdienstes (inkl. Kaltwasser).
 * Anonymisiert: keine Namen, Adressen, Vertrags- oder Kontonummern.
 * Protokoll der Musterprüfung: docs/musterpruefung/G-001.md
 */
const wf = { typ: "wohnflaeche" as const, anteilEinheit: 84.28, anteilGesamt: 3187.97 };
const je = { typ: "einheiten" as const, anteilEinheit: 1, anteilGesamt: 42 };
const kw = { typ: "verbrauch" as const, anteilEinheit: 124.8, anteilGesamt: 2669.3 };

export const G001: AbrechnungEingabe = {
  meta: {
    objektAdresse: "anonymisiert (München)",
    wohnung: "EG links",
    geschoss: 0,
    abrechnungszeitraum: { von: "2024-01-01", bis: "2024-12-31" },
    nutzungszeitraum: { von: "2024-01-01", bis: "2024-12-31" },
    erstelltAm: "2025-11-25",
  },
  flaechen: { wohnflaecheMieter: 84.28, gesamtflaeche: 3187.97 },
  kostenpositionen: [
    { id: "bk01", bezeichnung: "Grundsteuer", kategorie: "grundsteuer", gesamtkostenVorVorwegabzug: 10827.05, gesamtkosten: 9729.3, umlageschluessel: wf, anteilMieter: 257.21, fundstelle: { seite: 5 } },
    { id: "bk02", bezeichnung: "Strassenreinigung Privat", kategorie: "strassenreinigung_muell", gesamtkosten: 2053.14, umlageschluessel: wf, anteilMieter: 54.28, steuerlich35a: "haushaltsnah", fundstelle: { seite: 5 } },
    { id: "bk03", bezeichnung: "Müllentsorgung", kategorie: "strassenreinigung_muell", gesamtkosten: 11622, umlageschluessel: wf, anteilMieter: 307.25, fundstelle: { seite: 5 } },
    { id: "bk04", bezeichnung: "Gebäude-Versicherung", kategorie: "versicherung", gesamtkosten: 7380.68, umlageschluessel: wf, anteilMieter: 195.12, fundstelle: { seite: 5 } },
    { id: "bk05", bezeichnung: "Haftpflicht-Versicherung", kategorie: "versicherung", gesamtkosten: 151.75, umlageschluessel: wf, anteilMieter: 4.01, fundstelle: { seite: 5 } },
    { id: "bk06", bezeichnung: "Dachrinnenreinigung", kategorie: "sonstige", gesamtkosten: 559.38, umlageschluessel: wf, anteilMieter: 14.79, steuerlich35a: "haushaltsnah", fundstelle: { seite: 5 } },
    { id: "bk07", bezeichnung: "Sonstige Betriebskosten", kategorie: "sonstige", gesamtkosten: 17.85, umlageschluessel: wf, anteilMieter: 0.48, fundstelle: { seite: 5 } },
    { id: "bk08", bezeichnung: "Hausmeisterkosten", kategorie: "hauswart", gesamtkosten: 11498.88, umlageschluessel: wf, anteilMieter: 303.99, steuerlich35a: "haushaltsnah", fundstelle: { seite: 5 } },
    { id: "bk09", bezeichnung: "Gartenpflege Material", kategorie: "gartenpflege", gesamtkosten: 24.5, umlageschluessel: wf, anteilMieter: 0.65, fundstelle: { seite: 5 } },
    { id: "bk10", bezeichnung: "Gartenpflege Lohn", kategorie: "gartenpflege", gesamtkosten: 1059.48, umlageschluessel: wf, anteilMieter: 28.01, steuerlich35a: "haushaltsnah", fundstelle: { seite: 5 } },
    { id: "bk11", bezeichnung: "Stromkosten", kategorie: "beleuchtung", gesamtkostenVorVorwegabzug: 4992.71, gesamtkosten: 2429.68, umlageschluessel: wf, anteilMieter: 64.24, fundstelle: { seite: 5 } },
    // Abrechnung nennt als Gesamteinheiten "20,89 ST", der Betrag entspricht aber 1.134,00 / 42 Einheiten (Umlegungsgröße 3).
    { id: "bk12", bezeichnung: "Satellitenanlage", kategorie: "antenne_kabel", gesamtkosten: 1134, umlageschluessel: je, anteilMieter: 27, fundstelle: { seite: 5 } },
    { id: "bk13", bezeichnung: "Treppenhausreinigung", kategorie: "gebaeudereinigung_ungeziefer", gesamtkosten: 4241.88, umlageschluessel: je, anteilMieter: 101, steuerlich35a: "haushaltsnah", fundstelle: { seite: 5 } },
    { id: "bk14", bezeichnung: "Aufzugskosten", kategorie: "aufzug", gesamtkosten: 1606.41, umlageschluessel: wf, anteilMieter: 42.47, fundstelle: { seite: 5 } },
    { id: "bk15", bezeichnung: "Aufzugskosten Lohn", kategorie: "aufzug", gesamtkosten: 829.82, umlageschluessel: wf, anteilMieter: 21.93, steuerlich35a: "haushaltsnah", fundstelle: { seite: 5 } },
    { id: "bk16", bezeichnung: "Aufzugskosten Prüf./Wart.", kategorie: "aufzug", gesamtkosten: 4991.51, umlageschluessel: wf, anteilMieter: 131.96, steuerlich35a: "handwerker", fundstelle: { seite: 5 } },
    // Kaltwasser wird über die Heizkostenabrechnung des Messdienstes verteilt.
    { id: "hk01", bezeichnung: "Frischwasser für Kaltwasser", kategorie: "wasser", gesamtkosten: 4805, umlageschluessel: kw, anteilMieter: 224.65, fundstelle: { seite: 8 } },
    { id: "hk02", bezeichnung: "Abwasser für Kaltwasser", kategorie: "entwaesserung", gesamtkosten: 4855.86, umlageschluessel: kw, anteilMieter: 227.03, fundstelle: { seite: 8 } },
    { id: "hk03", bezeichnung: "Mietservice Kaltwasserzähler", kategorie: "wasser", gesamtkosten: 1106.7, umlageschluessel: kw, anteilMieter: 51.74, fundstelle: { seite: 8 } },
  ],
  heizkosten: {
    gesamtkosten: 53979.37,
    verbrauchsanteilProzent: 70,
    verbrauchErfasst: true,
    // Heizung 190,92 + 592,61; Warmwasser 236,69 + 839,18
    anteilMieter: 1859.4,
    flaecheMieter: 82.19,
    gesamtflaeche: 3117.23,
    warmwasser: { kostenGesamt: 29843.11, verbrauchGesamtM3: 958.4, energieKwh: 99540 },
    co2: { emissionKg: 47934, flaecheM2: 3187.97, kostenGesamt: 4581.64, vermieteranteil: 458.16 },
  },
  vorauszahlungen: 2702.33,
  vorauszahlungenDetail: {
    betriebskosten: 1525.92,
    heizkosten: 1176.41,
    monatlich: { betriebskosten: 127.16, heizkosten: 199.94 },
  },
  ausgewiesen: { summeKostenMieter: 3917.21, saldo: 1214.88 },
};
