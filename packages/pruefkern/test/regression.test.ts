import { describe, expect, it } from "vitest";
import { Abrechnung, erstelleStufe1, erstelleStufe2, monateZwischen, pruefeAbrechnung, vergleicheKosten, type AbrechnungEingabe, type Regelergebnis } from "../src/index";
import { abrechnung01, abrechnung02, abrechnung03 } from "./abrechnungen-test";

const HEUTE = "2025-07-01";
const nur = (e: Regelergebnis[], id: string) => e.filter((x) => x.regelId === id);
const zuPosition = (e: Regelergebnis[], positionId: string) => e.filter((x) => x.positionId === positionId);
const BEANSTANDET = new Set(["abweichung", "auffaelligkeit", "pruefbedarf"]);
const stufen = (a: AbrechnungEingabe) => {
  const bericht = pruefeAbrechnung(a, { heute: HEUTE });
  const s1 = erstelleStufe1(bericht, a, { heute: HEUTE });
  return { bericht, s1, s2: erstelleStufe2(bericht, a, s1) };
};

describe("Abrechnung 01 – Aufzug und Niederschlagswasser ohne unbegründete Warnung", () => {
  const { bericht, s1, s2 } = stufen(abrechnung01());

  it("erkennt das Guthaben von 93,05 € und rechnet es nach", () => {
    expect(s1.kosten.saldo).toBe(-93.05);
    expect(nur(bericht.ergebnisse, "R-03")[0]!.status).toBe("ok");
    expect(nur(bericht.ergebnisse, "R-02")[0]!.status).toBe("ok");
  });

  it("beanstandet „Aufzug: Betrieb, Wartung und Prüfung“ nicht und berücksichtigt die verneinende Erläuterung", () => {
    const aufzug = zuPosition(bericht.ergebnisse, "k11");
    expect(aufzug.filter((e) => BEANSTANDET.has(e.status))).toEqual([]);
    const i07 = aufzug.find((e) => e.regelId === "I-07")!;
    expect(i07.status).toBe("ok");
    expect(i07.textstelle).toBe("Hauswart und Aufzug enthalten keine Verwaltungs-, Reparatur- oder Instandsetzungskosten.");
  });

  it("beanstandet Niederschlagswasser nach Wohnfläche nicht – auch nicht bei vorhandenem Wasserzähler", () => {
    expect(zuPosition(bericht.ergebnisse, "k04").filter((e) => BEANSTANDET.has(e.status))).toEqual([]);
    const i09 = nur(bericht.ergebnisse, "I-09");
    expect(i09.map((e) => e.status)).toEqual(["ok"]);
    expect(nur(bericht.ergebnisse, "I-15")[0]!.status).toBe("ok");
  });

  it("leitet aus beiden Positionen kein Einspar- oder Klärungspotenzial ab", () => {
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(0);
    expect(bericht.zusammenfassung.klaerungspotenzial).toBe(0);
    expect(bericht.zusammenfassung.pruefbedarfBetrag).toBe(0);
    expect(bericht.zusammenfassung.anzahl.abweichung + bericht.zusammenfassung.anzahl.auffaelligkeit + bericht.zusammenfassung.anzahl.pruefbedarf).toBe(0);
    expect(s1.fehlerpotenzial.stufe).toBe("keins");
  });

  it("Zusammenfassung: keine Fehler; Vergleichswert nur als Einordnung", () => {
    expect(s2.zusammenfassung[0]).toMatch(/keine Fehler festgestellt\.$/);
    expect(s2.zusammenfassung.join(" ")).toContain("Vergleich mit dem Bundesdurchschnitt");
    expect(s2.zusammenfassung.join(" ")).toContain("kein Nachweis eines Fehlers");
    expect(s2.anschreiben.text).not.toContain("Aufzug");
    expect(s2.anschreiben.text).not.toContain("Niederschlagswasser");
    const p02 = s2.auffaelligkeiten.find((p) => p.regelId === "P-02");
    expect(p02).toBeUndefined(); // kalte Kosten 1.825 € / 75 m² / 12 = 2,03 € – unter 2,50 €
  });

  it("Kostenvergleich: Bundesdurchschnitt ausdrücklich benannt, 3,36 € (nicht 3,37 €), 26 % über 2,67 €", () => {
    const v = vergleicheKosten(Abrechnung.parse(abrechnung01()));
    if (!v.ok) throw new Error(v.grund);
    // 3.026,95 € / 75 m² / 12 Monate = 3,36328 € → gerundet 3,36 €
    expect(v.vergleich.gesamt.ihr).toBe(3.36);
    expect(v.vergleich.gesamt.durchschnitt).toBe(2.67);
    expect(v.vergleich.gesamt.abweichungProzent).toBe(26);
    expect(v.vergleich).toMatchObject({
      ebene: "bund",
      bezeichnung: "Vergleich mit dem Bundesdurchschnitt",
      basis: "gesamt",
      region: "Deutschland",
      jahr: 2024,
      regionalFolgt: "PLZ-Gebiet 04",
    });
    expect(v.vergleich.kostenarten).toContain("einschließlich Heizung und Warmwasser");
    expect(v.vergleich.quelle).toContain("Deutscher Mieterbund");
  });
});

