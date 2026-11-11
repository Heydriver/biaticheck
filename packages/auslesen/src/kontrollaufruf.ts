import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Zeilenprotokoll } from "@biaticheck/pruefkern";
import { KEINE_KONTROLLE, KONTROLL_PROMPT, KontrolleRoh, protokollFuerKontrolle, werteKontrolleAus, type Kontrolle } from "./kontrolle";
import { MODELL, type Dokument } from "./modell";

/** Aufruf der KI-Kontrolle über die Claude API (Auswertung und Regeln: kontrolle.ts, ohne API-Abhängigkeit). */

function inhaltsblock(d: Dokument): Anthropic.Beta.BetaContentBlockParam {
  const data = Buffer.from(d.daten).toString("base64");
  if (d.mimeType === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  return { type: "image", source: { type: "base64", media_type: d.mimeType, data } };
}

/** Ruft die KI-Kontrolle auf. Schlägt der Aufruf fehl, gilt die Kontrolle als nicht durchgeführt (kein Abbruch). */
export async function kontrolliere(
  client: Anthropic,
  dokumente: Dokument[],
  protokoll: Zeilenprotokoll,
): Promise<{ kontrolle: Kontrolle; nutzung: { eingabeTokens: number; ausgabeTokens: number } }> {
  const leer = { eingabeTokens: 0, ausgabeTokens: 0 };
  try {
    const antwort = await client.beta.messages.parse(
      {
        model: MODELL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: betaZodOutputFormat(KontrolleRoh) },
        system: [{ type: "text", text: KONTROLL_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [...dokumente.map(inhaltsblock), { type: "text", text: `Zeilenprotokoll der Formelprüfung:\n${protokollFuerKontrolle(protokoll)}\n\nKontrolliere das Protokoll Zeile für Zeile gegen das Dokument.` }] }],
      },
      { timeout: 5 * 60_000 },
    );
    const nutzung = { eingabeTokens: antwort.usage.input_tokens, ausgabeTokens: antwort.usage.output_tokens };
    const gueltig = KontrolleRoh.safeParse(antwort.parsed_output);
    if (antwort.stop_reason === "refusal" || antwort.stop_reason === "max_tokens" || !gueltig.success) {
      return { kontrolle: KEINE_KONTROLLE(antwort.stop_reason === "max_tokens" ? "Antwort abgeschnitten" : "keine gültige Antwort", protokoll.zeilen.length), nutzung };
    }
    return { kontrolle: werteKontrolleAus(gueltig.data, protokoll), nutzung };
  } catch (fehler) {
    return { kontrolle: KEINE_KONTROLLE(fehler instanceof Error ? fehler.message.slice(0, 200) : "unbekannter Fehler", protokoll.zeilen.length), nutzung: leer };
  }
}
