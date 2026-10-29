import { erkenneDokumenttyp, type Dokumenttyp } from "@biaticheck/auslesen";

export const MAX_DATEIGROESSE = 20 * 1024 * 1024;

export type UploadPruefung =
  | { ok: true; daten: Uint8Array; mimeType: Dokumenttyp }
  | { ok: false; status: number; meldung: string };

/** Prüft einen Upload, bevor irgendetwas gespeichert oder an die KI geschickt wird. */
export async function pruefeUpload(formular: FormData): Promise<UploadPruefung> {
  if (formular.get("einwilligung") !== "ja") {
    return { ok: false, status: 400, meldung: "Bitte stimmen Sie der Verarbeitung Ihrer Abrechnung zu." };
  }
  const datei = formular.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    return { ok: false, status: 400, meldung: "Bitte wählen Sie eine Datei aus." };
  }
  if (datei.size > MAX_DATEIGROESSE) {
    return { ok: false, status: 413, meldung: "Die Datei ist größer als 20 MB." };
  }
  const daten = new Uint8Array(await datei.arrayBuffer());
  const mimeType = erkenneDokumenttyp(daten);
  if (!mimeType) {
    return { ok: false, status: 415, meldung: "Bitte laden Sie ein PDF oder ein Foto (JPG, PNG) Ihrer Abrechnung hoch." };
  }
  return { ok: true, daten, mimeType };
}
