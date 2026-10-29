import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (passwort: string, salt: Buffer, laenge: number, optionen: object) => Promise<Buffer>;

// Parameter nach OWASP-Empfehlung für scrypt
const N = 2 ** 17;
const r = 8;
const p = 1;
const LAENGE = 64;
const OPTIONEN = { N, r, p, maxmem: 256 * N * r };

export const MIN_PASSWORTLAENGE = 12;

export async function hashePasswort(passwort: string): Promise<string> {
  if (passwort.length < MIN_PASSWORTLAENGE) throw new Error(`Passwort muss mindestens ${MIN_PASSWORTLAENGE} Zeichen haben`);
  const salt = randomBytes(16);
  const hash = await scryptAsync(passwort, salt, LAENGE, OPTIONEN);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function pruefePasswort(passwort: string, gespeichert: string): Promise<boolean> {
  const [verfahren, n, rr, pp, salt, hash] = gespeichert.split("$");
  if (verfahren !== "scrypt" || !salt || !hash || passwort.length > 1000) return false;
  const erwartet = Buffer.from(hash, "base64");
  const ist = await scryptAsync(passwort, Buffer.from(salt, "base64"), erwartet.length, {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
    maxmem: 256 * Number(n) * Number(rr),
  });
  return timingSafeEqual(ist, erwartet);
}

/** Konstanter Vergleichs-Hash, damit unbekannte E-Mail-Adressen gleich lange dauern wie falsche Passwörter. */
export const DUMMY_HASH = `scrypt$${N}$${r}$${p}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(LAENGE).toString("base64")}`;
