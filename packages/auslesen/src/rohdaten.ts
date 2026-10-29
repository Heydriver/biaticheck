import { KOSTENKATEGORIEN, type Kostenkategorie } from "@biaticheck/pruefkern";
import { z } from "zod";

/**
 * Format, in dem das Modell die Abrechnung zurückgibt (strukturierte Ausgabe).
 *
 * Bewusst flach und mit `nullable` statt optionalen Feldern: Jede Angabe muss
 * aktiv gesetzt werden – `null` heißt „steht nicht in den Unterlagen“.
 * Keine Felder für Namen, Adressen oder Kontodaten (Datensparsamkeit).
 */

const kategorien = Object.keys(KOSTENKATEGORIEN) as [Kostenkategorie, ...Kostenkategorie[]];
const datum = z.string().nullable().describe("Datum im Format YYYY-MM-DD oder null");
const zahl = z.number().nullable();

export const Rohposition = z.object({
  bezeichnung: z.string().describe("Bezeichnung der Kostenart genau wie in der Abrechnung"),
  kategorie: z.enum(kategorien).describe("Zuordnung zur Betriebskostenart nach § 2 BetrKV bzw. nicht umlagefähigen Kosten"),
  gesamtkosten: zahl.describe("Gesamtkosten der Abrechnungseinheit für diese Position (nach Vorwegabzug, z. B. Spalte 'Wohnungen')"),
  gesamtkostenVorVorwegabzug: zahl.describe("Gesamtkosten vor Vorwegabzug (z. B. Spalte 'alle'), nur wenn abweichend ausgewiesen"),
  schluesselTyp: z
    .enum(["wohnflaeche", "personen", "einheiten", "verbrauch", "miteigentumsanteil", "direkt", "sonstig"])
    .nullable(),
  anteilEinheit: zahl.describe("Anteil der Wohnung am Verteilerschlüssel, z. B. 84,28 (m²) oder 1 (Einheit)"),
  anteilGesamt: zahl.describe("Gesamtmenge des Verteilerschlüssels, z. B. 3187,97 (m²) oder 42 (Einheiten)"),
  anteilMieter: z.number().describe("Auf die Wohnung entfallender Betrag in Euro"),
  steuerlich35a: z.enum(["haushaltsnah", "handwerker"]).nullable(),
  seite: z.number().int().nullable().describe("Seitennummer im hochgeladenen Dokument (1-basiert)"),
  quelle: z.enum(["betriebskostenabrechnung", "heizkostenabrechnung"]),
});
export type Rohposition = z.infer<typeof Rohposition>;

export const Rohdaten = z.object({
  istNebenkostenabrechnung: z.boolean().describe("false, wenn das Dokument keine Betriebs-/Nebenkostenabrechnung ist"),
  abrechnungszeitraumVon: datum,
  abrechnungszeitraumBis: datum,
  nutzungszeitraumVon: datum,
  nutzungszeitraumBis: datum,
  erstelltAm: datum.describe("Datum des Abrechnungsschreibens"),
  wohnung: z.string().nullable().describe("Lage der Wohnung im Haus, z. B. 'EG links' – keine Straße, keine Namen"),
  geschoss: z.number().int().nullable().describe("0 = Erdgeschoss, 1 = 1. OG, -1 = Souterrain"),
  wohnflaecheMieter: zahl,
  gesamtflaeche: zahl,
  kostenpositionen: z.array(Rohposition),
  heizkosten: z
    .object({
      gesamtkosten: zahl.describe("Insgesamt zu verteilende Heiz- und Warmwasserkosten des Hauses"),
      verbrauchsanteilProzent: zahl.describe("Anteil der Heizkosten, der nach Verbrauch verteilt wird, z. B. 70"),
      verbrauchErfasst: z.boolean().nullable(),
      anteilMieter: z.number().describe("Heiz- und Warmwasserkosten der Wohnung OHNE Kaltwasser und ohne Positionen, die bereits in kostenpositionen stehen"),
      flaecheMieter: zahl.describe("Beheizte Fläche der Wohnung laut Heizkostenabrechnung"),
      gesamtflaeche: zahl.describe("Beheizte Gesamtfläche laut Heizkostenabrechnung"),
      warmwasserKostenGesamt: zahl,
      warmwasserVerbrauchM3: zahl.describe("Gesamtverbrauch Warmwasser des Hauses in m³"),
      warmwasserEnergieKwh: zahl,
      co2EmissionKg: zahl,
      co2FlaecheM2: zahl,
      co2KostenGesamt: zahl,
      co2Vermieteranteil: zahl.describe("Vom Vermieter getragener CO₂-Kostenanteil des Hauses in Euro"),
    })
    .nullable(),
  vorauszahlungenGesamt: zahl,
  vorauszahlungenBetriebskosten: zahl,
  vorauszahlungenHeizkosten: zahl,
  monatlicheVorauszahlungBetriebskosten: zahl.describe("Bisherige monatliche Vorauszahlung laut Schreiben"),
  monatlicheVorauszahlungHeizkosten: zahl,
  summeKostenMieter: zahl.describe("Summe aller Kosten der Wohnung laut Abrechnung"),
  saldo: zahl.describe("Abrechnungsergebnis: positiv = Nachzahlung des Mieters, negativ = Guthaben"),
  unsicherheiten: z.array(z.string()).describe("Angaben, die unleserlich, mehrdeutig oder widersprüchlich waren"),
});
export type Rohdaten = z.infer<typeof Rohdaten>;
