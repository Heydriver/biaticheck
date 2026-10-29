/**
 * Liest eine Abrechnung über die Claude API aus und prüft sie.
 *
 *   pnpm auslesen <datei.pdf> [--golden G-001]
 *
 * Mit --golden wird das Ergebnis mit dem vom Experten erfassten Fall verglichen.
 * Benötigt ANTHROPIC_API_KEY. Ausgaben enthalten keine personenbezogenen Daten.
 */
import Anthropic from "@anthropic-ai/sdk";
import { pruefeAbrechnung, type AbrechnungEingabe } from "@biaticheck/pruefkern";
import { readFile } from "node:fs/promises";
import { erkenneDokumenttyp, leseAus, vergleiche } from "./index";

const [pfad, ...rest] = process.argv.slice(2);
if (!pfad) {
  console.error("Aufruf: pnpm auslesen <datei.pdf> [--golden G-001]");
  process.exit(1);
}
const goldenId = rest[rest.indexOf("--golden") + 1];

const daten = new Uint8Array(await readFile(pfad));
const mimeType = erkenneDokumenttyp(daten);
if (!mimeType) {
  console.error("Kein PDF, JPEG oder PNG.");
  process.exit(1);
}

const start = Date.now();
const auslesung = await leseAus(new Anthropic(), [{ daten, mimeType }]);
console.log(`Ausgelesen in ${((Date.now() - start) / 1000).toFixed(1)} s mit ${auslesung.modell}`);
console.log(`Tokens: ${auslesung.nutzung.eingabeTokens} ein / ${auslesung.nutzung.ausgabeTokens} aus`);
console.log(`Konsistent: ${auslesung.konsistenz.konsistent ? "ja" : "NEIN"}`);
for (const g of auslesung.konsistenz.gruende) console.log(`  - ${g}`);
for (const h of auslesung.hinweise) console.log(`  Hinweis: ${h}`);

if (!auslesung.abrechnung) process.exit(0);

const bericht = pruefeAbrechnung(auslesung.abrechnung);
console.log(`\nPrüfung: ${JSON.stringify(bericht.zusammenfassung.anzahl)}`);
console.log(`Einsparpotenzial ${bericht.zusammenfassung.einsparpotenzial} €, Klärungspotenzial ${bericht.zusammenfassung.klaerungspotenzial} €`);
for (const e of bericht.ergebnisse.filter((x) => x.status !== "ok")) console.log(`  [${e.status}] ${e.regelId} ${e.titel}`);

if (goldenId && rest.includes("--golden")) {
  const modul = (await import(`../../pruefkern/test/golden/${goldenId}.ts`)) as Record<string, AbrechnungEingabe>;
  const golden = Object.values(modul)[0]!;
  const v = vergleiche(golden, auslesung.abrechnung);
  console.log(`\nVergleich mit ${goldenId}: ${v.richtig}/${v.felder} Felder richtig (${(v.quote * 100).toFixed(1)} %)`);
  for (const a of v.abweichungen) console.log(`  ✗ ${a.feld}: erwartet ${JSON.stringify(a.erwartet)}, gelesen ${JSON.stringify(a.gelesen)}`);
}
