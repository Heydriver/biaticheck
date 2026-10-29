import type { Dokumenttyp } from "./modell";

/**
 * Erkennt den Dateityp am Inhalt (Magic Bytes), nicht an Dateiendung oder
 * Browser-Angabe – beide lassen sich beliebig fälschen.
 */
export function erkenneDokumenttyp(daten: Uint8Array): Dokumenttyp | undefined {
  const beginntMit = (...bytes: number[]) => bytes.every((b, i) => daten[i] === b);
  if (beginntMit(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (beginntMit(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (beginntMit(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  return undefined;
}
