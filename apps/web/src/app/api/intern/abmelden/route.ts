import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { loescheSitzungsCookie, vonEigenerSeite } from "@/server/intern/anfrage";
import { beende, SITZUNG_COOKIE } from "@/server/intern/sitzung";
import { fehler, json } from "../../antwort";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!vonEigenerSeite(req)) return fehler(403, "Ungültige Herkunft der Anfrage.");
  await beende(db(), (await cookies()).get(SITZUNG_COOKIE)?.value);
  await loescheSitzungsCookie();
  return json({ ok: true });
}