describe("Monate und Rundung", () => {
  it("ein Kalenderjahr hat genau 12 Monate – auch im Schaltjahr", () => {
    expect(monateZwischen("2024-01-01", "2024-12-31")).toBe(12);
    expect(monateZwischen("2025-01-01", "2025-12-31")).toBe(12);
    expect(monateZwischen("2025-07-01", "2025-12-31")).toBe(6);
    expect(monateZwischen("2025-01-16", "2025-01-31")).toBeCloseTo(16 / 31, 10);
  });

  it("vergleicht ohne Heizkosten nur kalte mit kalten Kosten", () => {
    const a = abrechnung01();
    delete a.heizkosten;
    const v = vergleicheKosten(Abrechnung.parse(a));
    if (!v.ok) throw new Error(v.grund);
    expect(v.vergleich.basis).toBe("kalt");
    // 1.825 € / 75 m² / 12 = 2,03 € gegenüber 2,67 − 1,32 = 1,35 €
    expect(v.vergleich.gesamt).toMatchObject({ ihr: 2.03, durchschnitt: 1.35 });
    expect(v.vergleich.kostenarten).toContain("ohne Heizung");
  });
});

describe("Aufzug: nur konkrete Anhaltspunkte führen zu einem Befund", () => {
  it("expliziter Reparaturanteil: nur dieser wird beanstandet", () => {
    const a = abrechnung01();
    a.erlaeuterungen = [];
    a.kostenpositionen[10]!.bestandteile = [
      { bezeichnung: "Wartung und Prüfung", betrag: 1100 },
      { bezeichnung: "Reparatur Türantrieb", betrag: 400 },
    ];
    const e = pruefeAbrechnung(a, { heute: HEUTE });
    const i07 = zuPosition(e.ergebnisse, "k11").find((x) => x.regelId === "I-07")!;
    // 400 € × 150 / 1.500 = 40,00 € – nicht die ganzen 150 €
    expect(i07).toMatchObject({ status: "abweichung", betragZugunstenMieter: 40 });
    expect(i07.textstelle).toContain("Reparatur Türantrieb");
    expect(e.zusammenfassung.einsparpotenzial).toBe(40);
  });

  it("widersprüchliche Dokumente: pauschaler Ausschluss übersteuert keinen ausgewiesenen Reparaturbetrag", () => {
    const a = abrechnung01(); // enthält „… enthalten keine … Reparatur…kosten“
    a.kostenpositionen[10]!.bestandteile = [
      { bezeichnung: "Wartung und Prüfung", betrag: 1100 },
      { bezeichnung: "Reparatur Türantrieb (Anlage 3)", betrag: 400 },
    ];
    const i07 = zuPosition(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "k11").find((x) => x.regelId === "I-07")!;
    expect(i07).toMatchObject({ status: "abweichung", betragZugunstenMieter: 40 });
    expect(i07.erklaerung).toContain("Die Abrechnung erklärt zwar");
    expect(i07.beleg?.ausschlussImDokument).toBeDefined();
  });

  it("unaufgeschlüsselte Vollwartung: begründeter Prüfbedarf, keine sichere Ersparnis, Auswirkung nicht bezifferbar", () => {
    const a = abrechnung01();
    a.erlaeuterungen = [];
    a.kostenpositionen[10]!.bezeichnung = "Aufzug Vollwartungsvertrag";
    const { bericht, s1, s2 } = stufen(a);
    const i07 = zuPosition(bericht.ergebnisse, "k11").find((x) => x.regelId === "I-07")!;
    expect(i07).toMatchObject({ status: "pruefbedarf", betroffen: 150, unterlagen: ["rechnungen"] });
    expect(i07.betragZugunstenMieter).toBeUndefined();
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(0);
    expect(bericht.zusammenfassung.klaerungspotenzial).toBe(0);
    expect(bericht.zusammenfassung.pruefbedarfBetrag).toBe(0);
    expect(s1.fehlerpotenzial.pruefbedarf).toMatchObject({ anzahl: 1, betrag: 0, ohneBetrag: 1 });
    const punkt = s2.auffaelligkeiten.find((p) => p.regelId === "I-07")!;
    expect(punkt.einordnung).toBe("pruefbedarf");
    expect(punkt.fakten).toContainEqual({ label: "Auswirkung", wert: "noch nicht bezifferbar", betont: true });
    expect(s2.zusammenfassung.join(" ")).toContain("Auswirkung noch nicht bezifferbar");
  });

  it("„Wartung (keine Reparaturen enthalten)“ wird als Verneinung verstanden", () => {
    const a = abrechnung01();
    a.erlaeuterungen = [];
    a.kostenpositionen[10]!.bezeichnung = "Aufzug Wartung (keine Reparaturen enthalten)";
    expect(zuPosition(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "k11").find((x) => x.regelId === "I-07")!.status).toBe("ok");
  });

  it("Bezeichnung nennt Reparaturen ausdrücklich → Prüfbedarf ohne Betrag", () => {
    const a = abrechnung01();
    a.erlaeuterungen = [];
    a.kostenpositionen[10]!.bezeichnung = "Aufzug Wartung und Reparaturen";
    const i07 = zuPosition(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "k11").find((x) => x.regelId === "I-07")!;
    expect(i07.status).toBe("pruefbedarf");
    expect(i07.betragZugunstenMieter).toBeUndefined();
  });
});

