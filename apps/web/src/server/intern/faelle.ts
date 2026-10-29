import { vergleiche } from "@biaticheck/auslesen";
import { Abrechnung, pruefeAbrechnung, type AbrechnungEingabe, type Pruefbericht } from "@biaticheck/pruefkern";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { dokumente, faelle, protokoll, type Fallstatus } from "../db/schema";
import type { Dateispeicher } from "../speicher";
import { FallFehler } from "../verarbeitung";
import type { Experte } from "./sitzung";

const akteur = (e: Experte) => `experte:${e.email}`;

/** Reihenfolge in der Arbeitsliste: was Arbeit braucht, zuerst. */
const PRIORITAET: Record<Fallstatus, number> = {
  expertenpruefung: 0,
  fehler: 1,
  kein_nebenkostendokument: 2,
  wird_ausgelesen: 3,
  hochgeladen: 4,
  fertig: 5,
};

export async function listeFaelle(db: Db, limit = 200) {
  const liste = await db
    .select({
      id: faelle.id,
      status: faelle.status,
      erstelltAm: faelle.erstelltAm,
      freigegebenAm: faelle.freigegebenAm,
      fehler: faelle.fehler,
      konsistent: sql<boolean | null>`(${faelle.auslesung} -> 'konsistenz' ->> 'konsistent')::boolean`,
      einsparpotenzial: sql<number | null>`(${faelle.bericht} -> 'zusammenfassung' ->> 'einsparpotenzial')::numeric`,
      klaerungspotenzial: sql<number | null>`(${faelle.bericht} -> 'zusammenfassung' ->> 'klaerungspotenzial')::numeric`,
    })
    .from(faelle)
    .orderBy(desc(faelle.erstelltAm))
    .limit(limit);
  return liste
    .map((f) => ({
      ...f,
      einsparpotenzial: f.einsparpotenzial === null ? null : Number(f.einsparpotenzial),
      klaerungspotenzial: f.klaerungspotenzial === null ? null : Number(f.klaerungspotenzial),
    }))
    .sort((a, b) => PRIORITAET[a.status] - PRIORITAET[b.status]);
}

export async function ladeFallIntern(db: Db, fallId: string) {
  if (!/^[0-9a-f-]{36}$/.test(fallId)) return undefined;
  const [fall] = await db.select().from(faelle).where(eq(faelle.id, fallId));
  if (!fall) return undefined;
  const docs = await db.select().from(dokumente).where(eq(dokumente.fallId, fallId)).orderBy(asc(dokumente.erstelltAm));
  const verlauf = await db.select().from(protokoll).where(eq(protokoll.fallId, fallId)).orderBy(desc(protokoll.zeitpunkt)).limit(100);
  return { fall, dokumente: docs, verlauf };
}

/** Leere Vorlage zum manuellen Erfassen, wenn nicht automatisch ausgelesen wurde. */
export function leereAbrechnung(): AbrechnungEingabe {
  return { meta: {}, flaechen: {}, kostenpositionen: [], ausgewiesen: {} };
}

export type DatenFehler = { pfad: string; meldung: string }[];

/** Prüft vom Experten bearbeitete Daten gegen das Schema und liefert verständliche Fehler. */
export function validiereDaten(daten: unknown): { ok: true; daten: AbrechnungEingabe } | { ok: false; fehler: DatenFehler } {
  const ergebnis = Abrechnung.safeParse(daten);
  if (ergebnis.success) return { ok: true, daten: daten as AbrechnungEingabe };
  return { ok: false, fehler: ergebnis.error.issues.map((i) => ({ pfad: i.path.join("."), meldung: i.message })) };
}

