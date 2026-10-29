import { z } from "zod";

/**
 * Datenschema einer Nebenkostenabrechnung.
 *
 * Dieses Schema ist der Vertrag zwischen Auslesen (KI/OCR), Prüfkern und
 * Prüfbereich. Alle Beträge in Euro, alle Datumsangaben als ISO-String (YYYY-MM-DD).
 * Felder sind optional, wenn sie in echten Abrechnungen häufig fehlen – fehlende
 * Angaben führen im Prüfkern zu "nicht prüfbar", nicht zu Fehlern.
 */

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD");
const betrag = z.number().finite();

export const Zeitraum = z.object({ von: datum, bis: datum });
export type Zeitraum = z.infer<typeof Zeitraum>;

/** Betriebskostenarten nach § 2 BetrKV plus Sammelkategorien für nicht umlagefähige Kosten. */
export const KOSTENKATEGORIEN = {
  grundsteuer: "§ 2 Nr. 1 – Grundsteuer",
  wasser: "§ 2 Nr. 2 – Wasserversorgung",
  entwaesserung: "§ 2 Nr. 3 – Entwässerung",
  heizung: "§ 2 Nr. 4 – Heizung",
  warmwasser: "§ 2 Nr. 5 – Warmwasser",
  verbundene_anlagen: "§ 2 Nr. 6 – Verbundene Heizungs- und Warmwasseranlagen",
  aufzug: "§ 2 Nr. 7 – Aufzug",
  strassenreinigung_muell: "§ 2 Nr. 8 – Straßenreinigung und Müllbeseitigung",
  gebaeudereinigung_ungeziefer: "§ 2 Nr. 9 – Gebäudereinigung und Ungezieferbekämpfung",
  gartenpflege: "§ 2 Nr. 10 – Gartenpflege",
  beleuchtung: "§ 2 Nr. 11 – Beleuchtung (Allgemeinstrom)",
  schornsteinreinigung: "§ 2 Nr. 12 – Schornsteinreinigung",
  versicherung: "§ 2 Nr. 13 – Sach- und Haftpflichtversicherung",
  hauswart: "§ 2 Nr. 14 – Hauswart",
  antenne_kabel: "§ 2 Nr. 15 – Gemeinschaftsantenne / Breitbandnetz",
  waeschepflege: "§ 2 Nr. 16 – Einrichtungen der Wäschepflege",
  sonstige: "§ 2 Nr. 17 – Sonstige Betriebskosten",
  verwaltung: "Verwaltungskosten (nicht umlagefähig)",
  instandhaltung: "Instandhaltung / Reparaturen (nicht umlagefähig)",
  ruecklage: "Instandhaltungsrücklage (nicht umlagefähig)",
  bank_porto: "Bank-, Konto- und Portogebühren (nicht umlagefähig)",
  unbekannt: "Nicht zugeordnet",
} as const;

export type Kostenkategorie = keyof typeof KOSTENKATEGORIEN;
export const Kostenkategorie = z.enum(
  Object.keys(KOSTENKATEGORIEN) as [Kostenkategorie, ...Kostenkategorie[]],
);

export const NICHT_UMLAGEFAEHIG: readonly Kostenkategorie[] = [
  "verwaltung",
  "instandhaltung",
  "ruecklage",
  "bank_porto",
];

export const Umlageschluessel = z.object({
  typ: z.enum([
    "wohnflaeche",
    "personen",
    "einheiten",
    "verbrauch",
    "miteigentumsanteil",
    "direkt",
    "sonstig",
  ]),
  /** Anteil der Mieterwohnung, z. B. 72 (m²), 2 (Personen), 1 (Einheit). */
  anteilEinheit: z.number().nonnegative().optional(),
  /** Gesamtmenge im Haus, z. B. 840 (m²), 24 (Personen), 12 (Einheiten). */
  anteilGesamt: z.number().positive().optional(),
});
export type Umlageschluessel = z.infer<typeof Umlageschluessel>;

/** Verweis auf die Stelle im Original-PDF, aus der ein Wert stammt. */
export const Fundstelle = z.object({
  seite: z.number().int().positive(),
  text: z.string().optional(),
});

export const Kostenposition = z.object({
  id: z.string(),
  /** Bezeichnung wie in der Abrechnung, z. B. "Müllabfuhr". */
  bezeichnung: z.string(),
  kategorie: Kostenkategorie,
  /** Gesamtkosten des Hauses/der Abrechnungseinheit für diese Position (nach Vorwegabzug). */
  gesamtkosten: betrag.optional(),
  /** Gesamtkosten vor Vorwegabzug (z. B. inkl. Gewerbe), falls ausgewiesen. */
  gesamtkostenVorVorwegabzug: betrag.optional(),
  /** Kennzeichnung nach § 35a EStG in der Abrechnung. */
  steuerlich35a: z.enum(["haushaltsnah", "handwerker"]).optional(),
  umlageschluessel: Umlageschluessel.optional(),
  /** Auf die Mieterwohnung entfallender Betrag laut Abrechnung. */
  anteilMieter: betrag,
  fundstelle: Fundstelle.optional(),
});
export type Kostenposition = z.infer<typeof Kostenposition>;

