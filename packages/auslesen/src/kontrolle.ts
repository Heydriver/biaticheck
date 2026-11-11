import type { Zeilenprotokoll } from "@biaticheck/pruefkern";
import { z } from "zod";

/**
 * KI-Kontrolle – Unterschritt 2 der Prüfung.
 *
 * Unterschritt 1 (Prüfkern) hat jede Zeile mit Formeln geprüft und ein Zeilenprotokoll erstellt.
 * Hier vergleicht das Modell dieses Protokoll Zeile für Zeile mit dem Originaldokument:
 *   a) Wurde jede Zeile richtig gelesen?
 *   b) Fehlt eine Zeile des Dokuments im Protokoll?
 *   c) Gibt es Auffälligkeiten im Dokument, die keine Formel erfasst hat?
 *
 * Die KI entscheidet nichts und ändert keine Beträge. Jede Meldung führt dazu, dass der Fall nicht
 * automatisch freigegeben wird, sondern an einen Fachprüfer geht. Antwortet die KI zu einer Zeile nicht,
 * gilt die Zeile als nicht bestätigt (feste Regel, siehe `werteKontrolleAus`).
 */

export const KontrolleRoh = z.object({
  zeilen: z
    .array(
      z.object({
        nr: z.number().int().describe("Zeilennummer aus dem Protokoll"),
        gelesen: z.enum(["richtig", "abweichend", "nicht_gefunden"]).describe("richtig: alle Werte der Zeile stehen so im Dokument; abweichend: mindestens ein Wert steht dort anders; nicht_gefunden: die Zeile gibt es im Dokument nicht"),
        abweichung: z.string().nullable().describe("Bei abweichend/nicht_gefunden: welcher Wert im Dokument anders steht, mit dem Wert aus dem Dokument; sonst null"),
      }),
    )
    .describe("Genau ein Eintrag je Zeile des Protokolls"),
  fehlendeZeilen: z
    .array(z.object({ bezeichnung: z.string(), betrag: z.number().nullable().describe("Betrag der Wohnung in Euro, falls angegeben"), seite: z.number().int().nullable() }))
    .describe("Kostenzeilen des Dokuments, die im Protokoll nicht vorkommen; sonst leere Liste"),
  auffaelligkeiten: z
    .array(
      z.object({
        zeileNr: z.number().int().nullable().describe("Zeile des Protokolls, auf die sich die Auffälligkeit bezieht, oder null"),
        beschreibung: z.string().describe("Ein sachlicher Satz: was auffällt und warum"),
        textstelle: z.string().describe("Wörtliche Stelle aus dem Dokument, die das belegt"),
        seite: z.number().int().nullable(),
      }),
    )
    .describe("Nur konkrete Auffälligkeiten, die im Protokoll bei keiner Zeile als Fehler, Prüfbedarf oder Hinweis stehen; sonst leere Liste"),
});
export type KontrolleRoh = z.infer<typeof KontrolleRoh>;