/** Speichert korrigierte Daten und prüft neu. Der Status bleibt, die Kundenansicht aktualisiert sich bei freigegebenen Fällen. */
export async function speichereDaten(
  db: Db,
  fallId: string,
  daten: AbrechnungEingabe,
  experte: Experte,
  heute?: string,
): Promise<Pruefbericht> {
  const bericht = pruefeAbrechnung(daten, { heute });
  await db.transaction(async (tx) => {
    const [fall] = await tx.select({ status: faelle.status }).from(faelle).where(eq(faelle.id, fallId)).for("update");
    if (!fall) throw new FallFehler(404, "Fall nicht gefunden");
    if (fall.status === "hochgeladen" || fall.status === "wird_ausgelesen") {
      throw new FallFehler(409, "Der Fall wird gerade automatisch ausgelesen");
    }
    // Ein Fall ohne erkannte Abrechnung wird durch manuelles Erfassen wieder prüfbar.
    const status: Fallstatus = fall.status === "kein_nebenkostendokument" || fall.status === "fehler" ? "expertenpruefung" : fall.status;
    await tx.update(faelle).set({ daten, bericht, status, aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
    await tx.insert(protokoll).values({
      fallId,
      akteur: akteur(experte),
      aktion: "daten_korrigiert",
      details: { anzahl: bericht.zusammenfassung.anzahl, regelwerk: bericht.regelwerkVersion },
    });
  });
  return bericht;
}

/**
 * Gibt das Ergebnis für den Kunden frei.
 * Hält fest, wie genau die KI ausgelesen hat und bei welchen Regeln der Experte
 * zu einem anderen Ergebnis kam – Grundlage für die spätere Auto-Freigabe je Regel.
 */
export async function gebeFrei(db: Db, fallId: string, experte: Experte, heute?: string) {
  await db.transaction(async (tx) => {
    const [fall] = await tx.select().from(faelle).where(eq(faelle.id, fallId)).for("update");
    if (!fall) throw new FallFehler(404, "Fall nicht gefunden");
    if (fall.status !== "expertenpruefung") throw new FallFehler(409, "Nur Fälle in Expertenprüfung können freigegeben werden");
    if (!fall.daten || !fall.bericht) throw new FallFehler(409, "Ohne erfasste Daten ist keine Freigabe möglich");

    let messung: Record<string, unknown> = { manuellErfasst: true };
    if (fall.datenAutomatisch) {
      const v = vergleiche(fall.daten, fall.datenAutomatisch);
      const automatisch = pruefeAbrechnung(fall.datenAutomatisch, { heute });
      const regelnGeaendert = regelnMitAnderemErgebnis(automatisch, fall.bericht);
      messung = {
        manuellErfasst: false,
        feldquote: v.quote,
        felderKorrigiert: v.abweichungen.map((a) => a.feld),
        regelnGeaendert,
        regelnGeprueft: [...new Set(automatisch.ergebnisse.map((e) => e.regelId))],
      };
    }

    await tx.update(faelle).set({ status: "fertig", freigegebenAm: new Date(), aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
    await tx.insert(protokoll).values({ fallId, akteur: akteur(experte), aktion: "freigegeben", details: messung });
  });
}

/**
 * Regeln, deren Ergebnis sich zwischen automatischer und finaler Prüfung unterscheidet.
 * Verglichen wird je Regel die vollständige Liste (Position + Status), da eine Regel
 * mehrere Ergebnisse ohne Positionsbezug liefern kann.
 */
export function regelnMitAnderemErgebnis(automatisch: Pruefbericht, final: Pruefbericht): string[] {
  const fingerabdruck = (b: Pruefbericht) => {
    const jeRegel = new Map<string, string[]>();
    for (const e of b.ergebnisse) jeRegel.set(e.regelId, [...(jeRegel.get(e.regelId) ?? []), `${e.positionId ?? ""}:${e.status}:${e.titel}`]);
    return new Map([...jeRegel].map(([id, liste]) => [id, liste.sort().join("|")]));
  };
  const a = fingerabdruck(automatisch);
  const f = fingerabdruck(final);
  return [...new Set([...a.keys(), ...f.keys()])].filter((id) => a.get(id) !== f.get(id)).sort();
}

/** Setzt einen Fall zum erneuten automatischen Auslesen zurück. */
export async function setzeZurueck(db: Db, fallId: string, experte: Experte) {
  const ergebnis = await db
    .update(faelle)
    .set({ status: "fehler", fehler: "Erneutes Auslesen durch Experten angestoßen", aktualisiertAm: new Date() })
    .where(and(eq(faelle.id, fallId), sql`${faelle.status} not in ('hochgeladen', 'wird_ausgelesen')`))
    .returning({ id: faelle.id });
  if (ergebnis.length === 0) throw new FallFehler(409, "Fall nicht gefunden oder wird bereits ausgelesen");
  await db.insert(protokoll).values({ fallId, akteur: akteur(experte), aktion: "erneut_auslesen" });
}

/** Löscht Fälle nach Ablauf der Aufbewahrungsfrist samt Dateien. */
export async function loescheAbgelaufene(db: Db, speicher: Dateispeicher, jetzt = new Date()): Promise<number> {
  const abgelaufen = await db.select({ id: faelle.id }).from(faelle).where(lt(faelle.loeschenAm, jetzt));
  for (const { id } of abgelaufen) {
    // Erst Dateien, dann Datensatz: bricht etwas ab, bleibt der Datensatz für den nächsten Lauf erhalten.
    await speicher.loesche(id);
    await db.delete(faelle).where(eq(faelle.id, id));
  }
  return abgelaufen.length;
}
