import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { pruefeAbrechnung } from "@biaticheck/pruefkern";
import { describe, expect, it, vi } from "vitest";
import { G001 } from "../../pruefkern/test/golden/G-001";
import { erstelleZeilenprotokoll } from "@biaticheck/pruefkern";
import { AuslesenFehler, erkenneDokumenttyp, KONTROLL_PROMPT, KontrolleRoh, leseAus, pruefeKonsistenz, Rohdaten, vergleiche, wandleUm, werteKontrolleAus } from "../src/index";
import { G001_ROH } from "./G-001.roh";

const roh = (): Rohdaten => structuredClone(G001_ROH);
const PDF = { daten: new TextEncoder().encode("%PDF-1.7 ..."), mimeType: "application/pdf" as const };

type Antwort = Partial<{ stop_reason: string; parsed_output: unknown; stop_details: unknown }> | Error;
type Anfrage = { system: { text: string }[]; messages: { content: { type: string; text?: string }[] }[] };

/** Zeilennummern aus der Kontrollanfrage – für eine Antwort, die jede Zeile bestätigt. */
function zeilenAus(anfrage: Anfrage): number[] {
  const text = anfrage.messages[0]!.content.find((b) => b.type === "text")!.text!;
  return (JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as { nr: number }[]).map((x) => x.nr);
}

/**
 * Attrappe für den Anthropic-Client mit vorgegebener Antwort.
 * Die KI-Kontrolle (zweiter Aufruf) bestätigt ohne eigene Vorgabe jede Zeile.
 */
