import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "../db";
import { env } from "../env";
import { experteZuToken, SITZUNG_COOKIE, SITZUNG_DAUER_MS, type Experte } from "./sitzung";

/** Angemeldeter Experte der aktuellen Anfrage (Server-Komponenten und Route-Handler). */
export async function aktuellerExperte(): Promise<Experte | undefined> {
  const token = (await cookies()).get(SITZUNG_COOKIE)?.value;
  return experteZuToken(db(), token);
}

export async function setzeSitzungsCookie(token: string) {
  (await cookies()).set(SITZUNG_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SITZUNG_DAUER_MS / 1000,
  });
}

export async function loescheSitzungsCookie() {
  (await cookies()).delete(SITZUNG_COOKIE);
}

/**
 * Schutz vor Cross-Site-Request-Forgery: Ändernde Anfragen müssen von der
 * eigenen Seite kommen. Ergänzt das SameSite=strict-Cookie.
 */
export function vonEigenerSeite(req: NextRequest): boolean {
  const herkunft = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!herkunft || !host) return false;
  try {
    return new URL(herkunft).host === host;
  } catch {
    return false;
  }
}