describe("Wasser: Frisch-, Schmutz- und Niederschlagswasser getrennt", () => {
  it("Niederschlagswasser nach Wohnfläche: keine Rückfrage nach dem Wohnungswasserzähler", () => {
    const a = abrechnung01();
    delete a.ausstattung;
    const b = pruefeAbrechnung(a, { heute: HEUTE });
    expect(b.zusammenfassung.rueckfragen.map((r) => r.feld)).not.toContain("ausstattung.wasserzaehler");
    expect(zuPosition(b.ergebnisse, "k04")).toEqual([expect.objectContaining({ regelId: "I-15", status: "ok" })]);
  });

  it("Frischwasser nach Wohnfläche bei erfasstem Verbrauch: Verbrauchsprüfung greift weiterhin", () => {
    const a = abrechnung01();
    a.kostenpositionen[1]!.umlageschluessel = { typ: "wohnflaeche", anteilEinheit: 75, anteilGesamt: 750 };
    const i09 = nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "I-09");
    expect(i09).toHaveLength(1);
    expect(i09[0]).toMatchObject({ status: "auffaelligkeit", beleg: { positionen: ["k02"] } });
  });

  it("Sammelposition „Wasser/Abwasser“: keine automatische Verbrauchsregel, sondern Inhalt klären (Hinweis, kein Fehler)", () => {
    const a = abrechnung01();
    a.kostenpositionen.splice(1, 3, { id: "w1", bezeichnung: "Wasser/Abwasser", kategorie: "wasser", gesamtkosten: 6600, umlageschluessel: { typ: "wohnflaeche", anteilEinheit: 75, anteilGesamt: 750 }, anteilMieter: 660 });
    const i09 = nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "I-09");
    expect(i09.map((e) => e.status)).toEqual(["hinweis"]);
  });

  it("Niederschlagswasser zweimal angesetzt → begründeter Klärungsbedarf", () => {
    const a = abrechnung01();
    a.kostenpositionen.push({ id: "k13", bezeichnung: "Regenwassergebühr", kategorie: "entwaesserung", gesamtkosten: 900, umlageschluessel: wf(), anteilMieter: 90 });
    const i15 = nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "I-15");
    expect(i15[0]).toMatchObject({ status: "auffaelligkeit", betroffen: 90 });
    expect(i15[0]!.betragZugunstenMieter).toBeUndefined();
  });
});

describe("Abrechnung 02 – Rauchwarnmelder: nur der Mietanteil", () => {
  const { bericht, s1 } = stufen(abrechnung02());

  it("erkennt den Mietanteil von 12,00 € und lässt die Wartung stehen", () => {
    const i10 = nur(bericht.ergebnisse, "I-10")[0]!;
    // 120 € Miete × 30 € / 300 € = 12,00 €
    expect(i10).toMatchObject({ status: "abweichung", betragZugunstenMieter: 12 });
    expect(i10.textstelle).toContain("Gerätemiete");
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(12);
  });

  it("korrigiertes Guthaben 75,05 € statt 63,05 €", () => {
    expect(s1.kosten.saldo).toBe(-63.05);
    expect(s1.kosten.korrigierterSaldo).toBe(-75.05);
  });
});

