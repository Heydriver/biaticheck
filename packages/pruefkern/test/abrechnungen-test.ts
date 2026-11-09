import type { AbrechnungEingabe } from "../src/index";

/**
 * Regressionsfälle aus dem Test „Abrechnung 01–03“.
 *
 * Nachgebaut aus den Angaben im Testbericht (die Original-PDFs liegen nicht im Repository).
 * Vorgegeben und exakt übernommen: Aufzug 1.500,00 € / 75 von 750 m² / 150,00 €, die Erläuterung zu
 * Hauswart und Aufzug, Niederschlagswasser nach Wohnfläche, Kosten 3.026,95 € bei 75 m² (Guthaben 93,05 €),
 * PLZ 04275, Rauchwarnmelder-Miete 12,00 € (Guthaben 63,05 € → 75,05 €), Heizungsgrundkosten auf 650 statt
 * 750 m² (Korrektur 40,31 €, Nachforderung 67,26 € → 26,95 €). Alle übrigen Positionen sind so gewählt,
 * dass Summen und Ergebnisse aufgehen.
 */

const wf = { typ: "wohnflaeche" as const, anteilEinheit: 75, anteilGesamt: 750 };

/** Abrechnung 01: 2024, 75 m² in 750 m², Kosten 3.026,95 €, Vorauszahlungen 3.120,00 €, Guthaben 93,05 €. */
export function abrechnung01(): AbrechnungEingabe {
  return {
    meta: {
      abrechnungszeitraum: { von: "2024-01-01", bis: "2024-12-31" },
      erstelltAm: "2025-06-16",
      zugangAm: "2025-06-20",
      plz: "04275",
    },
    flaechen: { wohnflaecheMieter: 75, gesamtflaeche: 750 },
    ausstattung: { wasserzaehler: true },
    erlaeuterungen: [{ text: "Hauswart und Aufzug enthalten keine Verwaltungs-, Reparatur- oder Instandsetzungskosten.", seite: 2 }],
    kostenpositionen: [
      { id: "k01", bezeichnung: "Grundsteuer", kategorie: "grundsteuer", gesamtkosten: 1800, umlageschluessel: wf, anteilMieter: 180 },
      { id: "k02", bezeichnung: "Frischwasser", kategorie: "wasser", gesamtkosten: 3100, umlageschluessel: { typ: "verbrauch", anteilEinheit: 62, anteilGesamt: 620 }, anteilMieter: 310 },
      { id: "k03", bezeichnung: "Schmutzwasser", kategorie: "entwaesserung", gesamtkosten: 2600, umlageschluessel: { typ: "verbrauch", anteilEinheit: 62, anteilGesamt: 620 }, anteilMieter: 260 },
      { id: "k04", bezeichnung: "Niederschlagswasser", kategorie: "entwaesserung", gesamtkosten: 900, umlageschluessel: wf, anteilMieter: 90 },
      { id: "k05", bezeichnung: "Müllabfuhr", kategorie: "strassenreinigung_muell", gesamtkosten: 1400, umlageschluessel: wf, anteilMieter: 140 },
      { id: "k06", bezeichnung: "Hausreinigung", kategorie: "gebaeudereinigung_ungeziefer", gesamtkosten: 1600, umlageschluessel: wf, anteilMieter: 160 },
      { id: "k07", bezeichnung: "Gartenpflege", kategorie: "gartenpflege", gesamtkosten: 700, umlageschluessel: wf, anteilMieter: 70 },
      { id: "k08", bezeichnung: "Allgemeinstrom", kategorie: "beleuchtung", gesamtkosten: 450, umlageschluessel: wf, anteilMieter: 45 },
      { id: "k09", bezeichnung: "Gebäudeversicherung", kategorie: "versicherung", gesamtkosten: 2300, umlageschluessel: wf, anteilMieter: 230 },
      { id: "k10", bezeichnung: "Hauswart", kategorie: "hauswart", gesamtkosten: 1900, umlageschluessel: wf, anteilMieter: 190 },
      { id: "k11", bezeichnung: "Aufzug: Betrieb, Wartung und Prüfung", kategorie: "aufzug", gesamtkosten: 1500, umlageschluessel: wf, anteilMieter: 150 },
    ],
    heizkosten: { gesamtkosten: 12019.5, verbrauchsanteilProzent: 70, verbrauchErfasst: true, anteilMieter: 1201.95, flaecheMieter: 75, gesamtflaeche: 750 },
    vorauszahlungen: 3120,
    ausgewiesen: { summeKostenMieter: 3026.95, saldo: -93.05 },
  };
}

/** Abrechnung 02: wie 01, zusätzlich Rauchwarnmelderservice (Miete 120 € + Wartung 180 € im Haus). Guthaben 63,05 €. */
export function abrechnung02(): AbrechnungEingabe {
  const a = abrechnung01();
  a.kostenpositionen.push({
    id: "k12",
    bezeichnung: "Rauchwarnmelderservice",
    kategorie: "sonstige",
    gesamtkosten: 300,
    umlageschluessel: wf,
    anteilMieter: 30,
    bestandteile: [
      { bezeichnung: "Gerätemiete Rauchwarnmelder", betrag: 120 },
      { bezeichnung: "Wartung und Funktionsprüfung", betrag: 180 },
    ],
  });
  a.ausgewiesen = { summeKostenMieter: 3056.95, saldo: -63.05 };
  return a;
}

/**
 * Abrechnung 03: Heizkosten als Positionen. Grundkosten (30 %) auf 650 statt 750 m² verteilt, obwohl die
 * Heizkostenabrechnung 750 m² beheizte Fläche ausweist. Nachforderung 67,26 €.
 */
export function abrechnung03(): AbrechnungEingabe {
  const a = abrechnung01();
  a.kostenpositionen.push(
    { id: "h1", bezeichnung: "Heizung Grundkosten (30 %)", kategorie: "heizung", gesamtkosten: 2620.2, umlageschluessel: { typ: "wohnflaeche", anteilEinheit: 75, anteilGesamt: 650 }, anteilMieter: 302.33 },
    { id: "h2", bezeichnung: "Heizung Verbrauchskosten (70 %)", kategorie: "heizung", gesamtkosten: 6113.8, umlageschluessel: { typ: "verbrauch", anteilEinheit: 10599.3, anteilGesamt: 61138 }, anteilMieter: 1059.93 },
  );
  a.heizkosten = { gesamtkosten: 8734, verbrauchsanteilProzent: 70, verbrauchErfasst: true, anteilMieter: 1362.26, inKostenpositionenEnthalten: true, flaecheMieter: 75, gesamtflaeche: 750 };
  a.ausgewiesen = { summeKostenMieter: 3187.26, saldo: 67.26 };
  return a;
}
