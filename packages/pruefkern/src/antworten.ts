import { z } from "zod";
import { Abrechnung, type AbrechnungEingabe } from "./schema";

/**
 * Antworten des Kunden auf Rückfragen.
 *
 * Jede Rückfrage einer Regel verweist mit `feld` auf einen Pfad im Datenschema.
 * Hier ist festgelegt, welche Art von Antwort dafür erwartet wird und wie sie
 * in die Abrechnung übernommen wird. Ein Test stellt sicher, dass jede
 * Rückfrage, die eine Regel stellen kann, hier registriert ist.
 */

export type Antworttyp = "datum" | "betrag" | "zahl" | "janein" | "liste" | "dokument";

export const ANTWORT_FELDER: Readonly<Record<string, Antworttyp>> = {
  "meta.zugangAm": "datum",
  vorauszahlungen: "betrag",
  "vorauszahlungenDetail.monatlich.betriebskosten": "betrag",
  "vorauszahlungenDetail.monatlich.heizkosten": "betrag",
  "flaechen.wohnflaecheMieter": "zahl",
  "mietvertrag.vereinbarteSonstigeKosten": "liste",
  "mietvertrag.aufzugAusgenommen": "janein",
  // Antwort ist ein weiteres Dokument (Upload) – wird über das Auslesen übernommen.
  heizkosten: "dokument",
  vorjahr: "dokument",
};

const WERT_SCHEMA: Record<Exclude<Antworttyp, "dokument">, z.ZodType> = {
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)), "ungültiges Datum"),
  betrag: z.number().finite().min(0).max(1_000_000),
  zahl: z.number().finite().positive().max(1_000_000),
  janein: z.boolean(),
  liste: z.array(z.string().trim().min(1).max(200)).max(50),
};

export function antworttyp(feld: string): Antworttyp | undefined {
  return ANTWORT_FELDER[feld];
}

export class AntwortFehler extends Error {}

/**
 * Übernimmt eine Antwort in die Abrechnung. Gibt eine neue Abrechnung zurück
 * (das Original bleibt unverändert) und prüft das Ergebnis gegen das Schema.
 */
export function wendeAntwortAn(eingabe: AbrechnungEingabe, feld: string, wert: unknown): AbrechnungEingabe {
  const typ = antworttyp(feld);
  if (!typ) throw new AntwortFehler(`Unbekanntes Feld: ${feld}`);
  if (typ === "dokument") throw new AntwortFehler(`Feld ${feld} wird per Dokument beantwortet`);

  const geprueft = WERT_SCHEMA[typ].safeParse(wert);
  if (!geprueft.success) throw new AntwortFehler(`Ungültiger Wert für ${feld}`);

  const kopie = structuredClone(eingabe) as Record<string, unknown>;
  const teile = feld.split(".");
  let ziel = kopie;
  for (const teil of teile.slice(0, -1)) {
    const naechstes = ziel[teil];
    if (naechstes === undefined || naechstes === null) ziel[teil] = {};
    else if (typeof naechstes !== "object" || Array.isArray(naechstes)) throw new AntwortFehler(`Pfad ${feld} ist ungültig`);
    ziel = ziel[teil] as Record<string, unknown>;
  }
  ziel[teile.at(-1)!] = geprueft.data;

  const ergebnis = Abrechnung.safeParse(kopie);
  if (!ergebnis.success) throw new AntwortFehler(`Antwort für ${feld} passt nicht zum Datenschema`);
  return kopie as AbrechnungEingabe;
}