function client(antwort: Antwort, kontrolle?: Antwort | ((nrn: number[]) => KontrolleRoh)) {
  const parse = vi.fn(async (anfrage: Anfrage) => {
    const basis = { model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 500 }, stop_reason: "end_turn", parsed_output: null };
    if (anfrage.system[0]!.text === KONTROLL_PROMPT) {
      if (kontrolle instanceof Error) throw kontrolle;
      const nrn = zeilenAus(anfrage);
      const alleRichtig: KontrolleRoh = { zeilen: nrn.map((nr) => ({ nr, gelesen: "richtig", abweichung: null })), fehlendeZeilen: [], auffaelligkeiten: [] };
      if (typeof kontrolle === "function") return { ...basis, parsed_output: kontrolle(nrn) };
      return { ...basis, parsed_output: alleRichtig, ...kontrolle };
    }
    if (antwort instanceof Error) throw antwort;
    return { ...basis, ...antwort };
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

  it("übernimmt Erläuterungen, Aufschlüsselungen und Unterart bis in die Prüfung", () => {
    const r = roh();
    const aufzug = r.kostenpositionen.find((p) => p.kategorie === "aufzug")!;
    aufzug.bezeichnung = "Aufzug: Betrieb, Wartung und Prüfung";
    aufzug.bestandteile = [{ bezeichnung: "Reparatur Türantrieb", betrag: 400 }];
    r.erlaeuterungen = [{ text: "Hauswart und Aufzug enthalten keine Reparaturkosten.", seite: 2 }];
    r.kostenpositionen[0]!.hinweise = ["Grundsteuerbescheid vom 03.02.2024"];
    const { abrechnung } = wandleUm(r);
    expect(abrechnung.erlaeuterungen).toEqual([{ text: "Hauswart und Aufzug enthalten keine Reparaturkosten.", seite: 2 }]);
    expect(abrechnung.kostenpositionen[0]!.hinweise).toEqual(["Grundsteuerbescheid vom 03.02.2024"]);
    const i07 = pruefeAbrechnung(abrechnung, { heute: "2026-10-29" }).ergebnisse.find((e) => e.regelId === "I-07" && e.status !== "ok")!;
    // Ausgewiesene Reparatur geht der pauschalen Erklärung vor
    expect(i07.status).toBe("abweichung");
  });

  it("übernimmt im Dokument belegte Zahlungen: höhere Buchungsübersicht wird ein belegter Fehler", () => {
    const r = roh();
    r.gezahlteVorauszahlungenHeizkosten = r.vorauszahlungenHeizkosten! + 100;
    r.gezahlteVorauszahlungenSeite = 4;
    const { abrechnung } = wandleUm(r);
    expect(abrechnung.vorauszahlungenDetail?.gezahlt).toEqual({ heizkosten: r.vorauszahlungenHeizkosten! + 100, seite: 4 });
    const r05 = pruefeAbrechnung(abrechnung, { heute: "2026-10-29" }).ergebnisse.find((e) => e.regelId === "R-05" && e.status === "abweichung")!;
    expect(r05.betragZugunstenMieter).toBe(100);
  });

  it("übernimmt Zählerstände, Rechnungsnummern und Leistungsnachweise bis in die Prüfung", () => {
    const r = roh();
    r.zaehler = [{ art: "kaltwasser", bezeichnung: "Bad", anfang: 100, ende: 140, verbrauchUebernommen: 48, faktor: null, faktorLautProtokoll: null, seite: 3 }];
    const garten = r.kostenpositionen.filter((p) => p.kategorie === "gartenpflege");
    garten[0]!.belegnummer = "RE 2024-118";
    garten[1]!.belegnummer = "RE 2024-118";
    garten[1]!.gesamtkosten = garten[0]!.gesamtkosten;
    r.kostenpositionen.find((p) => p.bezeichnung === "Dachrinnenreinigung")!.hinweise = ["Leistungsnachweis: schadhafte Dachrinne repariert."];
    const { abrechnung } = wandleUm(r);
    expect(abrechnung.zaehler).toEqual([{ art: "kaltwasser", bezeichnung: "Bad", anfang: 100, ende: 140, verbrauchUebernommen: 48, seite: 3 }]);
    const fehler = pruefeAbrechnung(abrechnung, { heute: "2026-10-29" }).ergebnisse.filter((e) => e.status === "abweichung").map((e) => e.regelId);
    expect(fehler).toEqual(expect.arrayContaining(["I-16", "I-07"]));
  });

  it("übernimmt Belege, Zählerfaktor und Gutschriften bis in die Prüfung", () => {
    const r = roh();
    const garten = r.kostenpositionen.find((p) => p.kategorie === "gartenpflege")!;
    r.belege = [
      { positionBezeichnung: garten.bezeichnung, bezeichnung: "Rechnung Gartenpflege", art: "rechnung", betrag: 800, uebernommen: 952, objekt: null, fremdesObjekt: false, beruecksichtigt: null, seite: 5 },
      { positionBezeichnung: "Müllentsorgung", bezeichnung: "Rechnung Containerdienst", art: "rechnung", betrag: 500, uebernommen: null, objekt: "anderes Objekt in Leipzig", fremdesObjekt: true, beruecksichtigt: null, seite: 6 },
      { positionBezeichnung: "Heizkosten", bezeichnung: "Gutschrift Preiskorrektur", art: "gutschrift", betrag: 600, uebernommen: null, objekt: null, fremdesObjekt: false, beruecksichtigt: false, seite: 7 },
      { positionBezeichnung: "Gibt es nicht", bezeichnung: "Rechnung unbekannt", art: "rechnung", betrag: 10, uebernommen: null, objekt: null, fremdesObjekt: false, beruecksichtigt: null, seite: null },
    ];
    r.zaehler = [{ art: "heizung", bezeichnung: "Wärmezähler", anfang: 12000, ende: 16800, verbrauchUebernommen: 9600, faktor: 2, faktorLautProtokoll: 1, seite: 6 }];
    r.heizkosten!.verbrauchMieter = 9600;
    r.heizkosten!.verbrauchskostenMieter = 1260;
    const { abrechnung, hinweise } = wandleUm(r);
    expect(abrechnung.belege!.map((b) => b.zuPosition)).toEqual([expect.stringMatching(/^p\d+$/), expect.stringMatching(/^p\d+$/), "heizkosten"]);
    expect(hinweise.join(" ")).toContain("Rechnung unbekannt");
    const fehler = pruefeAbrechnung(abrechnung, { heute: "2026-10-29" }).ergebnisse.filter((e) => e.status === "abweichung").map((e) => e.titel.split(":")[0]);
    expect(fehler).toEqual(expect.arrayContaining(["Umsatzsteuer doppelt aufgeschlagen", "Rechnung eines anderen Hauses umgelegt", "Gutschrift nicht abgezogen", "Falscher Faktor beim Wärmezähler"]));
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
    // Zwei Aufrufe: Auslesen und KI-Kontrolle
    expect(parse).toHaveBeenCalledTimes(2);
    expect(a.nutzung).toEqual({ eingabeTokens: 2000, ausgabeTokens: 1000 });
    expect(a.kontrolle).toMatchObject({ durchgefuehrt: true, bestanden: true, lesefehler: [], fehlendeZeilen: [], auffaelligkeiten: [] });
    expect(a.kontrolle!.zeilenBestaetigt).toBe(a.kontrolle!.zeilenGesamt);
    expect(a.kontrolle!.zeilenGesamt).toBeGreaterThan(20);
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

  it("ohne KI-Kontrolle nur ein Aufruf", async () => {
    const { c, parse } = client({ parsed_output: roh() });
    const a = await leseAus(c, [PDF], { kontrolle: false });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(a.kontrolle).toBeUndefined();
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

describe("Postleitzahl", () => {
  it.each([
    ["80937", "80937"],
    ["80 937", "80937"],
    ["8093", undefined],
    ["D-80937", undefined],
  ])("%j → %j", (eingabe, erwartet) => {
    const r = roh();
    r.plz = eingabe;
    expect(wandleUm(r).abrechnung.meta.plz).toBe(erwartet);
  });
});

describe("KI-Kontrolle (Unterschritt 2)", () => {
  const alle = (nrn: number[]): KontrolleRoh => ({ zeilen: nrn.map((nr) => ({ nr, gelesen: "richtig", abweichung: null })), fehlendeZeilen: [], auffaelligkeiten: [] });

  it("Lesefehler in einer Zeile → nicht konsistent, Fall geht an den Fachprüfer", async () => {
    const { c } = client({ parsed_output: roh() }, (nrn) => ({ ...alle(nrn), zeilen: alle(nrn).zeilen.map((z) => (z.nr === 3 ? { nr: 3, gelesen: "abweichend", abweichung: "Betrag im Dokument 317,25 statt 307,25" } : z)) }));
    const a = await leseAus(c, [PDF]);
    expect(a.kontrolle!.bestanden).toBe(false);
    expect(a.kontrolle!.lesefehler).toEqual([{ nr: 3, bezeichnung: "Müllentsorgung", abweichung: "Betrag im Dokument 317,25 statt 307,25" }]);
    expect(a.konsistenz.konsistent).toBe(false);
    expect(a.konsistenz.gruende.join(" ")).toContain("Zeile 3 „Müllentsorgung“");
  });

  it("Zeile, zu der die KI nichts sagt, gilt als nicht bestätigt", async () => {
    const { c } = client({ parsed_output: roh() }, (nrn) => ({ ...alle(nrn), zeilen: alle(nrn).zeilen.filter((z) => z.nr !== 5) }));
    const a = await leseAus(c, [PDF]);
    expect(a.kontrolle!.lesefehler).toEqual([expect.objectContaining({ nr: 5, abweichung: "von der Kontrolle nicht bestätigt" })]);
    expect(a.kontrolle!.zeilenBestaetigt).toBe(a.kontrolle!.zeilenGesamt - 1);
    expect(a.konsistenz.konsistent).toBe(false);
  });

  it("fehlende Zeile im Protokoll → nicht konsistent", async () => {
    const { c } = client({ parsed_output: roh() }, (nrn) => ({ ...alle(nrn), fehlendeZeilen: [{ bezeichnung: "Winterdienst", betrag: 41.2, seite: 5 }] }));
    const a = await leseAus(c, [PDF]);
    expect(a.kontrolle!.fehlendeZeilen).toEqual([{ bezeichnung: "Winterdienst", betrag: 41.2, seite: 5 }]);
    expect(a.konsistenz.gruende.join(" ")).toContain("Zeile fehlt – „Winterdienst“");
  });

  it("Auffälligkeit mit Textstelle → an den Fachprüfer; ohne Textstelle verworfen", async () => {
    const { c } = client({ parsed_output: roh() }, (nrn) => ({
      ...alle(nrn),
      auffaelligkeiten: [
        { zeileNr: 1, beschreibung: "Fußnote nennt eine Nachberechnung für 2022 in der Grundsteuer.", textstelle: "inkl. Nachberechnung 2022", seite: 5 },
        { zeileNr: null, beschreibung: "Die Kosten wirken hoch.", textstelle: "", seite: null },
      ],
    }));
    const a = await leseAus(c, [PDF]);
    expect(a.kontrolle!.auffaelligkeiten).toEqual([{ zeileNr: 1, bezeichnung: "Grundsteuer", beschreibung: "Fußnote nennt eine Nachberechnung für 2022 in der Grundsteuer.", textstelle: "inkl. Nachberechnung 2022", seite: 5 }]);
    // Der Fund steht in den Daten und wird vom Prüfkern als begründeter Prüfbedarf an der Position gemeldet
    expect(a.abrechnung!.kontrollbefunde).toEqual([{ beschreibung: "Fußnote nennt eine Nachberechnung für 2022 in der Grundsteuer.", textstelle: "inkl. Nachberechnung 2022", positionId: "p01", seite: 5 }]);
    const k01 = pruefeAbrechnung(a.abrechnung!, { heute: "2026-10-29" }).ergebnisse.filter((e) => e.regelId === "K-01");
    expect(k01).toEqual([expect.objectContaining({ status: "auffaelligkeit", positionId: "p01", textstelle: "inkl. Nachberechnung 2022" })]);
    expect(k01[0]!.betragZugunstenMieter).toBeUndefined();
    expect(a.konsistenz.konsistent).toBe(false);
  });

  it("Auffälligkeit zu einer Zeile, die die Formelprüfung schon beanstandet, ist kein neuer Punkt", () => {
    const { abrechnung } = wandleUm(roh());
    const protokoll = erstelleZeilenprotokoll(pruefeAbrechnung(abrechnung, { heute: "2026-10-29" }), abrechnung);
    const beanstandet = protokoll.zeilen.find((z) => z.ergebnis === "pruefbedarf")!;
    const k = werteKontrolleAus(
      { zeilen: protokoll.zeilen.map((z) => ({ nr: z.nr, gelesen: "richtig" as const, abweichung: null })), fehlendeZeilen: [], auffaelligkeiten: [{ zeileNr: beanstandet.nr, beschreibung: "Kabelkosten nach Juni 2024.", textstelle: beanstandet.bezeichnung, seite: null }] },
      protokoll,
    );
    expect(k.auffaelligkeiten).toEqual([]);
    expect(k.bestanden).toBe(true);
  });

  it("Kontrolle nicht erreichbar oder ungültig → nicht bestanden, aber kein Abbruch", async () => {
    const ausfall = await leseAus(client({ parsed_output: roh() }, new Error("Zeitüberschreitung")).c, [PDF]);
    expect(ausfall.abrechnung).toBeDefined();
    expect(ausfall.kontrolle).toMatchObject({ durchgefuehrt: false, bestanden: false });
    expect(ausfall.konsistenz.gruende.join(" ")).toContain("KI-Kontrolle nicht durchgeführt: Zeitüberschreitung");
    const ungueltig = await leseAus(client({ parsed_output: roh() }, { parsed_output: { unsinn: true } }).c, [PDF]);
    expect(ungueltig.kontrolle!.durchgefuehrt).toBe(false);
    expect(ungueltig.konsistenz.konsistent).toBe(false);
  });

  it("das Kontrollformat lässt sich für strukturierte Ausgabe umwandeln", () => {
    expect(() => betaZodOutputFormat(KontrolleRoh)).not.toThrow();
  });
});
