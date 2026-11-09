import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AuslesenFehler, MODELL, type Dokument } from "./modell";

/**
 * Liest aus einer nachgereichten Unterlage (Vorjahresabrechnung, Kontoauszüge, Mietkonto)
 * die monatlichen Vorauszahlungen mit Änderungsdatum. Rechnen übernimmt danach die Regel R-05.
 */
export const VorauszahlungenRoh = z.object({
  dokument: z.enum(["vorjahresabrechnung", "kontoauszug", "mietkonto", "anderes"]),
  verlauf: z.array(
    z.object({
      ab: z.string().describe("Datum im Format YYYY-MM-DD, ab dem der Monatsbetrag galt"),
      betriebskosten: z.number().nullable().describe("monatliche Vorauszahlung Betriebskosten in Euro oder null"),
      heizkosten: z.number().nullable().describe("monatliche Vorauszahlung Heizkosten in Euro oder null"),
    }),
  ),
  abrechnungszeitraum: z
    .object({ von: z.string().describe("YYYY-MM-DD"), bis: z.string().describe("YYYY-MM-DD") })
    .nullable()
    .describe("Abrechnungszeitraum, wenn das Dokument selbst eine Nebenkostenabrechnung ist; sonst null"),
  hinweis: z.string().describe("kurz, was unsicher war; sonst leer"),
});
export type VorauszahlungenRoh = z.infer<typeof VorauszahlungenRoh>;

export interface Vorauszahlungsverlauf {
  quelle: "vorjahresabrechnung" | "kontoauszug";
  verlauf: { ab: string; betriebskosten?: number; heizkosten?: number }[];
  /** Abrechnungszeitraum der nachgereichten Abrechnung (nur bei Vorjahresabrechnungen). */
  abrechnungszeitraum?: { von: string; bis: string };
  hinweis: string;
}

export const VORAUSZAHLUNGEN_PROMPT = `Du liest eine Unterlage eines Mieters aus: eine Nebenkostenabrechnung des Vorjahres, Kontoauszüge oder ein Mietkonto.
Ermittle die monatlichen Vorauszahlungen (Abschläge) für Betriebskosten und für Heizkosten, die im angegebenen Zeitraum galten, jeweils mit dem Datum, ab dem der Betrag galt.
- In einer Vorjahresabrechnung steht das meist als „neue monatliche Vorauszahlung ab …“.
- Übernimm nur Beträge, die ausdrücklich als Vorauszahlung oder Abschlag für Betriebs- oder Heizkosten erkennbar sind. Teile eine Gesamtmiete nicht selbst auf.
- Zahlen genau übernehmen, nicht runden. Deutsche Schreibweise umwandeln: "1.214,88" → 1214.88.
- Übernimm keine Namen, Anschriften, Kontonummern oder IBAN.
- Ist das Dokument selbst eine Nebenkostenabrechnung, gib ihren Abrechnungszeitraum an.
- Findest du nichts Passendes, gib eine leere Liste zurück.`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Bereinigt die Modellausgabe: gültige Daten, positive Beträge, sortiert. */
export function bereinigeVerlauf(roh: VorauszahlungenRoh): Vorauszahlungsverlauf {
  const positiv = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 && v < 100_000 ? v : undefined);
  const verlauf = roh.verlauf
    .filter((v) => ISO.test(v.ab) && !Number.isNaN(Date.parse(v.ab)))
    .map((v) => ({ ab: v.ab, betriebskosten: positiv(v.betriebskosten), heizkosten: positiv(v.heizkosten) }))
    .filter((v) => v.betriebskosten !== undefined || v.heizkosten !== undefined)
    .map((v) => Object.fromEntries(Object.entries(v).filter(([, w]) => w !== undefined)) as Vorauszahlungsverlauf["verlauf"][number])
    .sort((a, b) => a.ab.localeCompare(b.ab));
  const z = roh.abrechnungszeitraum;
  const zeitraum = z && ISO.test(z.von) && ISO.test(z.bis) && z.von < z.bis ? { von: z.von, bis: z.bis } : undefined;
  return {
    quelle: roh.dokument === "vorjahresabrechnung" ? "vorjahresabrechnung" : "kontoauszug",
    verlauf,
    ...(zeitraum && roh.dokument === "vorjahresabrechnung" ? { abrechnungszeitraum: zeitraum } : {}),
    hinweis: roh.hinweis,
  };
}

function inhaltsblock(d: Dokument): Anthropic.Beta.BetaContentBlockParam {
  const data = Buffer.from(d.daten).toString("base64");
  if (d.mimeType === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  return { type: "image", source: { type: "base64", media_type: d.mimeType, data } };
}

export async function leseVorauszahlungen(
  client: Anthropic,
  dokumente: Dokument[],
  zeitraum: { von: string; bis: string } | undefined,
): Promise<Vorauszahlungsverlauf> {
  if (dokumente.length === 0) throw new AuslesenFehler("kein_ergebnis", "Keine Dokumente übergeben");
  let antwort;
  try {
    antwort = await client.beta.messages.parse(
      {
        model: MODELL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: betaZodOutputFormat(VorauszahlungenRoh) },
        system: [{ type: "text", text: VORAUSZAHLUNGEN_PROMPT }],
        messages: [
          {
            role: "user",
            content: [...dokumente.map(inhaltsblock), { type: "text", text: `Zeitraum: ${zeitraum ? `${zeitraum.von} bis ${zeitraum.bis}` : "Abrechnungsjahr"}. Ermittle die monatlichen Vorauszahlungen.` }],
          },
        ],
      },
      { timeout: 3 * 60_000 },
    );
  } catch (fehler) {
    if (fehler instanceof Anthropic.RateLimitError || fehler instanceof Anthropic.InternalServerError || fehler instanceof Anthropic.APIConnectionError) {
      throw new AuslesenFehler("api", `Claude API vorübergehend nicht erreichbar: ${fehler.message}`, true);
    }
    if (fehler instanceof Anthropic.APIError) throw new AuslesenFehler("api", `Claude API Fehler ${fehler.status}: ${fehler.message}`);
    throw fehler;
  }
  if (antwort.stop_reason === "refusal") throw new AuslesenFehler("abgelehnt", "Auslesen abgelehnt");
  if (!antwort.parsed_output) throw new AuslesenFehler("kein_ergebnis", "Modell lieferte keine gültigen Daten");
  return bereinigeVerlauf(antwort.parsed_output);
}
