import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { Abrechnung, plzRegion, regionaleReferenz, type AbrechnungEingabe, type Referenzwerte } from "@biaticheck/pruefkern";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { dokumente, faelle, protokoll } from "./db/schema";
import { env } from "./env";
import { erstelleRatenbegrenzung } from "./ratenbegrenzung";
import { lokalerSpeicher } from "./speicher";
import { erstelleFallAnsicht, type FallAnsicht } from "./ansicht";
import type { Abhaengigkeiten } from "./verarbeitung";
import { erzeugeZugang, pruefeZugang } from "./zugang";
import type { Dokumenttyp } from "@biaticheck/auslesen";

/** Aufbewahrungsdauer hochgeladener Abrechnungen (Datensparsamkeit). */
const AUFBEWAHRUNG_TAGE = 90;

const g = globalThis as unknown as { __biaticheckRaten?: ReturnType<typeof erstelleRatenbegrenzung> };

export function uploadBegrenzung() {
  g.__biaticheckRaten ??= erstelleRatenbegrenzung(env().UPLOADS_PRO_STUNDE, 60 * 60 * 1000);
  return g.__biaticheckRaten;
}

export function speicher() {
  return lokalerSpeicher(env().UPLOAD_DIR, env().DATEI_SCHLUESSEL);
}

export function abhaengigkeiten(): Abhaengigkeiten {
  const e = env();
  return {
    db: db(),
    speicher: speicher(),
    client: e.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: e.ANTHROPIC_API_KEY }) : undefined,
    freigabeErforderlich: e.FREIGABE_ERFORDERLICH,
    demoAuslesen: e.DEMO_AUSLESEN,
  };
}

/**
 * Regionale Vergleichswerte aus eigenen, freigegebenen Fällen desselben PLZ-Gebiets.
 * Der eigene Fall zählt nicht mit; unter der Mindestzahl an Fällen gibt es keine Werte.
 */
export async function ladeRegionaleReferenz(fallId: string, daten: AbrechnungEingabe | null): Promise<Referenzwerte | undefined> {
  const region = plzRegion(daten?.meta.plz);
  const jahr = daten?.meta.abrechnungszeitraum ? Number(daten.meta.abrechnungszeitraum.bis.slice(0, 4)) : undefined;
  if (!region || !jahr) return undefined;
  const zeilen = await db()
    .select({ daten: faelle.daten })
    .from(faelle)
    .where(
      and(
        eq(faelle.status, "fertig"),
        ne(faelle.id, fallId),
        sql`${faelle.daten} -> 'meta' ->> 'plz' like ${region + "%"}`,
        sql`left(${faelle.daten} -> 'meta' -> 'abrechnungszeitraum' ->> 'bis', 4) = ${String(jahr)}`,
      ),
    )
    .limit(2000);
  const abrechnungen = zeilen.flatMap((z) => {
    const r = Abrechnung.safeParse(z.daten);
    return r.success ? [r.data] : [];
  });
  return regionaleReferenz(region, abrechnungen, jahr);
}

/** Legt einen neuen Fall mit hochgeladenem Dokument an. */
export async function erstelleFall(daten: Uint8Array, mimeType: Dokumenttyp) {
  const { token, hash } = erzeugeZugang();
  const loeschenAm = new Date(Date.now() + AUFBEWAHRUNG_TAGE * 24 * 60 * 60 * 1000);

  const fall = await db().transaction(async (tx) => {
    const [neu] = await tx.insert(faelle).values({ zugangHash: hash, loeschenAm }).returning({ id: faelle.id });
    const fallId = neu!.id;
    const [dok] = await tx
      .insert(dokumente)
      .values({
        fallId,
        art: "abrechnung",
        mimeType,
        groesse: daten.byteLength,
        sha256: createHash("sha256").update(daten).digest("hex"),
        speicherschluessel: "ausstehend",
      })
      .returning({ id: dokumente.id });
    const schluessel = `${fallId}/${dok!.id}`;
    await speicher().speichere(schluessel, daten);
    await tx.update(dokumente).set({ speicherschluessel: schluessel }).where(eq(dokumente.id, dok!.id));
    await tx.insert(protokoll).values({ fallId, akteur: "kunde", aktion: "hochgeladen", details: { mimeType, groesse: daten.byteLength } });
    return { fallId };
  });

  return { ...fall, token };
}

/** Lädt einen Fall nur mit gültigem Zugangstoken. Ungültige IDs und Tokens sind nicht unterscheidbar. */
export async function ladeFallMitZugang(fallId: string, token: string | null | undefined) {
  if (!/^[0-9a-f-]{36}$/.test(fallId)) return undefined;
  const [fall] = await db().select().from(faelle).where(eq(faelle.id, fallId));
  if (!fall || !pruefeZugang(token, fall.zugangHash)) return undefined;
  return fall;
}

/** Kundenansicht inklusive regionaler Vergleichswerte und tagesaktueller Fristen. */
export async function kundenansicht(fall: typeof faelle.$inferSelect): Promise<FallAnsicht> {
  const regional = fall.status === "fertig" ? await ladeRegionaleReferenz(fall.id, fall.daten) : undefined;
  return erstelleFallAnsicht(fall, { zahlungModus: env().ZAHLUNG_MODUS, regional, heute: new Date().toISOString().slice(0, 10) });
}
