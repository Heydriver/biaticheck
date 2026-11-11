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
  unterart: z
    .enum(["frischwasser", "schmutzwasser", "niederschlagswasser", "wasser_abwasser"])
    .nullable()
    .describe("Nur bei Wasser/Entwässerung: Frischwasser, Schmutzwasser, Niederschlagswasser (Regen-/Oberflächenwasser) oder wasser_abwasser, wenn die Position mehreres zusammenfasst oder unklar ist; sonst null"),
  bestandteile: z
    .array(z.object({ bezeichnung: z.string(), betrag: z.number().describe("Betrag für das ganze Haus in Euro") }))
    .describe("Aufschlüsselung der Position, wenn die Abrechnung oder eine Anlage sie ausweist (z. B. Wartung 1.100,00 / Reparatur 400,00 oder Gerätemiete / Wartung); sonst leere Liste"),
  hinweise: z.array(z.string()).describe("Fußnoten, Erläuterungen und Leistungsnachweise (was genau gemacht wurde), die sich ausdrücklich nur auf diese Position beziehen, wörtlich; sonst leere Liste"),
  belegnummer: z.string().nullable().describe("Rechnungs- oder Belegnummer, die die Abrechnung oder eine Anlage zu dieser Position nennt; sonst null"),
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
  plz: z.string().nullable().describe("Postleitzahl des abgerechneten Objekts (5 Ziffern), nicht die des Vermieters"),
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
      verbrauchMieter: zahl.describe("Abgerechneter Wärmeverbrauch der Wohnung, z. B. in kWh oder Einheiten"),
      verbrauchskostenMieter: zahl.describe("Verbrauchskostenanteil der Wohnung für Heizung in Euro (ohne Grundkosten)"),
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
  gezahlteVorauszahlungenBetriebskosten: zahl.describe("Tatsächlich gezahlte Betriebskostenvorauszahlungen laut Buchungsübersicht, Zahlungsaufstellung oder Mietkonto IM DOKUMENT – nur wenn dort getrennt von den angerechneten Vorauszahlungen ausgewiesen; sonst null"),
  gezahlteVorauszahlungenHeizkosten: zahl.describe("Wie oben, für Heizkosten"),
  gezahlteVorauszahlungenGesamt: zahl.describe("Wie oben, Gesamtsumme aller gezahlten Vorauszahlungen"),
  gezahlteVorauszahlungenSeite: z.number().int().nullable().describe("Seite der Buchungsübersicht"),
  monatlicheVorauszahlungBetriebskosten: zahl.describe("Bisherige monatliche Vorauszahlung laut Schreiben"),
  monatlicheVorauszahlungHeizkosten: zahl,
  summeKostenMieter: zahl.describe("Summe aller Kosten der Wohnung laut Abrechnung"),
  saldo: zahl.describe("Abrechnungsergebnis: positiv = Nachzahlung des Mieters, negativ = Guthaben"),
  zaehler: z
    .array(
      z.object({
        art: z.enum(["kaltwasser", "warmwasser", "heizung", "strom", "sonstig"]),
        bezeichnung: z.string().nullable().describe("z. B. Zählernummer oder Raum"),
        anfang: z.number().describe("Anfangsstand"),
        ende: z.number().describe("Endstand"),
        verbrauchUebernommen: z.number().nullable().describe("Verbrauch, den die Abrechnung für diesen Zähler ansetzt – so wie er dort steht, auch wenn er nicht Endstand minus Anfangsstand entspricht; sonst null"),
        faktor: z.number().nullable().describe("Umrechnungsfaktor, mit dem die Abrechnung rechnet; sonst null"),
        faktorLautProtokoll: z.number().nullable().describe("Umrechnungsfaktor laut Geräte- oder Ableseprotokoll; sonst null"),
        seite: z.number().int().nullable(),
      }),
    )
    .describe("Zählerstände der Wohnung laut Abrechnung oder Ableseprotokoll; sonst leere Liste"),
  belege: z
    .array(
      z.object({
        positionBezeichnung: z.string().describe("Bezeichnung der Kostenposition genau wie in kostenpositionen, oder \"Heizkosten\""),
        bezeichnung: z.string().describe("Art des Belegs und Leistung, z. B. \"Rechnung Gartenpflege\" – ohne Namen"),
        art: z.enum(["rechnung", "gutschrift"]),
        betrag: z.number().describe("Bruttobetrag laut Beleg, positiv (auch bei Gutschriften)"),
        uebernommen: z.number().nullable().describe("Betrag, den die Abrechnung aus diesem Beleg ansetzt, falls erkennbar – so wie er dort steht; sonst null"),
        objekt: z.string().nullable().describe("Objekt oder Ort, für den der Beleg ausgestellt ist, ohne Namen; sonst null"),
        fremdesObjekt: z.boolean().describe("true nur, wenn der Beleg ausdrücklich ein anderes Haus oder Objekt betrifft als das abgerechnete"),
        beruecksichtigt: z.boolean().nullable().describe("Nur bei Gutschriften: true, wenn die Abrechnung sie erkennbar abzieht; false, wenn erkennbar nicht; sonst null"),
        seite: z.number().int().nullable(),
      }),
    )
    .describe("Beigefügte oder aufgelistete Rechnungen und Gutschriften (Belegliste, Anlagen); sonst leere Liste"),
  erlaeuterungen: z
    .array(z.object({ text: z.string().describe("Wörtlich, ohne Namen oder Adressen"), seite: z.number().int().nullable() }))
    .describe("Erläuterungen, Fußnoten und Anmerkungen der Abrechnung und ihrer Anlagen, die mehrere Positionen oder die ganze Abrechnung betreffen (z. B. „Hauswart und Aufzug enthalten keine Reparaturkosten.“), wörtlich"),
  unsicherheiten: z.array(z.string()).describe("Angaben, die unleserlich, mehrdeutig oder widersprüchlich waren"),
});
export type Rohdaten = z.infer<typeof Rohdaten>;
