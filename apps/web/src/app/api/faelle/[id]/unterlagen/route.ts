import type { NextRequest } from "next/server";
import { abhaengigkeiten, kundenansicht, ladeFallMitZugang, uploadBegrenzung } from "@/server/dienste";
import { MAX_DATEIGROESSE, pruefeUpload } from "@/server/upload";
import { FallFehler, verarbeiteUnterlage } from "@/server/verarbeitung";
import { clientIp, fehler, json, ZUGANG_HEADER } from "../../../antwort";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Nachgereichte Unterlage zum Prüfbedarf (Vorjahresabrechnung oder Kontoauszüge). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fall = await ladeFallMitZugang(id, req.headers.get(ZUGANG_HEADER));
  if (!fall) return fehler(404, "Fall nicht gefunden.");
  if (fall.status !== "fertig") return fehler(409, "Unterlagen können erst nach der Auswertung nachgereicht werden.");
  if (!uploadBegrenzung().erlaube(`unterlage:${clientIp(req)}`)) return fehler(429, "Zu viele Uploads. Bitte versuchen Sie es später erneut.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_DATEIGROESSE + 1024 * 1024) return fehler(413, "Die Datei ist größer als 20 MB.");

  let formular: FormData;
  try {
    formular = await req.formData();
  } catch {
    return fehler(400, "Ungültige Anfrage.");
  }
  const art = formular.get("art") === "kontoauszug" ? "kontoauszug" : "vorjahr";
  const pruefung = await pruefeUpload(formular);
  if (!pruefung.ok) return fehler(pruefung.status, pruefung.meldung);

  try {
    const ergebnis = await verarbeiteUnterlage(id, { daten: pruefung.daten, mimeType: pruefung.mimeType, art }, abhaengigkeiten());
    const aktualisiert = await ladeFallMitZugang(id, req.headers.get(ZUGANG_HEADER));
    return json({ ...(await kundenansicht(aktualisiert!)), meldung: ergebnis.meldung });
  } catch (e) {
    if (e instanceof FallFehler) return fehler(e.status, e.message);
    throw e;
  }
}