describe("Abrechnung 03 – falscher Flächennenner bei den Heizungsgrundkosten", () => {
  const { bericht, s1, s2 } = stufen(abrechnung03());

  it("erkennt 650 statt 750 m² und korrigiert um 40,31 €", () => {
    const r04 = nur(bericht.ergebnisse, "R-04").find((e) => e.positionId === "h1")!;
    // 2.620,20 € × 75 / 650 = 302,33 € abgerechnet; × 75 / 750 = 262,02 € richtig
    expect(r04).toMatchObject({ status: "abweichung", betragZugunstenMieter: 40.31, beleg: { nenner: 650, hausflaeche: 750, korrekt: 262.02 } });
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(40.31);
  });

  it("Nachforderung 26,95 € statt 67,26 €", () => {
    expect(s1.kosten.saldo).toBe(67.26);
    expect(s1.kosten.korrigierterSaldo).toBe(26.95);
  });

  it("legt Textstelle, Zahlen und Regel nachvollziehbar ab", () => {
    const p = s2.auffaelligkeiten.find((x) => x.regelId === "R-04")!;
    expect(p.einordnung).toBe("fehler");
    expect(p.grundlage).toContain("§ 556a");
    expect(p.textstelle).toBe("Heizung Grundkosten (30 %): 75 / 650 m²");
    expect(p.fakten.map((f) => f.label)).toEqual(expect.arrayContaining(["Gesamtfläche laut Abrechnung", "Verwendeter Flächennenner", "Richtig berechnet", "Zu viel berechnet"]));
  });

  it("ohne Angabe der beheizten Gesamtfläche nur Klärungsbedarf (§ 7 Abs. 1 HeizkostenV erlaubt die beheizte Fläche)", () => {
    const a = abrechnung03();
    delete a.heizkosten!.gesamtflaeche;
    const r04 = nur(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse, "R-04").find((e) => e.positionId === "h1")!;
    expect(r04).toMatchObject({ status: "auffaelligkeit", betragZugunstenMieter: 40.31 });
  });
});

describe("Abrechnung 04 – drei zuvor nicht erkannte Fehler (68 von 680 m²)", () => {
  const a04 = (): AbrechnungEingabe => {
    const f = { typ: "wohnflaeche" as const, anteilEinheit: 68, anteilGesamt: 680 };
    return {
      meta: { abrechnungszeitraum: { von: "2024-01-01", bis: "2024-12-31" }, erstelltAm: "2025-06-16", zugangAm: "2025-06-20" },
      flaechen: { wohnflaecheMieter: 68, gesamtflaeche: 680 },
      ausstattung: { wasserzaehler: false, gewerbeImHaus: false },
      kostenpositionen: [
        // Leerstand herausgerechnet: 3.000 € × 68 / 600 = 340 € statt × 68 / 680 = 300 €
        { id: "g1", bezeichnung: "Grundsteuer", kategorie: "grundsteuer", gesamtkosten: 3000, umlageschluessel: { typ: "wohnflaeche", anteilEinheit: 68, anteilGesamt: 600 }, anteilMieter: 340, hinweise: ["Die leerstehende Wohnung im Dachgeschoss (80 m²) wurde nicht berücksichtigt."] },
        { id: "g2", bezeichnung: "Müllabfuhr", kategorie: "strassenreinigung_muell", gesamtkosten: 1500, umlageschluessel: f, anteilMieter: 150 },
        { id: "g3", bezeichnung: "Gebäudeversicherung", kategorie: "versicherung", gesamtkosten: 2200, umlageschluessel: f, anteilMieter: 220 },
        // 480 € Verwaltung im Jahresentgelt: 480 € × 68 / 680 = 48 €
        { id: "g4", bezeichnung: "Hauswart", kategorie: "hauswart", gesamtkosten: 2400, umlageschluessel: f, anteilMieter: 240, hinweise: ["Das Jahresentgelt enthält 480 € für Mietkonten, Mieterkorrespondenz und Abrechnungsvorbereitung."] },
      ],
      heizkosten: { gesamtkosten: 12000, verbrauchsanteilProzent: 70, verbrauchErfasst: true, anteilMieter: 1200, flaecheMieter: 68, gesamtflaeche: 680 },
      vorauszahlungen: 2100,
      // Seite 1 rechnet 1.100 € an, die Buchungsübersicht auf Seite 4 belegt 1.200 €
      vorauszahlungenDetail: { betriebskosten: 1000, heizkosten: 1100, gezahlt: { heizkosten: 1200, seite: 4 } },
      ausgewiesen: { summeKostenMieter: 2150, saldo: 50 },
    };
  };
  const { bericht, s1, s2 } = stufen(a04());
  const fehler = bericht.ergebnisse.filter((e) => e.status === "abweichung");

  it("Verwaltung im Hauswart: 480 € × 68/680 = 48,00 €", () => {
    const e = fehler.find((x) => x.regelId === "I-11")!;
    expect(e).toMatchObject({ positionId: "g4", betragZugunstenMieter: 48 });
    expect(e.textstelle).toContain("480 € für Mietkonten");
  });

  it("Leerstand bei der Grundsteuer: 300 € statt 340 € = 40,00 €", () => {
    const e = fehler.find((x) => x.regelId === "R-04")!;
    expect(e).toMatchObject({ positionId: "g1", betragZugunstenMieter: 40, beleg: { nenner: 600, hausflaeche: 680, korrekt: 300 } });
    expect(e.titel).toBe("Leerstand herausgerechnet: Grundsteuer");
  });

  it("Vorauszahlungen: 1.200 € belegt, 1.100 € angerechnet = 100,00 €", () => {
    const e = fehler.find((x) => x.regelId === "R-05")!;
    expect(e).toMatchObject({ betragZugunstenMieter: 100, beleg: { art: "heizkosten", jahr: 1100, summe: 1200, seite: 4 } });
  });

  it("zusammen 188,00 € belegte Überbelastung, Einstufung hoch, aus 50 € Nachzahlung werden 138 € Guthaben", () => {
    expect(fehler.map((e) => e.regelId).sort()).toEqual(["I-11", "R-04", "R-05"]);
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(188);
    expect(s1.fehlerpotenzial.stufe).toBe("hoch");
    expect(s1.kosten.korrigierterSaldo).toBe(-138);
    expect(s2.auffaelligkeiten.filter((p) => p.einordnung === "fehler").map((p) => p.betrag)).toEqual([100, 48, 40]);
    expect(s2.anschreiben.text).toContain("Hauswart");
    expect(s2.anschreiben.text).toContain("Grundsteuer");
    expect(s2.anschreiben.text).toContain("Vorauszahlungen");
  });

  it("ohne genannten Leerstand bleibt der kleinere Nenner Prüfbedarf (kein vorschneller Fehler)", () => {
    const a = a04();
    delete a.kostenpositionen[0]!.hinweise;
    const e = pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse.find((x) => x.regelId === "R-04" && x.positionId === "g1")!;
    expect(e).toMatchObject({ status: "auffaelligkeit", betragZugunstenMieter: 40 });
  });

  it("verneinte Aussage („enthält keine Verwaltungskosten“) ist kein Fehler", () => {
    const a = a04();
    a.kostenpositionen[3]!.hinweise = ["Das Jahresentgelt von 2.400 € enthält keine Verwaltungskosten."];
    expect(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse.filter((x) => x.regelId === "I-11" && x.status !== "ok")).toEqual([]);
  });
});

