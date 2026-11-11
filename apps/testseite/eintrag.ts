import { z } from "zod";
import { Rohdaten } from "../../packages/auslesen/src/rohdaten";
import { SYSTEM_PROMPT } from "../../packages/auslesen/src/prompt";
import { wandleUm } from "../../packages/auslesen/src/umwandlung";
import { pruefeKonsistenz } from "../../packages/auslesen/src/konsistenz";
import { KEINE_KONTROLLE, KONTROLL_PROMPT, KontrolleRoh, protokollFuerKontrolle, werteKontrolleAus } from "../../packages/auslesen/src/kontrolle";
import { erstelleZeilenprotokoll, ALLE_REGELN, schliesstAn, erstelleStufe1, erstelleStufe2, pruefeAbrechnung, wendeAntwortAn, AntwortFehler, personalisiereAnschreiben } from "../../packages/pruefkern/src/index";

export { personalisiereAnschreiben, schliesstAn };
export const REGELN_ANZAHL = ALLE_REGELN.length;
export const ANWEISUNG = SYSTEM_PROMPT;
export const SCHEMA = JSON.stringify(z.toJSONSchema(Rohdaten));
export const KONTROLL_ANWEISUNG = KONTROLL_PROMPT;
export const KONTROLL_SCHEMA = JSON.stringify(z.toJSONSchema(KontrolleRoh));

/** Zeilenprotokoll der unveränderten Auslesung (ohne Kundenantworten) – Grundlage der KI-Kontrolle. */
function protokollVon(rohJson: unknown, heute: string) {
  const roh = Rohdaten.safeParse(ergaenze(rohJson));
  if (!roh.success || !roh.data.istNebenkostenabrechnung) return undefined;
  const { abrechnung } = wandleUm(roh.data);
  return erstelleZeilenprotokoll(pruefeAbrechnung(abrechnung, { heute }), abrechnung);
}

/** Unterschritt 2: Text des Protokolls für die Kontrollanfrage. */
export function kontrollProtokoll(rohJson: unknown, heute: string): string | undefined {
  const protokoll = protokollVon(rohJson, heute);
  return protokoll ? protokollFuerKontrolle(protokoll) : undefined;
}

/** Unterschritt 2: Antwort der KI nach festen Regeln auswerten. */
export function werteKontrolle(antwort: unknown, rohJson: unknown, heute: string) {
  const protokoll = protokollVon(rohJson, heute);
  if (!protokoll) return KEINE_KONTROLLE("keine Abrechnung");
  const gueltig = KontrolleRoh.safeParse(antwort);
  return gueltig.success ? werteKontrolleAus(gueltig.data, protokoll) : KEINE_KONTROLLE("keine gültige Antwort", protokoll.zeilen.length);
}

/** Ältere Antworten (und das Beispiel) kennen die neuen Felder noch nicht – mit leeren Werten ergänzen. */
function ergaenze(roh: unknown): unknown {
  if (!roh || typeof roh !== "object") return roh;
  const r = { zaehler: [], belege: [], erlaeuterungen: [], gezahlteVorauszahlungenBetriebskosten: null, gezahlteVorauszahlungenHeizkosten: null, gezahlteVorauszahlungenGesamt: null, gezahlteVorauszahlungenSeite: null, ...(roh as Record<string, unknown>) };
  if (Array.isArray(r.zaehler)) r.zaehler = r.zaehler.map((x: unknown) => (x && typeof x === "object" ? { bezeichnung: null, verbrauchUebernommen: null, faktor: null, faktorLautProtokoll: null, seite: null, ...(x as object) } : x));
  if (Array.isArray(r.belege)) r.belege = r.belege.map((x: unknown) => (x && typeof x === "object" ? { art: "rechnung", uebernommen: null, objekt: null, fremdesObjekt: false, beruecksichtigt: null, seite: null, ...(x as object) } : x));
  if (r.heizkosten && typeof r.heizkosten === "object") r.heizkosten = { verbrauchMieter: null, verbrauchskostenMieter: null, ...(r.heizkosten as object) };
  if (Array.isArray(r.kostenpositionen))
    r.kostenpositionen = r.kostenpositionen.map((p: unknown) => (p && typeof p === "object" ? { unterart: null, bestandteile: [], hinweise: [], belegnummer: null, ...(p as object) } : p));
  return r;
}

/** Rohausgabe des Modells → geprüftes Ergebnis (Stufe 1 und 2). */
type Verlauf = { ab: string; betriebskosten?: number; heizkosten?: number }[];

export function werteAus(
  rohJson: unknown,
  heute: string,
  antworten: Record<string, unknown> = {},
  mietvertrag?: { pauschaleVereinbart?: boolean; vereinbarteSonstigeKosten?: string[]; aufzugAusgenommen?: boolean; mietbeginn?: string; mietende?: string; wohnflaeche?: number; gewerbeImHaus?: boolean },
  vorauszahlungen?: { verlauf: Verlauf; quelle: "vorjahresabrechnung" | "kontoauszug" | "kunde" },
) {
  const roh = Rohdaten.safeParse(ergaenze(rohJson));
  if (!roh.success) return { fehler: "format", details: roh.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) };
  if (!roh.data.istNebenkostenabrechnung) return { fehler: "keine_abrechnung" };
  let { abrechnung, hinweise } = wandleUm(roh.data);
  const konsistenz = pruefeKonsistenz(abrechnung);
  if (mietvertrag) {
    const { gewerbeImHaus, ...vertrag } = mietvertrag;
    abrechnung = { ...abrechnung, mietvertrag: { ...abrechnung.mietvertrag, ...vertrag } };
    if (gewerbeImHaus) abrechnung = { ...abrechnung, ausstattung: { ...abrechnung.ausstattung, gewerbeImHaus } };
  }
  if (vorauszahlungen?.verlauf.length)
    abrechnung = { ...abrechnung, vorauszahlungenDetail: { ...abrechnung.vorauszahlungenDetail, verlauf: vorauszahlungen.verlauf, verlaufQuelle: vorauszahlungen.quelle } };
  for (const [feld, wert] of Object.entries(antworten)) {
    try { abrechnung = wendeAntwortAn(abrechnung, feld, wert, heute); }
    catch (e) { if (e instanceof AntwortFehler) return { fehler: "antwort", meldung: e.fuerKunden ? e.message : "Die Angabe ist ungültig.", feld }; throw e; }
  }
  const bericht = pruefeAbrechnung(abrechnung, { heute });
  const s1 = erstelleStufe1(bericht, abrechnung, { heute });
  const s2 = erstelleStufe2(bericht, abrechnung, s1);
  const protokoll = erstelleZeilenprotokoll(bericht, abrechnung);
  return { s1, s2, konsistenz, hinweise, protokoll, positionen: abrechnung.kostenpositionen.map((p) => ({ name: p.bezeichnung, betrag: p.anteilMieter })), heizkosten: abrechnung.heizkosten?.anteilMieter ?? null, plz: abrechnung.meta.plz ?? null, zeitraum: abrechnung.meta.abrechnungszeitraum ?? null };
}
