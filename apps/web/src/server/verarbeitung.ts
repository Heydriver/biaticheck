import type Anthropic from "@anthropic-ai/sdk";
import { AuslesenFehler, leseAus, type Auslesung, type Dokument } from "@biaticheck/auslesen";
import {
  AntwortFehler,
  pruefeAbrechnung,
  wendeAntwortAn,
  type AbrechnungEingabe,
  type Pruefbericht,
} from "@biaticheck/pruefkern";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { antworten, dokumente, faelle, protokoll, type Fallstatus } from "./db/schema";
import type { Dateispeicher } from "./speicher";

export interface Abhaengigkeiten {
  db: Db;
  speicher: Dateispeicher;
  /** Ohne Client wird nicht automatisch ausgelesen – der Fall geht an einen Experten. */
  client?: Anthropic;
  freigabeErforderlich: boolean;
  heute?: () => string;
}

/** Entscheidet, ob ein Ergebnis direkt sichtbar ist oder zum Experten geht. */
export function ermittleStatus(e: {
  istNebenkostenabrechnung: boolean;
  konsistent: boolean;
  freigabeErforderlich: boolean;
  bericht?: Pruefbericht;
}): Fallstatus {
  if (!e.istNebenkostenabrechnung) return "kein_nebenkostendokument";
  if (!e.konsistent || e.freigabeErforderlich) return "expertenpruefung";
  if (e.bericht?.ergebnisse.some((x) => x.titel === "Interner Prüffehler")) return "expertenpruefung";
  return "fertig";
}

async function protokolliere(db: Db, fallId: string, akteur: string, aktion: string, details?: Record<string, unknown>) {
  await db.insert(protokoll).values({ fallId, akteur, aktion, details });
}

async function setzeStatus(db: Db, fallId: string, status: Fallstatus, fehler: string | null = null) {
  await db.update(faelle).set({ status, fehler, aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
}

/** Übernimmt gespeicherte Kundenantworten in neu ausgelesene Daten. */
async function wendeGespeicherteAntwortenAn(db: Db, fallId: string, daten: AbrechnungEingabe) {
  const liste = await db.select().from(antworten).where(eq(antworten.fallId, fallId)).orderBy(asc(antworten.erstelltAm));
  let ergebnis = daten;
  for (const a of liste) {
    try {
      ergebnis = wendeAntwortAn(ergebnis, a.feld, a.wert);
    } catch (fehler) {
      if (!(fehler instanceof AntwortFehler)) throw fehler;
      await protokolliere(db, fallId, "system", "antwort_uebersprungen", { feld: a.feld });
    }
  }
  return ergebnis;
}

/**
 * Liest einen hochgeladenen Fall aus und prüft ihn.
 * Idempotent: Läuft bereits eine Verarbeitung, passiert nichts.
 */
export async function verarbeiteFall(fallId: string, deps: Abhaengigkeiten): Promise<void> {
  const { db } = deps;

  // Fall atomar beanspruchen – verhindert doppeltes Auslesen (und doppelte API-Kosten).
  const beansprucht = await db
    .update(faelle)
    .set({ status: "wird_ausgelesen", fehler: null, aktualisiertAm: new Date() })
    .where(and(eq(faelle.id, fallId), inArray(faelle.status, ["hochgeladen", "fehler"])))
    .returning({ id: faelle.id });
  if (beansprucht.length === 0) return;

  try {
    if (!deps.client) {
      await setzeStatus(db, fallId, "expertenpruefung", "Automatisches Auslesen ist nicht konfiguriert");
      await protokolliere(db, fallId, "system", "auslesen_uebersprungen");
      return;
    }

    const docs = await db
      .select()
      .from(dokumente)
      .where(and(eq(dokumente.fallId, fallId), inArray(dokumente.art, ["abrechnung", "heizkosten"])))
      .orderBy(asc(dokumente.erstelltAm));
    const geladen: Dokument[] = await Promise.all(
      docs.map(async (d) => ({ daten: await deps.speicher.lade(d.speicherschluessel), mimeType: d.mimeType as Dokument["mimeType"] })),
    );

    let auslesung: Auslesung;
    try {
      auslesung = await leseAus(deps.client, geladen);
    } catch (fehler) {
      if (!(fehler instanceof AuslesenFehler)) throw fehler;
      await setzeStatus(db, fallId, fehler.wiederholbar ? "fehler" : "expertenpruefung", fehler.message);
      await protokolliere(db, fallId, "system", "auslesen_fehlgeschlagen", { code: fehler.code, wiederholbar: fehler.wiederholbar });
      return;
    }

    const { abrechnung, ...meta } = auslesung;
    if (!abrechnung) {
      await db.update(faelle).set({ status: "kein_nebenkostendokument", auslesung: meta, aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
      await protokolliere(db, fallId, "system", "kein_nebenkostendokument");
      return;
    }

    const daten = await wendeGespeicherteAntwortenAn(db, fallId, abrechnung);
    const bericht = pruefeAbrechnung(daten, { heute: deps.heute?.() });
    const status = ermittleStatus({
      istNebenkostenabrechnung: true,
      konsistent: meta.konsistenz.konsistent,
      freigabeErforderlich: deps.freigabeErforderlich,
      bericht,
    });

    await db.update(faelle).set({ status, daten, bericht, auslesung: meta, aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
    await protokolliere(db, fallId, "system", "ausgelesen_und_geprueft", {
      status,
      konsistent: meta.konsistenz.konsistent,
      anzahl: bericht.zusammenfassung.anzahl,
      regelwerk: bericht.regelwerkVersion,
      modell: meta.modell,
      tokens: meta.nutzung,
    });
  } catch (fehler) {
    // Unerwarteter Fehler: Fall nie im Status "wird_ausgelesen" hängen lassen.
    await setzeStatus(db, fallId, "fehler", "Unerwarteter Fehler bei der Verarbeitung");
    await protokolliere(db, fallId, "system", "verarbeitung_abgebrochen", { fehler: String(fehler).slice(0, 500) });
    throw fehler;
  }
}

export class FallFehler extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Speichert die Antwort des Kunden auf eine Rückfrage und prüft erneut. */
export async function beantworteRueckfrage(
  fallId: string,
  feld: string,
  wert: unknown,
  deps: Pick<Abhaengigkeiten, "db" | "heute">,
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const [fall] = await tx.select().from(faelle).where(eq(faelle.id, fallId)).for("update");
    if (!fall) throw new FallFehler(404, "Fall nicht gefunden");
    if (!fall.daten) throw new FallFehler(409, "Die Abrechnung ist noch nicht ausgelesen");

    let daten: AbrechnungEingabe;
    try {
      daten = wendeAntwortAn(fall.daten, feld, wert);
    } catch (fehler) {
      if (fehler instanceof AntwortFehler) throw new FallFehler(400, "Die Antwort ist ungültig");
      throw fehler;
    }
    const bericht = pruefeAbrechnung(daten, { heute: deps.heute?.() });

    await tx.insert(antworten).values({ fallId, feld, wert });
    await tx.update(faelle).set({ daten, bericht, aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
    await tx.insert(protokoll).values({ fallId, akteur: "kunde", aktion: "rueckfrage_beantwortet", details: { feld } });
  });
}
