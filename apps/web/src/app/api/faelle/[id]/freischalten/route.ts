import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { faelle, protokoll } from "@/server/db/schema";
import { kundenansicht, ladeFallMitZugang } from "@/server/dienste";
import { env } from "@/server/env";
import { fehler, json, ZUGANG_HEADER } from "../../../antwort";

export const runtime = "nodejs";

/**
 * Schaltet die ausführliche Auswertung (Stufe 2) frei.
 * Derzeit nur im Testmodus ohne Bezahlung – die Stripe-Anbindung ersetzt diesen Endpunkt.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get(ZUGANG_HEADER);
  const fall = await ladeFallMitZugang(id, token);
  if (!fall) return fehler(404, "Fall nicht gefunden.");
  if (fall.status !== "fertig") return fehler(409, "Die Auswertung liegt noch nicht vor.");
  if (env().ZAHLUNG_MODUS !== "test") return fehler(403, "Die Freischaltung ist derzeit nicht verfügbar.");

  const geaendert = await db()
    .update(faelle)
    .set({ bezahltAm: new Date(), zahlungsart: "test", aktualisiertAm: new Date() })
    .where(and(eq(faelle.id, id), isNull(faelle.bezahltAm)))
    .returning({ id: faelle.id });
  if (geaendert.length) await db().insert(protokoll).values({ fallId: id, akteur: "kunde", aktion: "freigeschaltet", details: { zahlungsart: "test" } });

  return json(await kundenansicht((await ladeFallMitZugang(id, token))!));
}