describe("Musterabrechnung 05 – Reparatur als Gebäudeunterhaltung, doppelte Gartenpflege, falscher Wasserverbrauch (Anteil 10 %)", () => {
  const a05 = (): AbrechnungEingabe => {
    const f = { typ: "wohnflaeche" as const, anteilEinheit: 70, anteilGesamt: 700 };
    const m3 = { typ: "verbrauch" as const, anteilEinheit: 68, anteilGesamt: 680 };
    return {
      meta: { abrechnungszeitraum: { von: "2024-01-01", bis: "2024-12-31" }, erstelltAm: "2025-06-16", zugangAm: "2025-06-20" },
      flaechen: { wohnflaecheMieter: 70, gesamtflaeche: 700 },
      ausstattung: { wasserzaehler: true, gewerbeImHaus: false },
      // Kaltwasser 140 − 100 = 40 m³ (übernommen 48), Warmwasser 70 − 50 = 20 m³ → richtig 60 statt 68 m³
      zaehler: [
        { art: "kaltwasser", anfang: 100, ende: 140, verbrauchUebernommen: 48, seite: 3 },
        { art: "warmwasser", anfang: 50, ende: 70, verbrauchUebernommen: 20, seite: 3 },
      ],
      kostenpositionen: [
        { id: "a1", bezeichnung: "Grundsteuer", kategorie: "grundsteuer", gesamtkosten: 3000, umlageschluessel: f, anteilMieter: 300 },
        // 3,00 € je m³ Frischwasser, 3,50 € je m³ Schmutzwasser
        { id: "a2", bezeichnung: "Frischwasser", kategorie: "wasser", gesamtkosten: 2040, umlageschluessel: m3, anteilMieter: 204 },
        { id: "a3", bezeichnung: "Schmutzwasser", kategorie: "entwaesserung", gesamtkosten: 2380, umlageschluessel: m3, anteilMieter: 238 },
        { id: "a4", bezeichnung: "Gartenpflege", kategorie: "gartenpflege", gesamtkosten: 800, umlageschluessel: f, anteilMieter: 80, belegnummer: "RE 2024-118" },
        { id: "a5", bezeichnung: "Außenanlagenpflege", kategorie: "gartenpflege", gesamtkosten: 800, umlageschluessel: f, anteilMieter: 80, belegnummer: "RE 2024-118" },
        { id: "a6", bezeichnung: "Gebäudeunterhaltung", kategorie: "sonstige", gesamtkosten: 640, umlageschluessel: f, anteilMieter: 64, hinweise: ["Leistungsnachweis: Schadhafte Putzflächen im Treppenhaus repariert."] },
      ],
      heizkosten: { gesamtkosten: 9000, verbrauchsanteilProzent: 70, verbrauchErfasst: true, anteilMieter: 900, flaecheMieter: 70, gesamtflaeche: 700 },
      vorauszahlungen: 1800,
      ausgewiesen: { summeKostenMieter: 1866, saldo: 66 },
    };
  };
  const { bericht, s1 } = stufen(a05());
  const fehler = bericht.ergebnisse.filter((e) => e.status === "abweichung");

  it("Reparaturkosten als „Gebäudeunterhaltung“: 640 € × 10 % = 64,00 €", () => {
    const e = fehler.find((x) => x.regelId === "I-07")!;
    expect(e).toMatchObject({ positionId: "a6", betragZugunstenMieter: 64 });
    expect(e.textstelle).toContain("Putzflächen");
  });

  it("Gartenpflege doppelt: dieselbe Rechnung, einmal 80,00 € streichen", () => {
    const e = fehler.find((x) => x.regelId === "I-16")!;
    expect(e).toMatchObject({ positionId: "a5", betragZugunstenMieter: 80, beleg: { positionen: ["a4", "a5"] } });
  });

  it("Wasserverbrauch: 60 statt 68 m³ → 24,00 € Frischwasser und 28,00 € Schmutzwasser", () => {
    const r08 = fehler.filter((x) => x.regelId === "R-08");
    expect(r08.map((e) => [e.positionId, e.betragZugunstenMieter])).toEqual([["a2", 24], ["a3", 28]]);
    expect(r08[0]!.beleg).toMatchObject({ verbrauchZaehler: 60, verbrauchAbgerechnet: 68, zuViel: 8 });
  });

  it("zusammen 196,00 € – ohne Doppelzählung der Position, die zwei Regeln beanstanden könnten", () => {
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(196);
    expect(s1.fehlerpotenzial.stufe).toBe("hoch");
    expect(s1.kosten.korrigierterSaldo).toBe(-130);
    // Mit Mietvertrag ohne vereinbarte sonstige Kosten beanstandet auch I-02 die Gebäudeunterhaltung – der Betrag zählt trotzdem nur einmal
    const a = a05();
    a.mietvertrag = { vereinbarteSonstigeKosten: [] };
    expect(pruefeAbrechnung(a, { heute: HEUTE }).zusammenfassung.einsparpotenzial).toBe(196);
  });

  it("Gegenproben: richtige Zählerwerte, unterschiedliche Rechnungen, Wartung statt Reparatur → kein Fehler", () => {
    const a = a05();
    a.zaehler![0]!.verbrauchUebernommen = 40;
    for (const i of [1, 2]) {
      a.kostenpositionen[i]!.umlageschluessel!.anteilEinheit = 60;
      a.kostenpositionen[i]!.anteilMieter = i === 1 ? 180 : 210;
    }
    a.kostenpositionen[4]!.belegnummer = "RE 2024-207";
    a.kostenpositionen[4]!.gesamtkosten = 500;
    a.kostenpositionen[4]!.anteilMieter = 50;
    a.kostenpositionen[5]!.hinweise = ["Leistungsnachweis: Dachrinnen gereinigt, keine Reparaturen."];
    const b = pruefeAbrechnung(a, { heute: HEUTE });
    expect(b.ergebnisse.filter((e) => ["R-08", "I-16", "I-07"].includes(e.regelId) && e.status !== "ok")).toEqual([]);
  });
});

