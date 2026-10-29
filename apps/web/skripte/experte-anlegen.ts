/**
 * Legt ein Experten-Konto an oder setzt das Passwort neu.
 *   DATABASE_URL=... pnpm experte:anlegen anna@biati.de "Anna Muster"
 * Das Passwort wird verdeckt abgefragt (nicht in der Shell-Historie).
 */
import { createInterface } from "node:readline/promises";
import { erstelleDb } from "../src/server/db/verbindung";
import { experten } from "../src/server/db/schema";
import { hashePasswort, MIN_PASSWORTLAENGE } from "../src/server/intern/passwort";

const [email, name] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!email || !name || !url) {
  console.error('Aufruf: DATABASE_URL=... pnpm experte:anlegen <email> "<Name>"');
  process.exit(1);
}

async function frageVerdeckt(frage: string): Promise<string> {
  if (process.env.EXPERTE_PASSWORT) return process.env.EXPERTE_PASSWORT; // für automatisierte Einrichtung
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const ausgabe = rl as unknown as { _writeToOutput: (s: string) => void };
  const original = ausgabe._writeToOutput.bind(rl);
  ausgabe._writeToOutput = (s) => original(s.startsWith(frage) ? s : "*");
  const antwort = await rl.question(frage);
  rl.close();
  process.stdout.write("\n");
  return antwort;
}

const passwort = await frageVerdeckt(`Passwort (mind. ${MIN_PASSWORTLAENGE} Zeichen): `);
const passwortHash = await hashePasswort(passwort);
const { db, schliessen } = erstelleDb(url);
await db
  .insert(experten)
  .values({ email: email.toLowerCase(), name, passwortHash })
  .onConflictDoUpdate({ target: experten.email, set: { name, passwortHash, aktiv: true } });
await schliessen();
console.log(`Konto für ${name} <${email.toLowerCase()}> ist eingerichtet.`);
