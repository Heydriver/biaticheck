import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { beratungsanfragen, protokoll } from "@/server/db/schema";
import { ladeFallMitZugang, uploadBegrenzung } from "@/server/dienste";
import { clientIp, fehler, json, ZUGANG_HEADER } from "../../../antwort";

export const runtime = "nodejs";

const Anfrage = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefon: z.string().trim().max(40).regex(/^[0-9+()\s/-]*$/).optional().or(z.literal("")),
  erreichbarkeit: z.string().trim().max(200).optional().or(z.literal("")),
  nachricht: z.string().trim().max(2000).optional().or(z.literal("")),
  einwilligung: z.literal(true),
});

/** Kunde bittet um eine ausführliche Beratung durch einen Experten. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fall = await ladeFallMitZugang(id, req.headers.get(ZUGANG_HEADER));
  if (!fall) return fehler(404, "Fall nicht gefunden.");
  if (!uploadBegrenzung().erlaube(`beratung:${clientIp(req)}`)) return fehler(429, "Zu viele Anfragen. Bitte versuchen Sie es später erneut.");

  const anfrage = Anfrage.safeParse(await req.json().catch(() => null));
  if (!anfrage.success) {
    const feld = String(anfrage.error.issues[0]?.path[0] ?? "");
    const meldung: Record<string, string> = {
      name: "Bitte geben Sie Ihren Namen an.",
      email: "Bitte geben Sie eine gültige E-Mail-Adresse an.",
      telefon: "Die Telefonnummer enthält ungültige Zeichen.",
      einwilligung: "Bitte bestätigen Sie, dass wir Sie kontaktieren dürfen.",
    };
    return fehler(400, meldung[feld] ?? "Bitte prüfen Sie Ihre Angaben.");
  }
  const { einwilligung: _, ...daten } = anfrage.data;
  await db().insert(beratungsanfragen).values({
    fallId: id,
    name: daten.name,
    email: daten.email,
    telefon: daten.telefon || null,
    erreichbarkeit: daten.erreichbarkeit || null,
    nachricht: daten.nachricht || null,
  });
  // Ins Protokoll keine Kontaktdaten – nur dass eine Anfrage einging
  await db().insert(protokoll).values({ fallId: id, akteur: "kunde", aktion: "beratung_angefragt" });
  return json({ ok: true }, 201);
}
