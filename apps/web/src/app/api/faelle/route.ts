import { after, NextResponse, type NextRequest } from "next/server";
import { abhaengigkeiten, erstelleFall, uploadBegrenzung } from "@/server/dienste";
import { MAX_DATEIGROESSE, pruefeUpload } from "@/server/upload";
import { verarbeiteFall } from "@/server/verarbeitung";
import { clientIp, fehler } from "../antwort";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!uploadBegrenzung().erlaube(clientIp(req))) {
    return fehler(429, "Zu viele Uploads. Bitte versuchen Sie es in einer Stunde erneut.");
  }
  // Übergroße Anfragen ablehnen, bevor sie gelesen werden.
  const laenge = Number(req.headers.get("content-length") ?? 0);
  if (laenge > MAX_DATEIGROESSE + 1024 * 1024) return fehler(413, "Die Datei ist größer als 20 MB.");

  let formular: FormData;
  try {
    formular = await req.formData();
  } catch {
    return fehler(400, "Ungültige Anfrage.");
  }
  const pruefung = await pruefeUpload(formular);
  if (!pruefung.ok) return fehler(pruefung.status, pruefung.meldung);

  const { fallId, token } = await erstelleFall(pruefung.daten, pruefung.mimeType);
  after(() => verarbeiteFall(fallId, abhaengigkeiten()).catch((e) => console.error(`Fall ${fallId}: Verarbeitung fehlgeschlagen`, e)));

  return NextResponse.json({ id: fallId, token }, { status: 201 });
}