describe("Abrechnung 06 – Rechtsschutz im Versicherungspaket, nur in der Erläuterung auf Seite 3 erkennbar", () => {
  const a06 = (text: string): AbrechnungEingabe => {
    const a = abrechnung01();
    // 75 von 750 m²: 180 € Rechtsschutz × 10 % = 18,00 €
    a.kostenpositionen[8] = { id: "k09", bezeichnung: "Versicherungen Hauspaket", kategorie: "versicherung", gesamtkosten: 2300, umlageschluessel: wf(), anteilMieter: 230 };
    a.erlaeuterungen = [{ text, seite: 3 }];
    return a;
  };

  it("erkennt die 180 € Vermieter-Rechtsschutz und beanstandet nur diesen Anteil (18,00 €)", () => {
    for (const text of [
      "Das Hauspaket umfasst Gebäude-, Haftpflicht- und Glasversicherung sowie 180 € Vermieter-Rechtsschutz.",
      "In der Position Versicherungen sind 180,00 EUR für die Rechtsschutzversicherung des Vermieters enthalten.",
      "Vermieter-Rechtsschutz: 180 €",
    ]) {
      const bericht = pruefeAbrechnung(a06(text), { heute: HEUTE });
      const e = bericht.ergebnisse.find((x) => x.regelId === "I-17" && x.status === "abweichung")!;
      expect(e, text).toMatchObject({ positionId: "k09", betragZugunstenMieter: 18 });
      expect(e.textstelle).toContain("Rechtsschutz");
      expect(bericht.zusammenfassung.einsparpotenzial).toBe(18);
    }
  });

  it("Gebäude- und Haftpflichtversicherung allein bleiben unbeanstandet; „kein Rechtsschutz enthalten“ ist kein Fehler", () => {
    for (const text of ["Das Hauspaket umfasst Gebäude-, Haftpflicht- und Glasversicherung.", "Im Hauspaket ist kein Rechtsschutz enthalten."]) {
      expect(pruefeAbrechnung(a06(text), { heute: HEUTE }).ergebnisse.filter((x) => x.regelId === "I-17" && x.status !== "ok"), text).toEqual([]);
    }
  });
});

