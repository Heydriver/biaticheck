/**
 * Löscht Fälle nach Ablauf der Aufbewahrungsfrist (täglich per Cron ausführen).
 *   pnpm aufraeumen
 */
import { erstelleDb } from "../src/server/db/verbindung";
import { loescheAbgelaufene } from "../src/server/intern/faelle";
import { lokalerSpeicher } from "../src/server/speicher";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt");
const { db, schliessen } = erstelleDb(url);
const anzahl = await loescheAbgelaufene(db, lokalerSpeicher(process.env.UPLOAD_DIR ?? "./.daten/uploads", process.env.DATEI_SCHLUESSEL));
await schliessen();
console.log(`${anzahl} abgelaufene Fälle gelöscht.`);
