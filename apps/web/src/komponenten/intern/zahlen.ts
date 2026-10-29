/**
 * Deutsche Zahleneingabe → Zahl.
 *   "1.214,88" → 1214.88   "84,28" → 84.28   "1.214" → 1214 (Tausenderpunkt)
 *   "84.28" → 84.28 (Dezimalpunkt, wenn kein Tausendermuster)   "" → undefined   "abc" → NaN
 */
export function leseZahl(text: string): number | undefined {
  const t = text.trim().replace(/\s|€/g, "");
  if (t === "") return undefined;
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else normal = t;
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

export const zeigeZahl = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "" : String(n).replace(".", ","));

/** true, wenn irgendwo in den Daten eine ungültige Zahl (NaN) steht. */
export function enthaeltUngueltigeZahl(wert: unknown): boolean {
  if (typeof wert === "number") return !Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.some(enthaeltUngueltigeZahl);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltUngueltigeZahl);
  return false;
}
