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

function wf() {
  return { typ: "wohnflaeche" as const, anteilEinheit: 75, anteilGesamt: 750 };
}
