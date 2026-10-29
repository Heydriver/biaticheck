import { sql } from "drizzle-orm";
import { experten } from "../src/server/db/schema";
import { erstelleDb } from "../src/server/db/verbindung";
import { hashePasswort } from "../src/server/intern/passwort";

export const TEST_EXPERTE = { email: "pruefer@biati.de", name: "Petra Prüfer", passwort: "e2e-test-passwort-123" };

/** Legt vor den Browser-Tests ein Experten-Konto in der Testdatenbank an. */
export default async function vorbereitung() {
  const { db, schliessen } = erstelleDb(process.env.TEST_DATABASE_URL ?? "postgresql://biaticheck:biaticheck@localhost:5432/biaticheck_test");
  await db.execute(sql`truncate faelle, experten cascade`);
  await db.insert(experten).values({
    email: TEST_EXPERTE.email,
    name: TEST_EXPERTE.name,
    passwortHash: await hashePasswort(TEST_EXPERTE.passwort),
  });
  await schliessen();
}
