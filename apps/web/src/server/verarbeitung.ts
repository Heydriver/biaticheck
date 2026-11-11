import type Anthropic from "@anthropic-ai/sdk";
import { AuslesenFehler, leseAus, leseVorauszahlungen, type Auslesung, type Dokument, type Dokumenttyp } from "@biaticheck/auslesen";
import {
  AntwortFehler,
  MUSTERABRECHNUNG,
  schliesstAn,
  datumDE,
  pruefeAbrechnung,
  wendeAntwortAn,
  type AbrechnungEingabe,
  type Pruefbericht,
} from "@biaticheck/pruefkern";
import { createHash } from "node:crypto";
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
  /** Ohne Client: Musterabrechnung als Demo-Ergebnis verwenden (nur Entwicklung/Test). */
  demoAuslesen?: boolean;
  heute?: () => string;
}

/** Demo-Modus: Statt der hochgeladenen Datei wird die Musterabrechnung ausgewertet – für Tests ohne API-Schlüssel. */
function demoAuslesung(): Auslesung {
  return {
    abrechnung: structuredClone(MUSTERABRECHNUNG),
    istNebenkostenabrechnung: true,
    konsistenz: { konsistent: true, gruende: [] },
    hinweise: ["Demo-Modus: Statt der hochgeladenen Datei wurde die Musterabrechnung ausgewertet."],
    modell: "demo",
    nutzung: { eingabeTokens: 0, ausgabeTokens: 0 },
  };
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
    if (!deps.client && !deps.demoAuslesen) {
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
      auslesung = deps.client ? await leseAus(deps.client, geladen, { heute: deps.heute?.() }) : demoAuslesung();
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

    await db
      .update(faelle)
      .set({ status, daten, datenAutomatisch: abrechnung, bericht, auslesung: meta, aktualisiertAm: new Date() })
      .where(eq(faelle.id, fallId));
    await protokolliere(db, fallId, "system", "ausgelesen_und_geprueft", {
      status,
      konsistent: meta.konsistenz.konsistent,
      anzahl: bericht.zusammenfassung.anzahl,
      regelwerk: bericht.regelwerkVersion,
      modell: meta.modell,
      tokens: meta.nutzung,
      // KI-Kontrolle (Unterschritt 2): bestätigte Zeilen und Meldungen
      kontrolle: meta.kontrolle
        ? {
            durchgefuehrt: meta.kontrolle.durchgefuehrt,
            bestanden: meta.kontrolle.bestanden,
            zeilen: `${meta.kontrolle.zeilenBestaetigt}/${meta.kontrolle.zeilenGesamt}`,
            lesefehler: meta.kontrolle.lesefehler.length,
            fehlendeZeilen: meta.kontrolle.fehlendeZeilen.length,
            auffaelligkeiten: meta.kontrolle.auffaelligkeiten.length,
          }
        : null,
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
      if (fehler instanceof AntwortFehler) throw new FallFehler(400, fehler.fuerKunden ? fehler.message : "Die Antwort ist ungültig");
      throw fehler;
    }
    const bericht = pruefeAbrechnung(daten, { heute: deps.heute?.() });

    await tx.insert(antworten).values({ fallId, feld, wert });
    await tx.update(faelle).set({ daten, bericht, aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
    await tx.insert(protokoll).values({ fallId, akteur: "kunde", aktion: "rueckfrage_beantwortet", details: { feld } });
  });
}

export type UnterlagenErgebnis =
  | { art: "uebernommen"; meldung: string }
  | { art: "nichts_gefunden" | "experte" | "fehler"; meldung: string };

/**
 * Nachgereichte Unterlage (Vorjahresabrechnung oder Kontoauszüge) für den Prüfbedarf bei Vorauszahlungen:
 * verschlüsselt ablegen, Vorauszahlungsverlauf auslesen und neu prüfen.
 * Ohne KI-Zugang geht die Unterlage an einen Fachprüfer.
 */
export async function verarbeiteUnterlage(
  fallId: string,
  datei: { daten: Uint8Array; mimeType: Dokumenttyp; art: "vorjahr" | "kontoauszug" },
  deps: Pick<Abhaengigkeiten, "db" | "speicher" | "client" | "heute">,
): Promise<UnterlagenErgebnis> {
  const { db } = deps;
  const [fall] = await db.select().from(faelle).where(eq(faelle.id, fallId));
  if (!fall) throw new FallFehler(404, "Fall nicht gefunden");
  if (!fall.daten) throw new FallFehler(409, "Die Abrechnung ist noch nicht ausgelesen");

  const [dok] = await db
    .insert(dokumente)
    .values({
      fallId,
      art: datei.art,
      mimeType: datei.mimeType,
      groesse: datei.daten.byteLength,
      sha256: createHash("sha256").update(datei.daten).digest("hex"),
      speicherschluessel: "ausstehend",
    })
    .returning({ id: dokumente.id });
  const schluessel = `${fallId}/${dok!.id}`;
  await deps.speicher.speichere(schluessel, datei.daten);
  await db.update(dokumente).set({ speicherschluessel: schluessel }).where(eq(dokumente.id, dok!.id));
  await protokolliere(db, fallId, "kunde", "unterlage_nachgereicht", { art: datei.art, mimeType: datei.mimeType, groesse: datei.daten.byteLength });

  if (!deps.client) {
    await protokolliere(db, fallId, "system", "unterlage_an_experte", { art: datei.art });
    return { art: "experte", meldung: "Danke, wir haben Ihre Unterlage erhalten. Ein Fachprüfer wertet sie aus und aktualisiert Ihr Ergebnis." };
  }

  let verlauf;
  try {
    verlauf = await leseVorauszahlungen(deps.client, [{ daten: datei.daten, mimeType: datei.mimeType }], fall.daten.meta?.abrechnungszeitraum);
  } catch (fehler) {
    if (!(fehler instanceof AuslesenFehler)) throw fehler;
    await protokolliere(db, fallId, "system", "unterlage_auslesen_fehlgeschlagen", { code: fehler.code });
    return { art: "fehler", meldung: "Die Unterlage konnte nicht gelesen werden. Bitte versuchen Sie es noch einmal oder mit einem deutlicheren Foto." };
  }
  const aktuellerZeitraum = fall.daten.meta?.abrechnungszeitraum;
  const vj = verlauf.abrechnungszeitraum;
  const zeitraumPasst = !!(vj && aktuellerZeitraum && schliesstAn(vj, aktuellerZeitraum));
  if (!verlauf.verlauf.length && !zeitraumPasst) {
    await protokolliere(db, fallId, "system", "unterlage_ohne_verwertbare_angaben", { art: datei.art, zeitraum: vj ?? null });
    return {
      art: "nichts_gefunden",
      meldung: vj
        ? `Der Zeitraum dieser Abrechnung (${datumDE(vj.von)} bis ${datumDE(vj.bis)}) schließt nicht an Ihre aktuelle Abrechnung an. Bitte laden Sie die Abrechnung des direkt vorhergehenden Jahres hoch.`
        : "In dieser Unterlage finden wir keine passenden Angaben. Bitte laden Sie die Abrechnung des Vorjahres oder Kontoauszüge hoch.",
    };
  }

  let ergebnis: UnterlagenErgebnis = { art: "uebernommen", meldung: "" };
  await db.transaction(async (tx) => {
    const [aktuell] = await tx.select().from(faelle).where(eq(faelle.id, fallId)).for("update");
    let daten = aktuell!.daten!;
    if (verlauf.verlauf.length) {
      daten = wendeAntwortAn(daten, "vorauszahlungenDetail.verlauf", verlauf.verlauf);
      daten = { ...daten, vorauszahlungenDetail: { ...daten.vorauszahlungenDetail, verlaufQuelle: verlauf.quelle } };
      await tx.insert(antworten).values({ fallId, feld: "vorauszahlungenDetail.verlauf", wert: verlauf.verlauf });
    }
    if (zeitraumPasst) {
      daten = wendeAntwortAn(daten, "meta.zeitraumBestaetigt", true);
      await tx.insert(antworten).values({ fallId, feld: "meta.zeitraumBestaetigt", wert: true });
    }
    const bericht = pruefeAbrechnung(daten, { heute: deps.heute?.() });
    await tx.update(faelle).set({ daten, bericht, aktualisiertAm: new Date() }).where(eq(faelle.id, fallId));
    await tx.insert(protokoll).values({
      fallId,
      akteur: "system",
      aktion: "unterlage_uebernommen",
      details: { quelle: verlauf.quelle, eintraege: verlauf.verlauf.length, zeitraumBestaetigt: zeitraumPasst },
    });

    const euroDE = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
    const saetze: string[] = [];
    const f02 = bericht.ergebnisse.find((e) => e.regelId === "F-02");
    if (zeitraumPasst && f02?.status === "abweichung")
      saetze.push(`Bestätigt: Die Abrechnung kam zu spät. Sie müssen die Nachzahlung von ${euroDE(f02.betragZugunstenMieter ?? 0)} nicht zahlen.`);
    else if (zeitraumPasst) saetze.push("Der Abrechnungszeitraum ist bestätigt.");
    if (verlauf.verlauf.length) {
      const r05 = bericht.ergebnisse.filter((e) => e.regelId === "R-05");
      const fehlt = r05.filter((e) => e.status === "abweichung").reduce((x, e) => x + (e.betragZugunstenMieter ?? 0), 0);
      if (fehlt > 0) saetze.push(`Bei Ihren Vorauszahlungen fehlen ${euroDE(fehlt)}. Der Betrag zählt jetzt als sicherer Fehler und steht im Schreiben.`);
      else if (r05.some((e) => e.status === "pruefbedarf")) saetze.push("Für Ihre Vorauszahlungen reicht die Unterlage noch nicht. Bitte laden Sie eine weitere hoch.");
      else saetze.push("Ihre Vorauszahlungen wurden richtig angerechnet.");
    }
    ergebnis = { art: "uebernommen", meldung: saetze.join(" ") };
  });
  return ergebnis;
}
