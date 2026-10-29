import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Zugang zu einem Fall ohne Benutzerkonto: Der Kunde erhält einen Link mit
 * zufälligem Token. Gespeichert wird nur der Hash – ein Datenbankleck gibt
 * keine gültigen Links preis.
 */
export function erzeugeZugang(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashe(token) };
}

export function hashe(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function pruefeZugang(token: string | undefined | null, hash: string): boolean {
  if (!token || token.length > 100) return false;
  const a = Buffer.from(hashe(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
