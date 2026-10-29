import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NUTZER_ANWEISUNG, SYSTEM_PROMPT } from "./prompt.js";
import { Rohdaten } from "./rohdaten.js";

export const MODELL = "claude-opus-5-5";

export type Dokumenttyp = "application/pdf" | "image/jpeg" | "image/png";

export interface Dokument {
  daten: Uint8Array;
  mimeType: Dokumenttyp;
}

export type AuslesenFehlerCode = "abgelehnt" | "abgeschnitten" | "kein_ergebnis" | "api";

export class AuslesenFehler extends Error {
  constructor(
    readonly code: AuslesenFehlerCode,
    message: string,
    readonly wiederholbar = false,
  ) {
    super(message);
  }
}

export interface Modellaufruf {
  rohdaten: Rohdaten;
  modell: string;
  nutzung: { eingabeTokens: number; ausgabeTokens: number };
}

function inhaltsblock(d: Dokument): Anthropic.Beta.BetaContentBlockParam {
  const data = Buffer.from(d.daten).toString("base64");
  if (d.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return { type: "image", source: { type: "base64", media_type: d.mimeType, data } };
}

/** Ruft das Modell auf und liefert die strukturierte Rohausgabe. */
export async function rufeModellAuf(client: Anthropic, dokumente: Dokument[]): Promise<Modellaufruf> {
  if (dokumente.length === 0) throw new AuslesenFehler("kein_ergebnis", "Keine Dokumente übergeben");

  let antwort;
  try {
    antwort = await client.beta.messages.parse(
      {
        model: MODELL,
        max_tokens: 16000,
        // Bei einer Ablehnung durch Sicherheitsfilter übernimmt automatisch ein geeignetes Ersatzmodell.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: betaZodOutputFormat(Rohdaten) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: [...dokumente.map(inhaltsblock), { type: "text", text: NUTZER_ANWEISUNG }] }],
      },
      { timeout: 5 * 60_000 },
    );
  } catch (fehler) {
    if (fehler instanceof Anthropic.RateLimitError || fehler instanceof Anthropic.InternalServerError || fehler instanceof Anthropic.APIConnectionError) {
      throw new AuslesenFehler("api", `Claude API vorübergehend nicht erreichbar: ${fehler.message}`, true);
    }
    if (fehler instanceof Anthropic.APIError) {
      throw new AuslesenFehler("api", `Claude API Fehler ${fehler.status}: ${fehler.message}`);
    }
    throw fehler;
  }

  if (antwort.stop_reason === "refusal") {
    throw new AuslesenFehler("abgelehnt", `Auslesen abgelehnt (${antwort.stop_details?.category ?? "ohne Kategorie"})`);
  }
  if (antwort.stop_reason === "max_tokens") {
    throw new AuslesenFehler("abgeschnitten", "Antwort abgeschnitten – Abrechnung zu umfangreich", false);
  }
  if (!antwort.parsed_output) throw new AuslesenFehler("kein_ergebnis", "Modell lieferte keine gültigen Daten");

  return {
    rohdaten: antwort.parsed_output,
    modell: antwort.model,
    nutzung: { eingabeTokens: antwort.usage.input_tokens, ausgabeTokens: antwort.usage.output_tokens },
  };
}
