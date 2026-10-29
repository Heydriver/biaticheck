import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { setzeSitzungsCookie, vonEigenerSeite } from "@/server/intern/anfrage";
import { erstelleRatenbegrenzung } from "@/server/ratenbegrenzung";
import { melde } from "@/server/intern/sitzung";
import { clientIp, fehler, json } from "../../antwort";

export const runtime = "nodejs";

const Anfrage = z.object({ email: z.string().email().max(200), passwort: z.string().min(1).max(1000) });
const g = globalThis as unknown as { __bckAnmeldung?: ReturnType<typeof erstelleRatenbegrenzung> };
const begrenzung = () => (g.__bckAnmeldung ??= erstelleRatenbegrenzung(5, 15 * 60 * 1000));

export async function POST(req: NextRequest) {
  if (!vonEigenerSeite(req)) return fehler(403, "Ungültige Herkunft der Anfrage.");
  const anfrage = Anfrage.safeParse(await req.json().catch(() => null));
  if (!anfrage.success) return fehler(400, "Bitte E-Mail und Passwort angeben.");
  // Begrenzung je IP und je Konto – bremst Passwort-Raten aus
  const ip = clientIp(req);
  if (!begrenzung().erlaube(`ip:${ip}`) || !begrenzung().erlaube(`konto:${anfrage.data.email.toLowerCase()}`)) {
    return fehler(429, "Zu viele Versuche. Bitte warten Sie 15 Minuten.");
  }
  const ergebnis = await melde(db(), anfrage.data.email, anfrage.data.passwort);
  if (!ergebnis) return fehler(401, "E-Mail oder Passwort ist falsch.");
  await setzeSitzungsCookie(ergebnis.token);
  return json({ name: ergebnis.experte.name });
}
