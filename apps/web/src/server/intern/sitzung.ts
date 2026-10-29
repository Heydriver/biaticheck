import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db";
import { experten, sitzungen } from "../db/schema";
import { erzeugeZugang, hashe } from "../zugang";
import { DUMMY_HASH, pruefePasswort } from "./passwort";

export const SITZUNG_COOKIE = "bck_sitzung";
export const SITZUNG_DAUER_MS = 12 * 60 * 60 * 1000;

export interface Experte {
  id: string;
  name: string;
  email: string;
}

/** Meldet einen Experten an. Liefert das Sitzungstoken oder undefined – ohne zu verraten, was falsch war. */
export async function melde(db: Db, email: string, passwort: string): Promise<{ token: string; experte: Experte } | undefined> {
  const [e] = await db.select().from(experten).where(eq(experten.email, email.trim().toLowerCase()));
  const passt = await pruefePasswort(passwort, e?.passwortHash ?? DUMMY_HASH);
  if (!e || !e.aktiv || !passt) return undefined;

  const { token, hash } = erzeugeZugang();
  await db.insert(sitzungen).values({ expertId: e.id, tokenHash: hash, laeuftAbAm: new Date(Date.now() + SITZUNG_DAUER_MS) });
  // Abgelaufene Sitzungen bei Gelegenheit entfernen
  await db.delete(sitzungen).where(lt(sitzungen.laeuftAbAm, new Date()));
  return { token, experte: { id: e.id, name: e.name, email: e.email } };
}

export async function experteZuToken(db: Db, token: string | undefined): Promise<Experte | undefined> {
  if (!token || token.length > 100) return undefined;
  const [treffer] = await db
    .select({ id: experten.id, name: experten.name, email: experten.email })
    .from(sitzungen)
    .innerJoin(experten, eq(experten.id, sitzungen.expertId))
    .where(and(eq(sitzungen.tokenHash, hashe(token)), gt(sitzungen.laeuftAbAm, new Date()), eq(experten.aktiv, true)));
  return treffer;
}

export async function beende(db: Db, token: string | undefined) {
  if (token) await db.delete(sitzungen).where(eq(sitzungen.tokenHash, hashe(token)));
}
