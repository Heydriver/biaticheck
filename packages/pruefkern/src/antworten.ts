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

export type Antworttyp = "datum" | "plz" | "betrag" | "zahl" | "janein" | "liste" | "verlauf" | "dokument";

export const ANTWORT_FELDER: Readonly<Record<string, Antworttyp>> = {
  "meta.zugangAm": "datum",
  "meta.plz": "plz",
  vorauszahlungen: "betrag",
  "vorauszahlungenDetail.monatlich.betriebskosten": "betrag",
  "vorauszahlungenDetail.monatlich.heizkosten": "betrag",
  "vorauszahlungenDetail.verlauf": "verlauf",
  "flaechen.wohnflaecheMieter": "zahl",
  "mietvertrag.vereinbarteSonstigeKosten": "liste",
  "mietvertrag.aufzugAusgenommen": "janein",
  "ausstattung.wasserzaehler": "janein",
  "ausstattung.gewerbeImHaus": "janein",
  "mietvertrag.mietbeginn": "datum",
  "mietvertrag.mietende": "datum",
  "mietvertrag.wohnflaeche": "zahl",
  // Wird beim Nachreichen der Vorjahresabrechnung gesetzt (nicht vom Kunden abgefragt).
  "meta.zeitraumBestaetigt": "janein",
  // Antwort ist ein weiteres Dokument (Upload) – wird über das Auslesen übernommen.
  heizkosten: "dokument",
  vorjahr: "dokument",
};

const WERT_SCHEMA: Record<Exclude<Antworttyp, "dokument">, z.ZodType> = {
  plz: z.string().trim().regex(/^\d{5}$/),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)), "ungültiges Datum"),
  betrag: z.number().finite().min(0).max(1_000_000),
  zahl: z.number().finite().positive().max(1_000_000),
  janein: z.boolean(),
  liste: z.array(z.string().trim().min(1).max(200)).max(50),
  verlauf: z
    .array(
      z.object({
        ab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        betriebskosten: z.number().finite().min(0).max(100_000).optional(),
        heizkosten: z.number().finite().min(0).max(100_000).optional(),
      }),
    )
    .min(1)
    .max(36),
};

export function antworttyp(feld: string): Antworttyp | undefined {
  return ANTWORT_FELDER[feld];
}

export class AntwortFehler extends Error {
  /** true: Meldung ist für den Kunden formuliert und darf angezeigt werden. */
  constructor(
    message: string,
    readonly fuerKunden = false,
  ) {
    super(message);
  }
}

/**
 * Übernimmt eine Antwort in die Abrechnung. Gibt eine neue Abrechnung zurück
 * (das Original bleibt unverändert) und prüft das Ergebnis gegen das Schema.
 */
export function wendeAntwortAn(
  eingabe: AbrechnungEingabe,
  feld: string,
  wert: unknown,
  heute: string = new Date().toISOString().slice(0, 10),
): AbrechnungEingabe {
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
  pruefePlausibilitaet(feld, ergebnis.data, heute);
  return kopie as AbrechnungEingabe;
}

/** Fachlich unmögliche Antworten mit verständlicher Meldung abweisen. */
function pruefePlausibilitaet(feld: string, a: z.infer<typeof Abrechnung>, heute: string) {
  if (feld === "meta.zugangAm" && a.meta.zugangAm) {
    if (a.meta.zugangAm > heute) throw new AntwortFehler("Das Zugangsdatum liegt in der Zukunft.", true);
    const frueheste = a.meta.erstelltAm ?? a.meta.abrechnungszeitraum?.bis;
    if (frueheste && a.meta.zugangAm < frueheste) {
      throw new AntwortFehler(
        a.meta.erstelltAm
          ? "Das Zugangsdatum liegt vor dem Datum der Abrechnung. Bitte prüfen Sie Ihre Eingabe."
          : "Das Zugangsdatum liegt vor dem Ende des Abrechnungszeitraums. Bitte prüfen Sie Ihre Eingabe.",
        true,
      );
    }
  }
}
