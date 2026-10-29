import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { dokumente, faelle, protokoll } from "./db/schema";
import { env } from "./env";
import { erstelleRatenbegrenzung } from "./ratenbegrenzung";
import { lokalerSpeicher } from "./speicher";
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
  };
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
