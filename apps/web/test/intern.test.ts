import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pruefeAbrechnung } from "@biaticheck/pruefkern";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { G001 } from "../../../packages/pruefkern/test/golden/G-001";
import { erstelleDb } from "@/server/db/verbindung";
import { experten, faelle, protokoll, sitzungen } from "@/server/db/schema";
import { gebeFrei, listeFaelle, regelnMitAnderemErgebnis, loescheAbgelaufene, setzeZurueck, speichereDaten, validiereDaten } from "@/server/intern/faelle";
import { hashePasswort, pruefePasswort } from "@/server/intern/passwort";
import { beende, experteZuToken, melde, type Experte } from "@/server/intern/sitzung";
import { lokalerSpeicher } from "@/server/speicher";

const { db, schliessen } = erstelleDb(process.env.TEST_DATABASE_URL ?? "postgresql://biaticheck:biaticheck@localhost:5432/biaticheck_test");
afterAll(schliessen);

const PASSWORT = "sehr-sicheres-passwort-123";
let hash: string;
let anna: Experte;

beforeEach(async () => {
  await db.execute(sql`truncate faelle, experten cascade`);
  hash ??= await hashePasswort(PASSWORT);
  const [e] = await db.insert(experten).values({ email: "anna@biati.de", name: "Anna", passwortHash: hash }).returning();
  anna = { id: e!.id, name: e!.name, email: e!.email };
});

async function fall(werte: Partial<typeof faelle.$inferInsert> = {}) {
  const [f] = await db
    .insert(faelle)
    .values({ zugangHash: "x", loeschenAm: new Date(Date.now() + 864e5), status: "expertenpruefung", ...werte })
    .returning();
  return f!.id;
}
const lade = async (id: string) => (await db.select().from(faelle).where(eq(faelle.id, id)))[0];

describe("Passwörter", () => {
  it("prüft richtig und falsch, Hash enthält kein Klartextpasswort", async () => {
    expect(hash).not.toContain(PASSWORT);
    expect(await pruefePasswort(PASSWORT, hash)).toBe(true);
    expect(await pruefePasswort(PASSWORT + "x", hash)).toBe(false);
    expect(await pruefePasswort(PASSWORT, "kaputt")).toBe(false);
  });
  it("lehnt zu kurze Passwörter ab", async () => {
    await expect(hashePasswort("kurz")).rejects.toThrow(/mindestens 12/);
  });
});

describe("Anmeldung und Sitzung", () => {
  it("meldet an, erkennt die Sitzung und beendet sie", async () => {
    const ergebnis = await melde(db, "  ANNA@biati.de ", PASSWORT);
    expect(ergebnis?.experte.name).toBe("Anna");
    expect(await experteZuToken(db, ergebnis!.token)).toMatchObject({ email: "anna@biati.de" });
    await beende(db, ergebnis!.token);
    expect(await experteZuToken(db, ergebnis!.token)).toBeUndefined();
  });

  it("gleiche Antwort bei unbekannter E-Mail und falschem Passwort", async () => {
    expect(await melde(db, "anna@biati.de", "falsch-falsch-falsch")).toBeUndefined();
    expect(await melde(db, "niemand@biati.de", PASSWORT)).toBeUndefined();
  });

  it("deaktivierte Konten und abgelaufene Sitzungen haben keinen Zugang", async () => {
    const { token } = (await melde(db, "anna@biati.de", PASSWORT))!;
    await db.update(sitzungen).set({ laeuftAbAm: new Date(Date.now() - 1000) });
    expect(await experteZuToken(db, token)).toBeUndefined();

    const zweite = (await melde(db, "anna@biati.de", PASSWORT))!;
    await db.update(experten).set({ aktiv: false });
    expect(await experteZuToken(db, zweite.token)).toBeUndefined();
    expect(await melde(db, "anna@biati.de", PASSWORT)).toBeUndefined();
  });
});

