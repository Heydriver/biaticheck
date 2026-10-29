import type { NextRequest } from "next/server";
import { z } from "zod";
import { erstelleFallAnsicht } from "@/server/ansicht";
import { abhaengigkeiten, ladeFallMitZugang } from "@/server/dienste";
import { beantworteRueckfrage, FallFehler } from "@/server/verarbeitung";
import { fehler, json, ZUGANG_HEADER } from "../../../antwort";

export const runtime = "nodejs";

const Anfrage = z.object({ feld: z.string().max(100), wert: z.unknown() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fall = await ladeFallMitZugang(id, req.headers.get(ZUGANG_HEADER));
  if (!fall) return fehler(404, "Fall nicht gefunden.");
  if (fall.status !== "fertig") return fehler(409, "Rückfragen sind erst nach der Auswertung möglich.");

  const anfrage = Anfrage.safeParse(await req.json().catch(() => null));
  if (!anfrage.success) return fehler(400, "Ungültige Anfrage.");

  try {
    await beantworteRueckfrage(id, anfrage.data.feld, anfrage.data.wert, abhaengigkeiten());
  } catch (e) {
    if (e instanceof FallFehler) return fehler(e.status, e.message);
    throw e;
  }
  const aktualisiert = await ladeFallMitZugang(id, req.headers.get(ZUGANG_HEADER));
  return json(erstelleFallAnsicht(aktualisiert!));
}
