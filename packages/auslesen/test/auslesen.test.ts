import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { pruefeAbrechnung } from "@biaticheck/pruefkern";
import { describe, expect, it, vi } from "vitest";
import { G001 } from "../../pruefkern/test/golden/G-001";
import { AuslesenFehler, erkenneDokumenttyp, leseAus, pruefeKonsistenz, Rohdaten, vergleiche, wandleUm } from "../src/index";
import { G001_ROH } from "./G-001.roh";

const roh = (): Rohdaten => structuredClone(G001_ROH);
const PDF = { daten: new TextEncoder().encode("%PDF-1.7 ..."), mimeType: "application/pdf" as const };

/** Attrappe für den Anthropic-Client mit vorgegebener Antwort. */
function client(antwort: Partial<{ stop_reason: string; parsed_output: unknown; stop_details: unknown }> | Error) {
  const parse = vi.fn(async () => {
    if (antwort instanceof Error) throw antwort;
    return { model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 500 }, stop_reason: "end_turn", parsed_output: null, ...antwort };
  });
  return { c: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

describe("Ausgabeformat", () => {
  it("lässt sich in ein Format für strukturierte Ausgabe umwandeln", () => {
    expect(() => betaZodOutputFormat(Rohdaten)).not.toThrow();
  });
  it("die Musterausgabe entspricht dem Schema", () => {
    expect(Rohdaten.safeParse(G001_ROH).success).toBe(true);
  });
});

describe("Umwandlung", () => {
  it("ideale Modellausgabe ergibt exakt den Golden-Set-Fall G-001", () => {
    const { abrechnung } = wandleUm(roh());
    const v = vergleiche(G001, abrechnung);
    expect(v.abweichungen).toEqual([]);
    expect(v.quote).toBe(1);
  });

  it("führt zum selben Prüfergebnis wie der Golden-Set-Fall", () => {
    const aus = pruefeAbrechnung(wandleUm(roh()).abrechnung, { heute: "2026-10-29" });
    const golden = pruefeAbrechnung(G001, { heute: "2026-10-29" });
    const kurz = (b: typeof aus) => b.ergebnisse.map((e) => `${e.regelId}:${e.status}`);
    expect(kurz(aus)).toEqual(kurz(golden));
    expect(aus.zusammenfassung).toEqual(golden.zusammenfassung);
  });

  it("verwirft ungültige Datumsangaben mit Hinweis", () => {
    const r = roh();
    r.erstelltAm = "25.11.2025";
    r.abrechnungszeitraumVon = "2025-01-01"; // nach dem Ende
    const { abrechnung, hinweise } = wandleUm(r);
    expect(abrechnung.meta.erstelltAm).toBeUndefined();
    expect(abrechnung.meta.abrechnungszeitraum).toBeUndefined();
    expect(hinweise.join("\n")).toMatch(/Ungültiges Datum in erstelltAm/);
    expect(hinweise.join("\n")).toMatch(/Beginn 2025-01-01 liegt nach Ende/);
  });

  it("meldet abweichende Kategorie-Zuordnung", () => {
    const r = roh();
    r.kostenpositionen[7]!.kategorie = "gebaeudereinigung_ungeziefer"; // Hausmeisterkosten
    expect(wandleUm(r).hinweise.join("\n")).toMatch(/Kategorie prüfen: „Hausmeisterkosten“/);
  });

  it("übernimmt Unsicherheiten des Modells als Hinweis", () => {
    expect(wandleUm(roh()).hinweise).toContain("Modell unsicher: Gesamteinheiten Satellitenanlage: 20,89 ST passt nicht zum Betrag");
  });
});

describe("Selbstkontrolle", () => {
  it("G-001 ist in sich stimmig", () => {
    expect(pruefeKonsistenz(wandleUm(roh()).abrechnung)).toEqual({ konsistent: true, gruende: [] });
  });

  it("erkennt eine vergessene Position (typischer Lesefehler)", () => {
    const r = roh();
    r.kostenpositionen.splice(2, 1); // Müll fehlt
    const k = pruefeKonsistenz(wandleUm(r).abrechnung);
    expect(k.konsistent).toBe(false);
    expect(k.gruende[0]).toMatch(/Positionen ergeben 3609.96 €, ausgewiesen sind 3917.21 €/);
  });

  it("erkennt Zahlendreher in einer Position", () => {
    const r = roh();
    r.kostenpositionen[3]!.anteilMieter = 159.12; // statt 195,12
    const gruende = pruefeKonsistenz(wandleUm(r).abrechnung).gruende.join("\n");
    expect(gruende).toMatch(/„Gebäude-Versicherung“/);
  });

  it("erkennt doppelt gezähltes Kaltwasser", () => {
    const r = roh();
    r.heizkosten!.anteilMieter = 2362.82; // inkl. Kaltwasser, obwohl als Position erfasst
    expect(pruefeKonsistenz(wandleUm(r).abrechnung).konsistent).toBe(false);
  });

  it("erkennt falsches Vorzeichen beim Saldo", () => {
    const r = roh();
    r.saldo = -1214.88;
    expect(pruefeKonsistenz(wandleUm(r).abrechnung).gruende.join()).toMatch(/Saldo/);
  });
});

describe("Modellaufruf", () => {
  it("liefert stimmige Auslesung", async () => {
    const { c, parse } = client({ parsed_output: roh() });
    const a = await leseAus(c, [PDF]);
    expect(a.konsistenz.konsistent).toBe(true);
    expect(a.nutzung).toEqual({ eingabeTokens: 1000, ausgabeTokens: 500 });
    const anfrage = (parse.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(anfrage.model).toBe("claude-opus-5-5");
    expect(anfrage.fallbacks).toBe("default");
  });

  it("erkennt Dokumente, die keine Nebenkostenabrechnung sind", async () => {
    const { c } = client({ parsed_output: { ...roh(), istNebenkostenabrechnung: false } });
    const a = await leseAus(c, [PDF]);
    expect(a.abrechnung).toBeUndefined();
    expect(a.konsistenz.konsistent).toBe(false);
  });

  it.each([
    [{ stop_reason: "refusal", stop_details: { category: "cyber" } }, "abgelehnt"],
    [{ stop_reason: "max_tokens" }, "abgeschnitten"],
    [{ parsed_output: null }, "kein_ergebnis"],
  ])("Fehlerfall %j → %s", async (antwort, code) => {
    const { c } = client(antwort);
    await expect(leseAus(c, [PDF])).rejects.toMatchObject({ code });
  });

  it("lehnt leere Dokumentliste ab", async () => {
    await expect(leseAus(client({}).c, [])).rejects.toBeInstanceOf(AuslesenFehler);
  });
});

describe("Dateityp", () => {
  it.each([
    [[0x25, 0x50, 0x44, 0x46, 0x2d, 0x31], "application/pdf"],
    [[0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[0x50, 0x4b, 0x03, 0x04], undefined], // ZIP/DOCX
    [[0x3c, 0x68, 0x74, 0x6d, 0x6c], undefined], // <html als .pdf getarnt
  ])("%j → %s", (bytes, typ) => {
    expect(erkenneDokumenttyp(new Uint8Array(bytes))).toBe(typ);
  });
});

describe("Plausibilität einzelner Werte", () => {
  it("verwirft unmöglichen Verbrauchsanteil", () => {
    const r = roh();
    r.heizkosten!.verbrauchsanteilProzent = 700; // Komma verrutscht
    const { abrechnung, hinweise } = wandleUm(r);
    expect(abrechnung.heizkosten?.verbrauchsanteilProzent).toBeUndefined();
    expect(hinweise.join()).toMatch(/700 % unplausibel/);
  });
});
