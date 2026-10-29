import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pruefeAbrechnung } from "@biaticheck/pruefkern";
import { describe, expect, it } from "vitest";
import { G001 } from "../../../packages/pruefkern/test/golden/G-001";
import { erstelleFallAnsicht } from "@/server/ansicht";
import type { faelle } from "@/server/db/schema";
import { EnvSchema } from "@/server/env";
import { erstelleRatenbegrenzung } from "@/server/ratenbegrenzung";
import { lokalerSpeicher } from "@/server/speicher";
import { MAX_DATEIGROESSE, pruefeUpload } from "@/server/upload";
import { ermittleStatus } from "@/server/verarbeitung";
import { erzeugeZugang, pruefeZugang } from "@/server/zugang";

const SCHLUESSEL = Buffer.alloc(32, 7).toString("base64");
const PDF = new TextEncoder().encode("%PDF-1.7\nInhalt mit IBAN DE00 1234");

describe("Zugangstoken", () => {
  it("akzeptiert nur das passende Token", () => {
    const { token, hash } = erzeugeZugang();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hash).not.toContain(token);
    expect(pruefeZugang(token, hash)).toBe(true);
    expect(pruefeZugang(token.slice(0, -1) + "x", hash)).toBe(false);
    expect(pruefeZugang("", hash)).toBe(false);
    expect(pruefeZugang(null, hash)).toBe(false);
    expect(pruefeZugang("a".repeat(5000), hash)).toBe(false);
  });
});

describe("Dateispeicher", () => {
  const id = "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222";

  it("verschlüsselt: auf der Platte steht kein Klartext, Laden liefert das Original", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bck-"));
    const s = lokalerSpeicher(dir, SCHLUESSEL);
    await s.speichere(id, PDF);
    const roh = await readFile(path.join(dir, id));
    expect(roh.includes(Buffer.from("IBAN"))).toBe(false);
    expect(await s.lade(id)).toEqual(PDF);
  });

  it("erkennt manipulierte Dateien", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bck-"));
    const s = lokalerSpeicher(dir, SCHLUESSEL);
    await s.speichere(id, PDF);
    const roh = await readFile(path.join(dir, id));
    roh[roh.length - 1] = roh[roh.length - 1]! ^ 0xff;
    await writeFile(path.join(dir, id), roh);
    await expect(s.lade(id)).rejects.toThrow();
  });

  it("verweigert unverschlüsselte Dateien, wenn Verschlüsselung aktiv ist", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bck-"));
    await lokalerSpeicher(dir).speichere(id, PDF);
    await expect(lokalerSpeicher(dir, SCHLUESSEL).lade(id)).rejects.toThrow(/Unverschlüsselte Datei/);
  });

  it.each(["../../etc/passwd", "abc", `${"1".repeat(36)}/../x`, "/absolut"])("verhindert Pfadausbruch: %s", async (schluessel) => {
    const s = lokalerSpeicher(await mkdtemp(path.join(tmpdir(), "bck-")));
    await expect(s.speichere(schluessel, PDF)).rejects.toThrow(/Ungültiger Speicherschlüssel/);
  });
});

describe("Ratenbegrenzung", () => {
  it("lässt n Anfragen je Fenster zu", () => {
    let zeit = 0;
    const r = erstelleRatenbegrenzung(2, 1000, () => zeit);
    expect([r.erlaube("a"), r.erlaube("a"), r.erlaube("a"), r.erlaube("b")]).toEqual([true, true, false, true]);
    zeit = 1001;
    expect(r.erlaube("a")).toBe(true);
  });
});

describe("Upload-Prüfung", () => {
  const formular = (datei?: Blob, einwilligung = "ja") => {
    const f = new FormData();
    if (datei) f.set("datei", datei, "abrechnung.pdf");
    f.set("einwilligung", einwilligung);
    return f;
  };

  it("akzeptiert ein PDF mit Einwilligung", async () => {
    expect(await pruefeUpload(formular(new Blob([PDF])))).toMatchObject({ ok: true, mimeType: "application/pdf" });
  });
  it("verlangt Einwilligung", async () => {
    expect(await pruefeUpload(formular(new Blob([PDF]), "nein"))).toMatchObject({ ok: false, status: 400 });
  });
  it("verlangt eine Datei", async () => {
    expect(await pruefeUpload(formular())).toMatchObject({ ok: false, status: 400 });
  });
  it("lehnt getarnte Dateien ab (HTML mit .pdf-Endung)", async () => {
    expect(await pruefeUpload(formular(new Blob(["<html><script>alert(1)</script>"])))).toMatchObject({ ok: false, status: 415 });
  });
  it("lehnt zu große Dateien ab", async () => {
    expect(await pruefeUpload(formular(new Blob([new Uint8Array(MAX_DATEIGROESSE + 1)])))).toMatchObject({ ok: false, status: 413 });
  });
});

describe("Konfiguration", () => {
  const basis = { DATABASE_URL: "postgresql://x@localhost/db" };
  it("verlangt im Produktivbetrieb einen Dateischlüssel", () => {
    expect(EnvSchema.safeParse({ ...basis, NODE_ENV: "production" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ...basis, NODE_ENV: "production", DATEI_SCHLUESSEL: SCHLUESSEL }).success).toBe(true);
  });
  it("lehnt zu kurze Schlüssel ab", () => {
    expect(EnvSchema.safeParse({ ...basis, DATEI_SCHLUESSEL: "kurz" }).success).toBe(false);
  });
  it("Freigabe durch Experten ist standardmäßig an", () => {
    expect(EnvSchema.parse(basis).FREIGABE_ERFORDERLICH).toBe(true);
  });
});

describe("Statusentscheidung", () => {
  it.each([
    [{ istNebenkostenabrechnung: false, konsistent: true, freigabeErforderlich: false }, "kein_nebenkostendokument"],
    [{ istNebenkostenabrechnung: true, konsistent: false, freigabeErforderlich: false }, "expertenpruefung"],
    [{ istNebenkostenabrechnung: true, konsistent: true, freigabeErforderlich: true }, "expertenpruefung"],
    [{ istNebenkostenabrechnung: true, konsistent: true, freigabeErforderlich: false }, "fertig"],
  ] as const)("%j → %s", (eingabe, status) => {
    expect(ermittleStatus(eingabe)).toBe(status);
  });
});

describe("Kundenansicht", () => {
  const bericht = pruefeAbrechnung(G001, { heute: "2026-10-29" });
  const fall = (status: (typeof faelle.$inferSelect)["status"]) =>
    ({ id: "x", status, bericht, daten: G001, erstelltAm: new Date(), zugangHash: "geheim", auslesung: null }) as unknown as typeof faelle.$inferSelect;

  it("zeigt vor der Freigabe kein Ergebnis", () => {
    expect(erstelleFallAnsicht(fall("expertenpruefung")).erstauswertung).toBeUndefined();
  });

  it("gibt nie interne Daten, Hash oder bezahlte Inhalte heraus", () => {
    const json = JSON.stringify(erstelleFallAnsicht(fall("fertig")));
    expect(json).not.toContain("geheim");
    expect(json).not.toContain("kostenpositionen");
    for (const e of bericht.ergebnisse) expect(json).not.toContain(e.erklaerung);
  });
});