/** Systemprompt der Kontrolle. Unverändert halten, damit Prompt-Caching greift. */
export const KONTROLL_PROMPT = `Du kontrollierst die automatische Prüfung einer deutschen Betriebs- und Nebenkostenabrechnung. Du erhältst das Originaldokument und ein Zeilenprotokoll. Das Protokoll enthält jede ausgelesene Zeile mit ihren Werten ("gelesen") und den Ergebnissen der Formelprüfung ("pruefungen").

Deine drei Aufgaben:
1. Lesekontrolle: Vergleiche jede Zeile des Protokolls mit dem Dokument. Stimmen Bezeichnung, Gesamtkosten, Verteilerschlüssel, Anteile und Betrag der Wohnung? Gib für jede Zeilennummer genau einen Eintrag zurück. Rundungen bis 1 Cent sind keine Abweichung. Deutsche Schreibweise "1.214,88" entspricht 1214.88.
2. Vollständigkeit: Gehe das Dokument Zeile für Zeile durch, auch Anlagen und die Heizkostenabrechnung. Nenne jede Kostenzeile der Wohnung, die im Protokoll fehlt. Heiz- und Warmwasserkosten stehen im Protokoll zusammengefasst in der Zeile "Heiz- und Warmwasserkosten" und fehlen deshalb nicht.
3. Nicht erfasste Auffälligkeiten: Nenne nur konkrete Unstimmigkeiten, die das Dokument selbst zeigt und die im Protokoll bei keiner Zeile stehen. Beispiele: eine Fußnote widerspricht einem Betrag; ein Betrag steht an zwei Stellen unterschiedlich; eine Position ist erkennbar einer falschen Kostenart zugeordnet; eine Erläuterung nennt Kosten, die nicht umlagefähig sind; ein Zeitraum oder eine Fläche weicht innerhalb des Dokuments ab; ein Text nennt einen Teilbetrag für Verwaltung, Reparaturen oder andere nicht umlagefähige Arbeiten, der im Protokoll nicht beanstandet ist; eine Buchungs- oder Zahlungsübersicht zeigt höhere Vorauszahlungen als angerechnet; eine Position wird wegen Leerstand auf eine kleinere Fläche verteilt.

Regeln:
- Erfinde nichts. Jede Auffälligkeit braucht eine wörtliche Textstelle aus dem Dokument.
- Keine allgemeinen Ratschläge, keine Vergleiche mit üblichen Kosten, keine Vermutungen ohne Anhaltspunkt im Dokument.
- Wiederhole keine Befunde, die im Protokoll bereits stehen.
- Übernimm keine Namen, Anschriften oder Kontodaten in deine Antwort.
- Ist alles in Ordnung, sind fehlendeZeilen und auffaelligkeiten leer.`;

/** Werte, die im Dokument stehen müssen (ohne berechnete Zwischenwerte). */
const ausDokument = (zeile: Zeilenprotokoll["zeilen"][number]) => Object.fromEntries(Object.entries(zeile.gelesen).filter(([k]) => k !== "summeZeilen"));
/** Nur Zeilen mit ausgelesenen Werten lassen sich am Dokument kontrollieren. */
const kontrollierbar = (zeile: Zeilenprotokoll["zeilen"][number]) => Object.keys(ausDokument(zeile)).length > 0;

/** Protokoll in der Form, in der es das Modell erhält (nur was zur Kontrolle nötig ist). */
export function protokollFuerKontrolle(protokoll: Zeilenprotokoll): string {
  return JSON.stringify(
    protokoll.zeilen.filter(kontrollierbar).map((x) => ({
      nr: x.nr,
      art: x.art,
      bezeichnung: x.bezeichnung,
      gelesen: ausDokument(x),
      ...(x.seite ? { seite: x.seite } : {}),
      pruefungen: x.pruefungen.filter((p) => p.ergebnis !== "ok").map((p) => ({ regel: p.regelId, ergebnis: p.ergebnis, befund: p.detail.slice(0, 240) })),
    })),
  );
}

export interface Kontrolle {
  /** false, wenn die KI-Kontrolle nicht durchgeführt werden konnte – dann gilt nichts als bestätigt. */
  durchgefuehrt: boolean;
  zeilenGesamt: number;
  zeilenBestaetigt: number;
  /** Zeilen, deren Werte laut Kontrolle anders im Dokument stehen oder die nicht bestätigt wurden. */
  lesefehler: { nr: number; bezeichnung: string; abweichung: string }[];
  fehlendeZeilen: { bezeichnung: string; betrag?: number; seite?: number }[];
  /** Auffälligkeiten, die keine Formel erfasst hat – gehen an den Fachprüfer. */
  auffaelligkeiten: { zeileNr?: number; bezeichnung?: string; beschreibung: string; textstelle: string; seite?: number }[];
  /** true nur, wenn jede Zeile bestätigt ist, keine Zeile fehlt und nichts zusätzlich auffällt. */
  bestanden: boolean;
  /** Gründe in Worten, für den Prüfbereich. */
  gruende: string[];
}

