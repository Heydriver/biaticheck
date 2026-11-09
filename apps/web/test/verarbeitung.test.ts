import type Anthropic from "@anthropic-ai/sdk";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { G001_ROH } from "../../../packages/auslesen/test/G-001.roh";
import { erstelleDb } from "@/server/db";
import { antworten, dokumente, faelle, protokoll } from "@/server/db/schema";
import { lokalerSpeicher, type Dateispeicher } from "@/server/speicher";
import { beantworteRueckfrage, FallFehler, verarbeiteFall, verarbeiteUnterlage, type Abhaengigkeiten } from "@/server/verarbeitung";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://biaticheck:biaticheck@localhost:5432/biaticheck_test";
const { db, schliessen } = erstelleDb(TEST_DB);
afterAll(schliessen);

let speicher: Dateispeicher;
beforeEach(async () => {
  await db.execute(sql`truncate faelle cascade`);
  speicher = lokalerSpeicher(await mkdtemp(path.join(tmpdir(), "bck-")), Buffer.alloc(32, 1).toString("base64"));
});

async function neuerFall() {
  const [fall] = await db.insert(faelle).values({ zugangHash: "x", loeschenAm: new Date(Date.now() + 864e5) }).returning();
  const [dok] = await db
    .insert(dokumente)
    .values({ fallId: fall!.id, art: "abrechnung", mimeType: "application/pdf", groesse: 10, sha256: "x", speicherschluessel: "-" })
    .returning();
  const schluessel = `${fall!.id}/${dok!.id}`;
  await speicher.speichere(schluessel, new TextEncoder().encode("%PDF-1.7"));
  await db.update(dokumente).set({ speicherschluessel: schluessel }).where(eq(dokumente.id, dok!.id));
  return fall!.id;
}

function fakeClient(antwort: () => unknown) {
  const parse = vi.fn(async () => antwort());
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}
const ok = () => ({ model: "claude-opus-5-5", usage: { input_tokens: 20000, output_tokens: 3000 }, stop_reason: "end_turn", parsed_output: structuredClone(G001_ROH) });

function deps(extra: Partial<Abhaengigkeiten> = {}): Abhaengigkeiten {
  return { db, speicher, freigabeErforderlich: false, heute: () => "2026-10-29", ...extra };
}
const lade = async (id: string) => (await db.select().from(faelle).where(eq(faelle.id, id)))[0]!;
const aktionen = async (id: string) => (await db.select().from(protokoll).where(eq(protokoll.fallId, id))).map((p) => p.aktion);

