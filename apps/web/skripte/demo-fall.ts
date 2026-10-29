/**
 * Legt einen Demo-Fall mit der anonymisierten Musterabrechnung G-001 an (nur Entwicklung).
 *   DATABASE_URL=... pnpm tsx skripte/demo-fall.ts
 */
import { pruefeAbrechnung } from "@biaticheck/pruefkern";
import { G001 } from "../../../packages/pruefkern/test/golden/G-001";
import { erstelleDb } from "../src/server/db";
import { faelle } from "../src/server/db/schema";
import { erzeugeZugang } from "../src/server/zugang";

const url = process.env.DATABASE_URL;
if (!url || process.env.NODE_ENV === "production") throw new Error("Nur für Entwicklung");

const { db, schliessen } = erstelleDb(url);
const { token, hash } = erzeugeZugang();
const [fall] = await db
  .insert(faelle)
  .values({
    zugangHash: hash,
    status: "fertig",
    daten: G001,
    bericht: pruefeAbrechnung(G001),
    loeschenAm: new Date(Date.now() + 7 * 864e5),
  })
  .returning({ id: faelle.id });
console.log(`/fall/${fall!.id}#${token}`);
await schliessen();