export const KEINE_KONTROLLE = (grund: string, zeilenGesamt = 0): Kontrolle => ({
  durchgefuehrt: false,
  zeilenGesamt,
  zeilenBestaetigt: 0,
  lesefehler: [],
  fehlendeZeilen: [],
  auffaelligkeiten: [],
  bestanden: false,
  gruende: [`KI-Kontrolle nicht durchgeführt: ${grund}`],
});

/**
 * Wertet die Antwort der KI nach festen Regeln aus:
 * - Jede Zeile des Protokolls muss ausdrücklich als "richtig" bestätigt sein, sonst gilt sie als Lesefehler.
 * - Auffälligkeiten ohne Textstelle werden verworfen (kein Beleg).
 * - Auffälligkeiten zu Zeilen, die die Formelprüfung bereits beanstandet, sind keine neuen Punkte.
 */
export function werteKontrolleAus(roh: KontrolleRoh, protokoll: Zeilenprotokoll): Kontrolle {
  const antwort = new Map(roh.zeilen.map((x) => [x.nr, x]));
  const lesefehler: Kontrolle["lesefehler"] = [];
  const zuKontrollieren = protokoll.zeilen.filter(kontrollierbar);
  for (const zeile of zuKontrollieren) {
    const a = antwort.get(zeile.nr);
    if (!a) lesefehler.push({ nr: zeile.nr, bezeichnung: zeile.bezeichnung, abweichung: "von der Kontrolle nicht bestätigt" });
    else if (a.gelesen !== "richtig") lesefehler.push({ nr: zeile.nr, bezeichnung: zeile.bezeichnung, abweichung: a.abweichung?.trim() || (a.gelesen === "nicht_gefunden" ? "im Dokument nicht gefunden" : "Wert weicht ab") });
  }
  const fehlendeZeilen = roh.fehlendeZeilen
    .filter((x) => x.bezeichnung.trim())
    .map((x) => ({ bezeichnung: x.bezeichnung.trim(), ...(x.betrag !== null ? { betrag: x.betrag } : {}), ...(x.seite !== null && x.seite > 0 ? { seite: x.seite } : {}) }));
  const beanstandet = new Set(protokoll.zeilen.filter((x) => x.ergebnis === "fehler" || x.ergebnis === "pruefbedarf").map((x) => x.nr));
  const auffaelligkeiten = roh.auffaelligkeiten
    .filter((x) => x.textstelle.trim().length >= 3 && x.beschreibung.trim())
    .filter((x) => x.zeileNr === null || !beanstandet.has(x.zeileNr))
    .map((x) => ({
      ...(x.zeileNr !== null ? { zeileNr: x.zeileNr, bezeichnung: protokoll.zeilen.find((q) => q.nr === x.zeileNr)?.bezeichnung } : {}),
      beschreibung: x.beschreibung.trim(),
      textstelle: x.textstelle.trim(),
      ...(x.seite !== null && x.seite > 0 ? { seite: x.seite } : {}),
    }));

  const gruende = [
    ...lesefehler.map((x) => `KI-Kontrolle, Zeile ${x.nr} „${x.bezeichnung}“: ${x.abweichung}`),
    ...fehlendeZeilen.map((x) => `KI-Kontrolle: Zeile fehlt – „${x.bezeichnung}“${x.betrag !== undefined ? ` (${x.betrag} €)` : ""}`),
    ...auffaelligkeiten.map((x) => `KI-Kontrolle: ${x.beschreibung} – „${x.textstelle}“`),
  ];
  return {
    durchgefuehrt: true,
    zeilenGesamt: zuKontrollieren.length,
    zeilenBestaetigt: zuKontrollieren.length - lesefehler.length,
    lesefehler,
    fehlendeZeilen,
    auffaelligkeiten,
    bestanden: gruende.length === 0,
    gruende,
  };
}