export const Heizkosten = z.object({
  /** Gesamte Heiz-/Warmwasserkosten des Hauses. */
  gesamtkosten: betrag.optional(),
  /** Anteil der Kosten, der nach Verbrauch verteilt wird (in Prozent, z. B. 70). */
  verbrauchsanteilProzent: z.number().min(0).max(100).optional(),
  /** Wurde der Verbrauch der Wohnung tatsächlich erfasst (Zähler/Heizkostenverteiler)? */
  verbrauchErfasst: z.boolean().optional(),
  /** Auf die Wohnung entfallende Heizkosten laut (Heizkosten-)Abrechnung. */
  anteilMieter: betrag,
  /** Ist der Heizkostenanteil bereits als Kostenposition in `kostenpositionen` enthalten? */
  inKostenpositionenEnthalten: z.boolean().default(false),
  /** Beheizte Fläche der Wohnung bzw. des Hauses laut Heizkostenabrechnung. */
  flaecheMieter: z.number().positive().optional(),
  gesamtflaeche: z.number().positive().optional(),
  warmwasser: z
    .object({
      /** Gesamtkosten Warmwasser des Hauses. */
      kostenGesamt: betrag.optional(),
      /** Gesamtverbrauch Warmwasser des Hauses in m³. */
      verbrauchGesamtM3: z.number().positive().optional(),
      /** Für Warmwasser aufgewendete Wärmemenge in kWh. */
      energieKwh: z.number().positive().optional(),
    })
    .optional(),
  /** Angaben zur Aufteilung der CO₂-Kosten nach CO2KostAufG. */
  co2: z
    .object({
      emissionKg: z.number().nonnegative(),
      /** Gesamtwohnfläche, auf die sich die Emission bezieht. */
      flaecheM2: z.number().positive(),
      kostenGesamt: betrag,
      /** Vom Vermieter getragener Anteil in Euro laut Abrechnung. */
      vermieteranteil: betrag,
    })
    .optional(),
});
export type Heizkosten = z.infer<typeof Heizkosten>;

export const Abrechnung = z.object({
  meta: z.object({
    objektAdresse: z.string().optional(),
    wohnung: z.string().optional(),
    /** Geschoss der Wohnung: 0 = Erdgeschoss, -1 = Souterrain, 1 = 1. OG … */
    geschoss: z.number().int().optional(),
    vermieter: z.string().optional(),
    mieter: z.string().optional(),
    abrechnungszeitraum: Zeitraum.optional(),
    /** Falls der Mieter nur einen Teil des Zeitraums gewohnt hat (Ein-/Auszug). */
    nutzungszeitraum: Zeitraum.optional(),
    /** Datum, das auf der Abrechnung steht. */
    erstelltAm: datum.optional(),
    /** Datum, an dem die Abrechnung beim Mieter angekommen ist (meist Angabe des Kunden). */
    zugangAm: datum.optional(),
  }),
  flaechen: z
    .object({
      wohnflaecheMieter: z.number().positive().optional(),
      gesamtflaeche: z.number().positive().optional(),
    })
    .default({}),
  kostenpositionen: z.array(Kostenposition),
  heizkosten: Heizkosten.optional(),
  /** Summe der geleisteten Vorauszahlungen im Abrechnungszeitraum. */
  vorauszahlungen: betrag.optional(),
  /** Aufschlüsselung der Vorauszahlungen, soweit die Abrechnung sie hergibt. */
  vorauszahlungenDetail: z
    .object({
      betriebskosten: betrag.optional(),
      heizkosten: betrag.optional(),
      /** Monatliche Vorauszahlungen laut Schreiben/Mietvertrag (können vom Abrechnungsjahr abweichen). */
      monatlich: z.object({ betriebskosten: betrag.optional(), heizkosten: betrag.optional() }).optional(),
    })
    .optional(),
  /** Werte, die die Abrechnung selbst als Ergebnis ausweist. */
  ausgewiesen: z
    .object({
      /** Gesamtsumme der Kosten für die Wohnung laut Abrechnung. */
      summeKostenMieter: betrag.optional(),
      /** Positiv = Nachzahlung des Mieters, negativ = Guthaben. */
      saldo: betrag.optional(),
    })
    .default({}),
  /** Vorjahreswerte für den Vergleich (aus früherer Abrechnung des Kunden). */
  vorjahr: z
    .object({
      kostenpositionen: z.array(
        z.object({ kategorie: Kostenkategorie, bezeichnung: z.string().optional(), anteilMieter: betrag }),
      ),
    })
    .optional(),
  /** Angaben aus dem Mietvertrag, soweit bekannt (Rückfragen an den Kunden). */
  mietvertrag: z
    .object({
      /** Im Mietvertrag ausdrücklich vereinbarte "sonstige Betriebskosten" (§ 2 Nr. 17). */
      vereinbarteSonstigeKosten: z.array(z.string()).optional(),
      /** Pauschale statt Vorauszahlung vereinbart → keine Abrechnung geschuldet. */
      pauschaleVereinbart: z.boolean().optional(),
      /** Mietvertrag schließt Erdgeschosswohnungen von Aufzugskosten aus. */
      aufzugAusgenommen: z.boolean().optional(),
    })
    .optional(),
});
export type Abrechnung = z.infer<typeof Abrechnung>;
export type AbrechnungEingabe = z.input<typeof Abrechnung>;
