import type { NextRequest } from "next/server";
import { ladeFallMitZugang, kundenansicht } from "@/server/dienste";
import { fehler, json, ZUGANG_HEADER } from "../../antwort";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fall = await ladeFallMitZugang(id, req.headers.get(ZUGANG_HEADER));
  if (!fall) return fehler(404, "Fall nicht gefunden.");
  return json(await kundenansicht(fall));
}