describe("Daten korrigieren", () => {
  it("validiert und meldet verständlich, wo etwas fehlt", () => {
    const r = validiereDaten({ meta: {}, kostenpositionen: [{ id: "a", bezeichnung: "X", kategorie: "erfunden", anteilMieter: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler[0]?.pfad).toBe("kostenpositionen.0.kategorie");
  });

  it("manuelles Erfassen macht einen nicht erkannten Fall wieder prüfbar", async () => {
    const id = await fall({ status: "kein_nebenkostendokument" });
    const bericht = await speichereDaten(db, id, G001, anna, "2026-10-29");
    expect(bericht.zusammenfassung.klaerungspotenzial).toBe(1236.44);
    expect((await lade(id))?.status).toBe("expertenpruefung");
    const p = await db.select().from(protokoll).where(eq(protokoll.fallId, id));
    expect(p[0]).toMatchObject({ akteur: "experte:anna@biati.de", aktion: "daten_korrigiert" });
  });

  it("kein Bearbeiten während des automatischen Auslesens", async () => {
    const id = await fall({ status: "wird_ausgelesen" });
    await expect(speichereDaten(db, id, G001, anna)).rejects.toMatchObject({ status: 409 });
  });
});

describe("Freigabe", () => {
  it("misst, was der Experte gegenüber der KI korrigiert hat", async () => {
    const automatisch = structuredClone(G001);
    automatisch.kostenpositionen[2]!.kategorie = "verwaltung"; // KI hat Müll falsch zugeordnet
    const id = await fall({ datenAutomatisch: automatisch, daten: G001, bericht: pruefeAbrechnung(G001, { heute: "2026-10-29" }) });

    await gebeFrei(db, id, anna, "2026-10-29");

    expect((await lade(id))?.status).toBe("fertig");
    const [eintrag] = await db.select().from(protokoll).where(eq(protokoll.fallId, id));
    expect(eintrag?.aktion).toBe("freigegeben");
    expect(eintrag?.details).toMatchObject({
      manuellErfasst: false,
      felderKorrigiert: ["position „Müllentsorgung“.kategorie"],
      regelnGeaendert: ["I-01"],
    });
    expect((eintrag?.details as { feldquote: number }).feldquote).toBeLessThan(1);
  });

  it("unveränderte Prüfung ergibt keine geänderten Regeln – auch bei Regeln mit mehreren Ergebnissen", () => {
    const b = pruefeAbrechnung(G001, { heute: "2026-10-29" });
    expect(b.ergebnisse.filter((e) => e.regelId === "R-05")).toHaveLength(2);
    expect(regelnMitAnderemErgebnis(b, structuredClone(b))).toEqual([]);
  });

  it("ohne Daten oder im falschen Status keine Freigabe", async () => {
    await expect(gebeFrei(db, await fall(), anna)).rejects.toMatchObject({ status: 409 });
    const fertig = await fall({ status: "fertig", daten: G001, bericht: pruefeAbrechnung(G001) });
    await expect(gebeFrei(db, fertig, anna)).rejects.toMatchObject({ status: 409 });
  });

  it("Arbeitsliste zeigt offene Prüfungen zuerst", async () => {
    await fall({ status: "fertig" });
    const offen = await fall({ status: "expertenpruefung" });
    expect((await listeFaelle(db))[0]?.id).toBe(offen);
  });

  it("erneutes Auslesen nicht während eines laufenden Auslesens", async () => {
    await expect(setzeZurueck(db, await fall({ status: "wird_ausgelesen" }), anna)).rejects.toMatchObject({ status: 409 });
    const id = await fall({ status: "fertig" });
    await setzeZurueck(db, id, anna);
    expect((await lade(id))?.status).toBe("fehler");
  });
});

describe("Löschfrist", () => {
  it("löscht abgelaufene Fälle mit Dateien, behält laufende", async () => {
    const speicher = lokalerSpeicher(await mkdtemp(path.join(tmpdir(), "bck-")));
    const alt = await fall({ loeschenAm: new Date(Date.now() - 1000) });
    const neu = await fall();
    await speicher.speichere(`${alt}/${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`, new Uint8Array([1]));

    expect(await loescheAbgelaufene(db, speicher)).toBe(1);
    expect(await lade(alt)).toBeUndefined();
    expect(await lade(neu)).toBeDefined();
    await expect(speicher.lade(`${alt}/${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`)).rejects.toThrow();
  });
});