describe("Familie Yilmaz – vier Fehler, die nur die Belege zeigen (80 von 800 m²)", () => {
  const yilmaz = (): AbrechnungEingabe => {
    const f = { typ: "wohnflaeche" as const, anteilEinheit: 80, anteilGesamt: 800 };
    return {
      meta: { abrechnungszeitraum: { von: "2024-01-01", bis: "2024-12-31" }, erstelltAm: "2025-06-16", zugangAm: "2025-06-20" },
      flaechen: { wohnflaecheMieter: 80, gesamtflaeche: 800 },
      ausstattung: { wasserzaehler: false, gewerbeImHaus: false },
      kostenpositionen: [
        { id: "y1", bezeichnung: "Grundsteuer", kategorie: "grundsteuer", gesamtkosten: 3000, umlageschluessel: f, anteilMieter: 300 },
        // enthält eine Reinigungsrechnung über 1.800 € für ein anderes Objekt
        { id: "y2", bezeichnung: "Hausreinigung", kategorie: "gebaeudereinigung_ungeziefer", gesamtkosten: 4800, umlageschluessel: f, anteilMieter: 480 },
        // Rechnung 800 € brutto, übernommen 952 €
        { id: "y3", bezeichnung: "Gartenpflege", kategorie: "gartenpflege", gesamtkosten: 952, umlageschluessel: f, anteilMieter: 95.2 },
      ],
      // Wärmezähler: 4.800 kWh gemessen, mit Faktor 2 als 9.600 kWh abgerechnet; Protokoll nennt Faktor 1
      zaehler: [{ art: "heizung", bezeichnung: "Wärmezähler", anfang: 12000, ende: 16800, faktor: 2, faktorLautProtokoll: 1, verbrauchUebernommen: 9600, seite: 6 }],
      heizkosten: { gesamtkosten: 20000, verbrauchsanteilProzent: 70, verbrauchErfasst: true, anteilMieter: 2210, verbrauchMieter: 9600, verbrauchskostenMieter: 1260, flaecheMieter: 80, gesamtflaeche: 800 },
      belege: [
        { zuPosition: "y2", bezeichnung: "Rechnung Treppenhausreinigung", betrag: 1800, fremdesObjekt: true, objekt: "separates Objekt in Leipzig", seite: 5 },
        { zuPosition: "y3", bezeichnung: "Rechnung Gartenpflege", betrag: 800, uebernommen: 952, seite: 5 },
        { zuPosition: "heizkosten", bezeichnung: "Gutschrift Preiskorrektur Heizstrom", art: "gutschrift", betrag: 600, beruecksichtigt: false, seite: 7 },
      ],
      vorauszahlungen: 3000,
      ausgewiesen: { summeKostenMieter: 3085.2, saldo: 85.2 },
    };
  };
  const { bericht, s1, s2 } = stufen(yilmaz());
  const fehler = bericht.ergebnisse.filter((e) => e.status === "abweichung");
  const titel = (t: string) => fehler.find((e) => e.titel.startsWith(t))!;

  it("Rechnung eines anderen Hauses: 1.800 € × 10 % = 180,00 €", () => {
    expect(titel("Rechnung eines anderen Hauses umgelegt")).toMatchObject({ regelId: "R-09", positionId: "y2", betragZugunstenMieter: 180 });
  });

  it("Umsatzsteuer doppelt: 952 € statt 800 € → 152 € × 10 % = 15,20 €", () => {
    const e = titel("Umsatzsteuer doppelt aufgeschlagen");
    expect(e).toMatchObject({ regelId: "R-09", positionId: "y3", betragZugunstenMieter: 15.2, beleg: { umsatzsteuerProzent: 19, zuVielHaus: 152 } });
  });

  it("Falscher Faktor beim Wärmezähler: 9.600 statt 4.800 kWh → 1.260 € × 4.800 / 9.600 = 630,00 €", () => {
    expect(titel("Falscher Faktor beim Wärmezähler")).toMatchObject({ regelId: "R-08", betragZugunstenMieter: 630, beleg: { verbrauchZaehler: 4800, verbrauchAbgerechnet: 9600, faktor: 2, faktorLautProtokoll: 1 } });
  });

  it("Gutschrift übergangen: 600 € × 2.210 / 20.000 = 66,30 €", () => {
    expect(titel("Gutschrift nicht abgezogen")).toMatchObject({ regelId: "R-09", betragZugunstenMieter: 66.3 });
  });

  it("zusammen 891,50 € – aus 85,20 € Nachzahlung werden 806,30 € Guthaben; alle vier Punkte stehen im Schreiben", () => {
    expect(fehler).toHaveLength(4);
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(891.5);
    expect(s1.fehlerpotenzial.stufe).toBe("hoch");
    expect(s1.kosten.korrigierterSaldo).toBe(-806.3);
    for (const wort of ["Treppenhausreinigung", "Rechnung Gartenpflege", "Wärmezähler", "Gutschrift"]) expect(s2.anschreiben.text, wort).toContain(wort);
  });

  it("Gegenproben: richtiger Faktor, Beleg des eigenen Hauses, Betrag wie im Beleg, abgezogene Gutschrift → kein Befund", () => {
    const a = yilmaz();
    a.zaehler![0] = { art: "heizung", anfang: 12000, ende: 16800, faktor: 1, faktorLautProtokoll: 1, verbrauchUebernommen: 4800 };
    a.heizkosten!.verbrauchMieter = 4800;
    a.belege = [
      { zuPosition: "y2", bezeichnung: "Rechnung Treppenhausreinigung", betrag: 1800, fremdesObjekt: false },
      { zuPosition: "y3", bezeichnung: "Rechnung Gartenpflege", betrag: 952, uebernommen: 952 },
      { zuPosition: "heizkosten", bezeichnung: "Jahresrechnung Heizstrom", betrag: 20600 },
      { zuPosition: "heizkosten", bezeichnung: "Gutschrift Preiskorrektur Heizstrom", art: "gutschrift", betrag: 600 },
    ];
    expect(pruefeAbrechnung(a, { heute: HEUTE }).ergebnisse.filter((e) => ["R-08", "R-09"].includes(e.regelId) && e.status !== "ok")).toEqual([]);
  });

  it("zwei Teilfehler an derselben Position werden addiert, aber nie über den Anteil der Position hinaus", () => {
    const a = yilmaz();
    a.belege!.push({ zuPosition: "y2", bezeichnung: "Rechnung Sonderreinigung", betrag: 1000, uebernommen: 1190 });
    // 180,00 € (fremdes Objekt) + 19,00 € (Umsatzsteuer doppelt) an der Hausreinigung
    expect(pruefeAbrechnung(a, { heute: HEUTE }).zusammenfassung.einsparpotenzial).toBe(910.5);
  });
});

