import { z } from "zod";
import { Rohdaten } from "../../packages/auslesen/src/rohdaten";
import { SYSTEM_PROMPT } from "../../packages/auslesen/src/prompt";
import { wandleUm } from "../../packages/auslesen/src/umwandlung";
import { pruefeKonsistenz } from "../../packages/auslesen/src/konsistenz";
import { erstelleStufe1, erstelleStufe2, pruefeAbrechnung, wendeAntwortAn, AntwortFehler, personalisiereAnschreiben } from "../../packages/pruefkern/src/index";

export { personalisiereAnschreiben };
export const ANWEISUNG = SYSTEM_PROMPT;
export const SCHEMA = JSON.stringify(z.toJSONSchema(Rohdaten));

/** Rohausgabe des Modells → geprüftes Ergebnis (Stufe 1 und 2). */
type Verlauf = { ab: string; betriebskosten?: number; heizkosten?: number }[];

export function werteAus(
  rohJson: unknown,
  heute: string,
  antworten: Record<string, unknown> = {},
  mietvertrag?: { pauschaleVereinbart?: boolean; vereinbarteSonstigeKosten?: string[]; aufzugAusgenommen?: boolean },
  vorauszahlungen?: { verlauf: Verlauf; quelle: "vorjahresabrechnung" | "kontoauszug" | "kunde" },
) {
  const roh = Rohdaten.safeParse(rohJson);
  if (!roh.success) return { fehler: "format", details: roh.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) };
  if (!roh.data.istNebenkostenabrechnung) return { fehler: "keine_abrechnung" };
  let { abrechnung, hinweise } = wandleUm(roh.data);
  const konsistenz = pruefeKonsistenz(abrechnung);
  if (mietvertrag) abrechnung = { ...abrechnung, mietvertrag: { ...abrechnung.mietvertrag, ...mietvertrag } };
  if (vorauszahlungen?.verlauf.length)
    abrechnung = { ...abrechnung, vorauszahlungenDetail: { ...abrechnung.vorauszahlungenDetail, verlauf: vorauszahlungen.verlauf, verlaufQuelle: vorauszahlungen.quelle } };
  for (const [feld, wert] of Object.entries(antworten)) {
    try { abrechnung = wendeAntwortAn(abrechnung, feld, wert, heute); }
    catch (e) { if (e instanceof AntwortFehler) return { fehler: "antwort", meldung: e.fuerKunden ? e.message : "Die Angabe ist ungültig.", feld }; throw e; }
  }
  const bericht = pruefeAbrechnung(abrechnung, { heute });
  const s1 = erstelleStufe1(bericht, abrechnung, { heute });
  const s2 = erstelleStufe2(bericht, abrechnung, s1);
  return { s1, s2, konsistenz, hinweise, positionen: abrechnung.kostenpositionen.map((p) => ({ name: p.bezeichnung, betrag: p.anteilMieter })), heizkosten: abrechnung.heizkosten?.anteilMieter ?? null, plz: abrechnung.meta.plz ?? null, zeitraum: abrechnung.meta.abrechnungszeitraum ?? null };
}
