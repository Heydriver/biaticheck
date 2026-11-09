import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { bereinigeVerlauf, leseVorauszahlungen } from "../src/index";

describe("Vorauszahlungen aus nachgereichten Unterlagen", () => {
  it("bereinigt ungültige Daten und leere Zeilen, sortiert nach Datum", () => {
    expect(
      bereinigeVerlauf({
        dokument: "vorjahresabrechnung",
        verlauf: [
          { ab: "2024-03-01", betriebskosten: 150, heizkosten: 110 },
          { ab: "2024-01-01", betriebskosten: 140, heizkosten: null },
          { ab: "01.05.2024", betriebskosten: 160, heizkosten: 120 },
          { ab: "2024-06-01", betriebskosten: null, heizkosten: null },
          { ab: "2024-07-01", betriebskosten: -5, heizkosten: 0 },
        ],
        abrechnungszeitraum: { von: "2023-01-01", bis: "2023-12-31" },
        hinweis: "",
      }),
    ).toEqual({
      quelle: "vorjahresabrechnung",
      verlauf: [
        { ab: "2024-01-01", betriebskosten: 140 },
        { ab: "2024-03-01", betriebskosten: 150, heizkosten: 110 },
      ],
      abrechnungszeitraum: { von: "2023-01-01", bis: "2023-12-31" },
      hinweis: "",
    });
  });

  it("ruft das Modell mit Zeitraum auf und gibt den bereinigten Verlauf zurück", async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      parsed_output: { dokument: "kontoauszug", verlauf: [{ ab: "2024-01-01", betriebskosten: null, heizkosten: 110 }], abrechnungszeitraum: null, hinweis: "" },
    });
    const client = { beta: { messages: { parse } } } as unknown as Anthropic;
    const ergebnis = await leseVorauszahlungen(client, [{ daten: new Uint8Array([1]), mimeType: "image/png" }], { von: "2024-01-01", bis: "2024-12-31" });
    expect(ergebnis).toEqual({ quelle: "kontoauszug", verlauf: [{ ab: "2024-01-01", heizkosten: 110 }], hinweis: "" });
    const anfrage = parse.mock.calls[0]![0];
    expect(JSON.stringify(anfrage.messages)).toContain("2024-01-01 bis 2024-12-31");
  });

  it("Ablehnung durch das Modell wird als Fehler gemeldet", async () => {
    const client = { beta: { messages: { parse: vi.fn().mockResolvedValue({ stop_reason: "refusal", parsed_output: null }) } } } as unknown as Anthropic;
    await expect(leseVorauszahlungen(client, [{ daten: new Uint8Array([1]), mimeType: "image/png" }], undefined)).rejects.toThrow("abgelehnt");
  });
});
