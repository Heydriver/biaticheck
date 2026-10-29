import { after, type NextRequest } from "next/server";
import { erstelleFallAnsicht } from "@/server/ansicht";
import { abhaengigkeiten, ladeFallMitZugang, uploadBegrenzung } from "@/server/dienste";
import { verarbeiteFall } from "@/server/verarbeitung";
import { clientIp, fehler, json, ZUGANG_HEADER } from "../../../antwort";

export const runtime = "nodejs";

/** Erneuter Versuch nach einem vorübergehenden Fehler beim Auslesen. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fall = await ladeFallMitZugang(id, req.headers.get(ZUGANG_HEADER));
  if (!fall) return fehler(404, "Fall nicht gefunden.");
  if (fall.status !== "fehler") return fehler(409, "Ein erneuter Versuch ist nicht nötig.");
  if (!uploadBegrenzung().erlaube(clientIp(req))) return fehler(429, "Zu viele Versuche. Bitte später erneut.");

  after(() => verarbeiteFall(id, abhaengigkeiten()).catch((e) => console.error(`Fall ${id}: erneuter Versuch fehlgeschlagen`, e)));
  return json({ ...erstelleFallAnsicht(fall), status: "hochgeladen" }, 202);
}