describe("Verarbeitung eines Falls", () => {
  it("liest aus, prüft und speichert den Bericht", async () => {
    const id = await neuerFall();
    const { client } = fakeClient(ok);
    await verarbeiteFall(id, deps({ client }));

    const fall = await lade(id);
    expect(fall.status).toBe("fertig");
    expect(fall.bericht?.zusammenfassung.klaerungspotenzial).toBe(13.57);
    expect(fall.auslesung?.konsistenz.konsistent).toBe(true);
    expect(fall.auslesung?.nutzung.eingabeTokens).toBe(20000);
    expect(await aktionen(id)).toEqual(["ausgelesen_und_geprueft"]);
  });

  it("hält das Ergebnis zurück, solange Expertenfreigabe nötig ist", async () => {
    const id = await neuerFall();
    await verarbeiteFall(id, deps({ client: fakeClient(ok).client, freigabeErforderlich: true }));
    expect((await lade(id)).status).toBe("expertenpruefung");
  });

  it("schickt unstimmige Auslesungen zum Experten", async () => {
    const id = await neuerFall();
    const roh = structuredClone(G001_ROH);
    roh.kostenpositionen.pop(); // Position vergessen
    await verarbeiteFall(id, deps({ client: fakeClient(() => ({ ...ok(), parsed_output: roh })).client }));
    const fall = await lade(id);
    expect(fall.status).toBe("expertenpruefung");
    expect(fall.auslesung?.konsistenz.gruende[0]).toMatch(/Positionen ergeben/);
  });

  it("Demo-Modus ohne API-Schlüssel: Musterabrechnung, klar als Demo gekennzeichnet", async () => {
    const id = await neuerFall();
    await verarbeiteFall(id, deps({ demoAuslesen: true }));
    const fall = await lade(id);
    expect(fall.status).toBe("fertig");
    expect(fall.auslesung?.modell).toBe("demo");
    expect(fall.auslesung?.hinweise[0]).toMatch(/Demo-Modus/);
    expect(fall.daten?.meta.plz).toBe("80937");
  });

  it("ohne API-Schlüssel landet der Fall beim Experten", async () => {
    const id = await neuerFall();
    await verarbeiteFall(id, deps());
    expect(await lade(id)).toMatchObject({ status: "expertenpruefung", fehler: "Automatisches Auslesen ist nicht konfiguriert" });
  });

  it("Ablehnung durch das Modell → Experte, kein erneuter Versuch", async () => {
    const id = await neuerFall();
    await verarbeiteFall(id, deps({ client: fakeClient(() => ({ ...ok(), stop_reason: "refusal", stop_details: null })).client }));
    expect((await lade(id)).status).toBe("expertenpruefung");
  });

  it("unerwarteter Fehler → Status 'fehler', nie hängend in 'wird_ausgelesen'", async () => {
    const id = await neuerFall();
    const kaputt: Dateispeicher = { ...speicher, lade: async () => Promise.reject(new Error("Platte voll")) };
    await expect(verarbeiteFall(id, deps({ client: fakeClient(ok).client, speicher: kaputt }))).rejects.toThrow("Platte voll");
    expect(await lade(id)).toMatchObject({ status: "fehler" });
    expect(await aktionen(id)).toContain("verarbeitung_abgebrochen");
  });

  it("gleichzeitiger Start liest nur einmal aus (keine doppelten API-Kosten)", async () => {
    const id = await neuerFall();
    const { client, parse } = fakeClient(ok);
    await Promise.all([verarbeiteFall(id, deps({ client })), verarbeiteFall(id, deps({ client })), verarbeiteFall(id, deps({ client }))]);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("ein fertiger Fall wird nicht erneut ausgelesen", async () => {
    const id = await neuerFall();
    const { client, parse } = fakeClient(ok);
    await verarbeiteFall(id, deps({ client }));
    await verarbeiteFall(id, deps({ client }));
    expect(parse).toHaveBeenCalledTimes(1);
  });
});

describe("Rückfragen", () => {
  it("Antwort wird gespeichert, Prüfung aktualisiert und bei erneutem Auslesen wieder angewendet", async () => {
    const id = await neuerFall();
    const { client } = fakeClient(ok);
    await verarbeiteFall(id, deps({ client }));

    await beantworteRueckfrage(id, "meta.zugangAm", "2025-11-28", deps());
    const f02 = (await lade(id)).bericht!.ergebnisse.find((e) => e.regelId === "F-02");
    expect(f02?.status).toBe("ok");
    expect(await db.select().from(antworten).where(eq(antworten.fallId, id))).toHaveLength(1);

    // Erneutes Auslesen (z. B. nach Korrektur) verliert die Antwort nicht
    await db.update(faelle).set({ status: "fehler" }).where(eq(faelle.id, id));
    await verarbeiteFall(id, deps({ client }));
    expect((await lade(id)).daten?.meta.zugangAm).toBe("2025-11-28");
  });

  it("ungültige Antworten werden abgelehnt und nicht gespeichert", async () => {
    const id = await neuerFall();
    await verarbeiteFall(id, deps({ client: fakeClient(ok).client }));
    await expect(beantworteRueckfrage(id, "meta.zugangAm", "gestern", deps())).rejects.toBeInstanceOf(FallFehler);
    await expect(beantworteRueckfrage(id, "kostenpositionen", [], deps())).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(antworten).where(eq(antworten.fallId, id))).toHaveLength(0);
  });

  it("vor dem Auslesen sind keine Antworten möglich", async () => {
    const id = await neuerFall();
    await expect(beantworteRueckfrage(id, "meta.zugangAm", "2025-11-28", deps())).rejects.toMatchObject({ status: 409 });
  });
});

describe("Löschen", () => {
  it("Löschen eines Falls entfernt Dokumente, Antworten und Protokoll", async () => {
    const id = await neuerFall();
    await verarbeiteFall(id, deps({ client: fakeClient(ok).client }));
    await db.delete(faelle).where(eq(faelle.id, id));
    expect(await db.select().from(dokumente).where(eq(dokumente.fallId, id))).toHaveLength(0);
    expect(await db.select().from(protokoll).where(eq(protokoll.fallId, id))).toHaveLength(0);
  });
});

describe("Nachgereichte Unterlage zum Prüfbedarf (Vorauszahlungen)", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  async function ausgewerteterFall() {
    const id = await neuerFall();
    await verarbeiteFall(id, deps({ client: fakeClient(ok).client }));
    await beantworteRueckfrage(id, "meta.zugangAm", "2025-11-28", deps());
    return id;
  }
  const r05 = async (id: string) => (await lade(id)).bericht!.ergebnisse.filter((e) => e.regelId === "R-05" && e.beleg?.art === "heizkosten")[0]!;

  it("vorher: Prüfbedarf ohne Betrag im Potenzial", async () => {
    const id = await ausgewerteterFall();
    expect((await r05(id)).status).toBe("pruefbedarf");
    expect((await lade(id)).bericht!.zusammenfassung.klaerungspotenzial).toBe(13.57);
  });

  it("Kontoauszug belegt höhere Zahlungen: wird ein sicherer Fehler, Datei verschlüsselt abgelegt", async () => {
    const id = await ausgewerteterFall();
    const { client, parse } = fakeClient(() => ({
      stop_reason: "end_turn",
      parsed_output: { dokument: "kontoauszug", verlauf: [{ ab: "2024-01-01", betriebskosten: null, heizkosten: 110 }], hinweis: "" },
    }));
    const ergebnis = await verarbeiteUnterlage(id, { daten: png, mimeType: "image/png", art: "kontoauszug" }, deps({ client }));
    expect(parse).toHaveBeenCalledOnce();
    expect(ergebnis.art).toBe("uebernommen");
    expect(ergebnis.meldung).toMatch(/^Bestätigt: Bei Ihren Vorauszahlungen fehlen 143,59/);
    expect(await r05(id)).toMatchObject({ status: "abweichung", betragZugunstenMieter: 143.59 });
    expect((await lade(id)).bericht!.zusammenfassung.einsparpotenzial).toBe(143.59);
    const doks = await db.select().from(dokumente).where(eq(dokumente.fallId, id));
    expect(doks.map((d) => d.art).sort()).toEqual(["abrechnung", "kontoauszug"]);
    const neu = doks.find((d) => d.art === "kontoauszug")!;
    expect(await speicher.lade(neu.speicherschluessel)).toEqual(png);
    expect(await aktionen(id)).toEqual(expect.arrayContaining(["unterlage_nachgereicht", "vorauszahlungen_uebernommen"]));
    expect((await db.select().from(antworten).where(eq(antworten.fallId, id))).map((a) => a.feld)).toContain("vorauszahlungenDetail.verlauf");
  });

  it("Vorjahresabrechnung erklärt die Differenz: Punkt erledigt", async () => {
    const id = await ausgewerteterFall();
    const { client } = fakeClient(() => ({
      stop_reason: "end_turn",
      parsed_output: { dokument: "vorjahresabrechnung", verlauf: [{ ab: "2024-01-01", betriebskosten: null, heizkosten: 98.03 }], hinweis: "" },
    }));
    const ergebnis = await verarbeiteUnterlage(id, { daten: png, mimeType: "image/png", art: "vorjahr" }, deps({ client }));
    expect(ergebnis.meldung).toMatch(/^Alles in Ordnung/);
    expect((await r05(id)).status).toBe("ok");
  });

  it("ohne KI-Zugang: Unterlage geht an einen Fachprüfer, Ergebnis unverändert", async () => {
    const id = await ausgewerteterFall();
    const ergebnis = await verarbeiteUnterlage(id, { daten: png, mimeType: "image/png", art: "vorjahr" }, deps());
    expect(ergebnis.art).toBe("experte");
    expect((await r05(id)).status).toBe("pruefbedarf");
    expect(await aktionen(id)).toContain("unterlage_an_experte");
  });

  it("Unterlage ohne Vorauszahlungen: verständliche Meldung, nichts übernommen", async () => {
    const id = await ausgewerteterFall();
    const { client } = fakeClient(() => ({ stop_reason: "end_turn", parsed_output: { dokument: "anderes", verlauf: [], hinweis: "" } }));
    const ergebnis = await verarbeiteUnterlage(id, { daten: png, mimeType: "image/png", art: "vorjahr" }, deps({ client }));
    expect(ergebnis.art).toBe("nichts_gefunden");
    expect((await r05(id)).status).toBe("pruefbedarf");
  });
});