describe("Muster 11 – Fund der KI-Kontrolle steht bei „Das haben wir gefunden“", () => {
  const TEXT = "Bei der Umstellung der Verwaltung wurde der Anfangsstand KW-04 manuell aus dem Altdatenbestand übernommen. Ein Abgleich mit dem Endstand der Abrechnung 2024 steht noch aus";
  const a = abrechnung01();
  a.kontrollbefunde = [{ beschreibung: "Der Anfangsstand des Wasserzählers KW-04 wurde manuell aus einem Altdatenbestand übernommen und noch nicht mit dem Endstand der Vorjahresabrechnung abgeglichen. Daraus ergibt sich der Verbrauch für Frischwasser und Schmutzwasser.", textstelle: TEXT, positionId: "k02", seite: 3 }];
  const { bericht, s1, s2 } = stufen(a);

  it("erscheint als begründeter Prüfbedarf an der Position, ohne Betrag, mit Textstelle", () => {
    const punkt = s2.auffaelligkeiten.find((p) => p.regelId === "K-01")!;
    expect(punkt).toMatchObject({ status: "auffaelligkeit", einordnung: "pruefbedarf", textstelle: TEXT, betroffen: 310 });
    expect(punkt.betrag).toBeUndefined();
    expect(punkt.kurz.titel).toBe("Von der KI-Kontrolle gefunden: Frischwasser");
    expect(punkt.fakten).toContainEqual({ label: "Auswirkung", wert: "noch nicht bezifferbar", betont: true });
    expect(punkt.fakten.some((f) => f.label === "Textstelle" && f.wert.includes("Altdatenbestand"))).toBe(true);
  });

  it("zählt zu den gefundenen Punkten und zur Einstufung, aber nicht als belegter Fehler oder Betrag", () => {
    expect(s1.fehlerpotenzial.anzahl.auffaelligkeit).toBe(1);
    expect(s1.fehlerpotenzial.anzahl.abweichung).toBe(0);
    expect(s1.fehlerpotenzial.stufe).toBe("gering");
    expect(bericht.zusammenfassung.einsparpotenzial + bericht.zusammenfassung.klaerungspotenzial).toBe(0);
  });

  it("im Schreiben steht nur das Zitat aus der Abrechnung mit der Bitte um Erläuterung", () => {
    expect(s2.anschreiben.text).toContain(`Frischwasser: In der Abrechnung heißt es: „${TEXT}“ Bitte erläutern Sie das und legen Sie die zugehörigen Belege vor.`);
    expect(s2.anschreiben.text).not.toContain("manuell aus einem Altdatenbestand übernommen und noch nicht mit dem Endstand der Vorjahresabrechnung");
  });
});

function wf() {
  return { typ: "wohnflaeche" as const, anteilEinheit: 75, anteilGesamt: 750 };
}
