import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALLE_REGELN, erstelleZeilenprotokoll, FEHLERKATALOG, NICHT_BERECHENBAR, pruefeAbrechnung, type AbrechnungEingabe, type Fehlerart } from "../src/index";

/**
 * Nachweis für den Fehlerkatalog.
 *
 * 1. Keine Fehlalarme: Zufällig erzeugte, korrekte Abrechnungen ergeben keinen einzigen Befund.
 * 2. Vollständige Erkennung: Jede Fehlerart des Katalogs wird in VARIANTEN Zufallsvarianten in eine korrekte
 *    Abrechnung eingebaut. Die zuständige Regel muss sie mit dem Ergebnis laut Katalog und – wo bezifferbar –
 *    mit dem auf den Cent richtigen Betrag melden. Der erwartete Betrag wird hier unabhängig nachgerechnet.
 * 3. Vollständigkeit: Jede Regel hat mindestens eine Fehlerart, jede Fehlerart hat einen Test.
 */

const VARIANTEN = 25;
const KORREKTE = 300;
const HEUTE = "2026-07-01";
const runde = (x: number) => Math.round(x * 100) / 100;

/** Reproduzierbarer Zufall (mulberry32). */
function zufall(seed: number) {
  let s = seed >>> 0;
  const n = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    zahl: (von: number, bis: number) => von + n() * (bis - von),
    ganz: (von: number, bis: number) => Math.floor(von + n() * (bis - von + 1)),
    euro: (von: number, bis: number) => runde(von + n() * (bis - von)),
  };
}
type Zufall = ReturnType<typeof zufall>;
type Position = AbrechnungEingabe["kostenpositionen"][number];

/** Erzeugt eine in sich korrekte Abrechnung für 2025 mit zufälligen Flächen, Kosten und Vorauszahlungen. */
function korrekt(z: Zufall): AbrechnungEingabe {
  const w = z.ganz(40, 120);
  const g = w * z.ganz(8, 20);
  const wf = { typ: "wohnflaeche" as const, anteilEinheit: w, anteilGesamt: g };
  const verbrauch = { typ: "verbrauch" as const, anteilEinheit: z.ganz(30, 120), anteilGesamt: z.ganz(900, 2500) };
  const pos = (id: string, bezeichnung: string, kategorie: Position["kategorie"], s: NonNullable<Position["umlageschluessel"]> = wf): Position => {
    // Zielkosten 0,08–0,20 € je m² und Monat, damit auch kein Vergleichshinweis entsteht
    const gesamtkosten = runde((z.zahl(0.08, 0.2) * 12 * w * s.anteilGesamt!) / s.anteilEinheit!);
    return { id, bezeichnung, kategorie, gesamtkosten, umlageschluessel: { ...s }, anteilMieter: runde((gesamtkosten * s.anteilEinheit!) / s.anteilGesamt!) };
  };
  const kostenpositionen = [
    pos("k01", "Grundsteuer", "grundsteuer"),
    pos("k02", "Frischwasser", "wasser", verbrauch),
    pos("k03", "Schmutzwasser", "entwaesserung", verbrauch),
    pos("k04", "Niederschlagswasser", "entwaesserung"),
    pos("k05", "Müllabfuhr", "strassenreinigung_muell"),
    pos("k06", "Hausreinigung", "gebaeudereinigung_ungeziefer"),
    pos("k07", "Gartenpflege", "gartenpflege"),
    pos("k08", "Allgemeinstrom", "beleuchtung"),
    pos("k09", "Gebäudeversicherung", "versicherung"),
    pos("k10", "Hauswart", "hauswart"),
    pos("k11", "Aufzug: Betrieb, Wartung und Prüfung", "aufzug"),
  ];
  const heiz = runde(z.zahl(0.6, 1.4) * 12 * w);
  const summe = runde(kostenpositionen.reduce((s, p) => s + p.anteilMieter, 0) + heiz);
  const vorauszahlungen = 12 * z.ganz(Math.round(summe / 12) - 30, Math.round(summe / 12) + 30);
  return {
    meta: { abrechnungszeitraum: { von: "2025-01-01", bis: "2025-12-31" }, erstelltAm: "2026-06-16", zugangAm: "2026-06-20", plz: "04275", geschoss: 2 },
    flaechen: { wohnflaecheMieter: w, gesamtflaeche: g },
    ausstattung: { wasserzaehler: true, gewerbeImHaus: false },
    mietvertrag: { vereinbarteSonstigeKosten: [], pauschaleVereinbart: false, aufzugAusgenommen: false, wohnflaeche: w, mietbeginn: "2019-03-01" },
    erlaeuterungen: [],
    // Zählerstände passen zum abgerechneten Verbrauch
    zaehler: [((anfang) => ({ art: "kaltwasser" as const, anfang, ende: anfang + verbrauch.anteilEinheit, verbrauchUebernommen: verbrauch.anteilEinheit }))(z.ganz(100, 900))],
    kostenpositionen,
    heizkosten: { gesamtkosten: runde((heiz * g) / w), verbrauchsanteilProzent: 70, verbrauchErfasst: true, anteilMieter: heiz, flaecheMieter: w, gesamtflaeche: g },
    vorauszahlungen,
    ausgewiesen: { summeKostenMieter: summe, saldo: runde(summe - vorauszahlungen) },
    vorjahr: { kostenpositionen: kostenpositionen.map((p) => ({ kategorie: p.kategorie, bezeichnung: p.bezeichnung, anteilMieter: p.anteilMieter })) },
  };
}

// ---------- Hilfen zum Einbauen von Fehlern ----------
const w = (a: AbrechnungEingabe) => a.flaechen!.wohnflaecheMieter!;
const g = (a: AbrechnungEingabe) => a.flaechen!.gesamtflaeche!;
const p = (a: AbrechnungEingabe, id: string) => a.kostenpositionen.find((x) => x.id === id)!;
/** Setzt den Saldo auf einen Zielwert, indem die Vorauszahlungen angepasst werden (Abrechnung bleibt rechnerisch richtig). */
function saldo(a: AbrechnungEingabe, ziel: number) {
  a.vorauszahlungen = runde(a.ausgewiesen!.summeKostenMieter! - ziel);
  a.ausgewiesen!.saldo = ziel;
}
/** Fügt eine nach Wohnfläche verteilte Position hinzu und führt Summe und Saldo nach. */
function neu(a: AbrechnungEingabe, z: Zufall, bezeichnung: string, kategorie: Position["kategorie"], extra: Partial<Position> = {}): Position {
  const gesamtkosten = z.euro(300, 4000);
  const s = extra.umlageschluessel ?? { typ: "wohnflaeche" as const, anteilEinheit: w(a), anteilGesamt: g(a) };
  const pos: Position = { id: `x${a.kostenpositionen.length}`, bezeichnung, kategorie, gesamtkosten, anteilMieter: runde((gesamtkosten * s.anteilEinheit!) / s.anteilGesamt!), ...extra, umlageschluessel: s };
  a.kostenpositionen.push(pos);
  a.ausgewiesen!.summeKostenMieter = runde(a.ausgewiesen!.summeKostenMieter! + pos.anteilMieter);
  a.ausgewiesen!.saldo = runde(a.ausgewiesen!.saldo! + pos.anteilMieter);
  return pos;
}
const tage = (von: string, bis: string) => Math.round((Date.parse(bis) - Date.parse(von)) / 86_400_000) + 1;

interface Erwartung {
  /** Unabhängig nachgerechneter Betrag (bei exakt und bis_zu). */
  betrag?: number;
  positionId?: string;
  heute?: string;
}

/** Je Fehlerart: baut den Fehler in eine korrekte Abrechnung ein und rechnet den erwarteten Betrag selbst aus. */
const EINBAUEN: Record<string, (a: AbrechnungEingabe, z: Zufall) => Erwartung> = {
  "F-01.a": (a) => ((a.meta.abrechnungszeitraum!.bis = "2026-03-31"), {}),
  "F-02.a": (a, z) => {
    const s = z.euro(20, 900);
    saldo(a, s);
    a.meta.zugangAm = "2027-01-05";
    a.meta.zeitraumBestaetigt = true;
    return { betrag: s };
  },
  "F-02.b": (a, z) => {
    const s = z.euro(20, 900);
    saldo(a, s);
    a.meta.zugangAm = "2027-01-05";
    return { betrag: s };
  },
  "F-02.c": (a, z) => (saldo(a, -z.euro(1, 500)), (a.meta.zugangAm = "2027-01-05"), {}),
  "F-03.a": () => ({ heute: "2027-08-01" }),
  "F-04.a": (a, z) => {
    const pos = a.kostenpositionen[z.ganz(0, 10)]!;
    delete pos.gesamtkosten;
    return { positionId: pos.id };
  },
  "F-04.b": (a, z) => {
    const pos = a.kostenpositionen[z.ganz(0, 10)]!;
    delete pos.umlageschluessel;
    return { positionId: pos.id };
  },
  "F-05.a": (a, z) => {
    const s = z.euro(20, 900);
    saldo(a, s);
    a.mietvertrag!.pauschaleVereinbart = true;
    return { betrag: s };
  },
  "R-01.a": (a, z) => {
    const pos = p(a, ["k01", "k04", "k05", "k06", "k07", "k08", "k09", "k10", "k11"][z.ganz(0, 8)]!);
    const x = z.euro(0.06, 300);
    pos.anteilMieter = runde(pos.anteilMieter + x);
    return { betrag: x, positionId: pos.id };
  },
  "R-02.a": (a, z) => {
    const x = z.euro(0.06, 500);
    a.ausgewiesen!.summeKostenMieter = runde(a.ausgewiesen!.summeKostenMieter! + x);
    return { betrag: x };
  },
  "R-03.a": (a, z) => {
    const x = z.euro(0.06, 500);
    a.ausgewiesen!.saldo = runde(a.ausgewiesen!.saldo! + x);
    return { betrag: x };
  },
  "R-04.a": (a, z) => {
    const nenner = g(a) - z.ganz(10, Math.floor(g(a) / 4));
    const kosten = z.euro(1500, 9000);
    const anteil = runde((kosten * w(a)) / nenner);
    const pos = neu(a, z, "Heizung Grundkosten (30 %)", "heizung", { gesamtkosten: kosten, anteilMieter: anteil, umlageschluessel: { typ: "wohnflaeche", anteilEinheit: w(a), anteilGesamt: nenner } });
    return { betrag: runde(anteil - (kosten * w(a)) / g(a)), positionId: pos.id };
  },
  "R-04.b": (a, z) => {
    const pos = p(a, "k05");
    const nenner = g(a) - z.ganz(10, Math.floor(g(a) / 4));
    pos.umlageschluessel!.anteilGesamt = nenner;
    pos.anteilMieter = runde((pos.gesamtkosten! * w(a)) / nenner);
    return { betrag: runde(pos.anteilMieter - (pos.gesamtkosten! * w(a)) / g(a)), positionId: pos.id };
  },
  "R-04.d": (a, z) => {
    const pos = p(a, "k01");
    const leer = z.ganz(20, Math.floor(g(a) / 5));
    pos.umlageschluessel!.anteilGesamt = g(a) - leer;
    pos.anteilMieter = runde((pos.gesamtkosten! * w(a)) / (g(a) - leer));
    pos.hinweise = [z.ganz(0, 1) ? `Die leerstehende Wohnung (${leer} m²) wurde bei der Grundsteuer nicht berücksichtigt.` : `Wegen Leerstand nur ${g(a) - leer} m² angesetzt.`];
    return { betrag: runde(pos.anteilMieter - (pos.gesamtkosten! * w(a)) / g(a)), positionId: pos.id };
  },
  "R-04.c": (a, z) => {
    const pos = p(a, "k06");
    pos.umlageschluessel!.anteilEinheit = w(a) + z.ganz(2, 9);
    pos.anteilMieter = runde((pos.gesamtkosten! * pos.umlageschluessel!.anteilEinheit!) / g(a));
    return { betrag: runde(pos.anteilMieter * (1 - w(a) / pos.umlageschluessel!.anteilEinheit!)), positionId: pos.id };
  },
  "R-04.e": (a, z) => {
    const pos = p(a, "k01");
    const mehr = z.ganz(2, 15);
    pos.umlageschluessel!.anteilEinheit = w(a) + mehr;
    pos.anteilMieter = runde((pos.gesamtkosten! * (w(a) + mehr)) / g(a));
    const text = `25 % der offenen Gartenfläche (${mehr} m²) wurden zur Wohnfläche addiert.`;
    if (z.ganz(0, 1)) pos.hinweise = [text];
    else a.erlaeuterungen = [{ text, seite: 2 }];
    return { betrag: runde(pos.anteilMieter * (1 - w(a) / (w(a) + mehr))), positionId: pos.id };
  },
  "R-05.a": (a, z) => {
    const monat = z.ganz(80, 300);
    const x = z.euro(1.5, 400);
    a.vorauszahlungenDetail = { betriebskosten: runde(12 * monat - x), verlauf: [{ ab: "2025-01-01", betriebskosten: monat }], verlaufQuelle: "kontoauszug" };
    return { betrag: x };
  },
  "R-05.b": (a, z) => {
    const monat = z.ganz(80, 300);
    const x = z.euro(1.5, 400);
    a.vorauszahlungenDetail = { heizkosten: runde(12 * monat - x), monatlich: { heizkosten: monat } };
    return { betrag: x };
  },
  "R-05.c": (a, z) => {
    const angerechnet = z.euro(600, 2400);
    const x = z.euro(1.5, 400);
    a.vorauszahlungenDetail = { heizkosten: angerechnet, gezahlt: { heizkosten: runde(angerechnet + x), seite: 4 } };
    return { betrag: x };
  },
  "R-06.a": (a, z) => {
    const beginn = `2025-${String(z.ganz(2, 11)).padStart(2, "0")}-01`;
    a.mietvertrag!.mietbeginn = beginn;
    const zeitKosten = runde(a.kostenpositionen.filter((x) => x.umlageschluessel!.typ !== "verbrauch").reduce((s, x) => s + x.anteilMieter, 0));
    return { betrag: runde(zeitKosten * (1 - tage(beginn, "2025-12-31") / 365)) };
  },
  "R-07.a": (a, z) => {
    const vertrag = w(a) - z.ganz(6, 12);
    a.mietvertrag!.wohnflaeche = vertrag;
    const flaechenKosten = runde(a.kostenpositionen.filter((x) => x.umlageschluessel!.typ === "wohnflaeche").reduce((s, x) => s + x.anteilMieter, 0));
    return { betrag: runde(flaechenKosten * (1 - vertrag / w(a))) };
  },
  "I-01.a": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Verwaltungskosten", "verwaltung")),
  "I-01.b": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Reparatur Haustür", "instandhaltung")),
  "I-01.c": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Instandhaltungsrücklage", "ruecklage")),
  "I-01.d": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Kontoführungsgebühren", "bank_porto")),
  "I-02.a": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Dachrinnenreinigung", "sonstige")),
  "I-03.a": (a, z) => ({ positionId: neu(a, z, "Diverses", "unbekannt").id }),
  "I-04.a": (a) => ((a.heizkosten!.verbrauchErfasst = false), { betrag: runde(a.heizkosten!.anteilMieter * 0.15) }),
  "I-04.b": (a, z) => ((a.heizkosten!.verbrauchsanteilProzent = z.ganz(0, 1) ? z.ganz(71, 100) : z.ganz(0, 49)), {}),
  "I-05.a": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Kabelanschluss", "antenne_kabel")),
  "I-05.b": (a, z) => {
    a.meta.abrechnungszeitraum = { von: "2024-01-01", bis: "2024-12-31" };
    const x = neu(a, z, "Kabelanschluss", "antenne_kabel");
    return { betrag: runde((x.anteilMieter * 184) / 366), positionId: x.id };
  },
  "I-06.a": (a) => ((a.meta.geschoss = 0), (a.mietvertrag!.aufzugAusgenommen = true), { betrag: p(a, "k11").anteilMieter }),
  "I-07.a": (a, z) => {
    const pos = p(a, "k11");
    const reparatur = z.euro(20, pos.gesamtkosten! * 0.6);
    pos.bestandteile = [
      { bezeichnung: "Wartung und Prüfung", betrag: runde(pos.gesamtkosten! - reparatur) },
      { bezeichnung: "Reparatur Türantrieb", betrag: reparatur },
    ];
    a.erlaeuterungen = [{ text: "Hauswart und Aufzug enthalten keine Reparaturkosten." }];
    return { betrag: runde((pos.anteilMieter * reparatur) / pos.gesamtkosten!), positionId: pos.id };
  },
  "I-07.b": (a) => ((p(a, "k11").bezeichnung = "Aufzug Vollwartungsvertrag"), { positionId: "k11" }),
  "I-07.c": (a) => ((p(a, "k11").bezeichnung = "Aufzug Wartung und Reparaturen"), { positionId: "k11" }),
  "I-07.d": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Gebäudeunterhaltung", "sonstige", { hinweise: [z.ganz(0, 1) ? "Leistungsnachweis: Schadhafte Putzflächen im Treppenhaus repariert." : "Ausbesserung der Fassade nach Sturmschaden."] })),
  "I-16.a": (a, z) => {
    const garten = p(a, "k07");
    garten.belegnummer = "RE-2025-0417";
    const x = neu(a, z, "Außenanlagenpflege", "gartenpflege", { gesamtkosten: garten.gesamtkosten, anteilMieter: garten.anteilMieter, belegnummer: z.ganz(0, 1) ? "RE-2025-0417" : "Re 2025/0417" });
    return { betrag: garten.anteilMieter, positionId: x.id };
  },
  "I-16.b": (a, z) => {
    const garten = p(a, "k07");
    const x = neu(a, z, "Außenanlagenpflege", "gartenpflege", { gesamtkosten: garten.gesamtkosten, anteilMieter: garten.anteilMieter });
    return { betrag: garten.anteilMieter, positionId: x.id };
  },
  "R-08.a": (a, z) => {
    const mehr = z.ganz(2, 15);
    a.zaehler![0]!.verbrauchUebernommen! += mehr;
    for (const id of ["k02", "k03"]) {
      const pos = p(a, id);
      pos.umlageschluessel!.anteilEinheit! += mehr;
      pos.anteilMieter = runde((pos.gesamtkosten! * pos.umlageschluessel!.anteilEinheit!) / pos.umlageschluessel!.anteilGesamt!);
    }
    const frisch = p(a, "k02");
    return { betrag: runde((frisch.anteilMieter * mehr) / frisch.umlageschluessel!.anteilEinheit!), positionId: "k02" };
  },
  "I-17.a": (a, z) => {
    const pos = p(a, "k09");
    pos.bezeichnung = "Versicherungen Hauspaket";
    const rechtsschutz = z.ganz(20, Math.floor(pos.gesamtkosten! * 0.4));
    const art = z.ganz(0, 2);
    // Der Bestandteil steht nur in einer Erläuterung (allgemein oder mit Bezug auf die Position) oder in der Aufschlüsselung
    if (art === 0) a.erlaeuterungen = [{ text: `Im Hauspaket sind ${rechtsschutz.toLocaleString("de-DE")} € Vermieter-Rechtsschutz enthalten.`, seite: 3 }];
    else if (art === 1) a.erlaeuterungen = [{ text: `Die Prämie enthält ${rechtsschutz.toLocaleString("de-DE")} EUR für die Mietausfallversicherung.`, seite: 3 }];
    else pos.bestandteile = [{ bezeichnung: "Gebäudeversicherung", betrag: runde(pos.gesamtkosten! - rechtsschutz) }, { bezeichnung: "Vermieter-Rechtsschutz", betrag: rechtsschutz }];
    return { betrag: runde((pos.anteilMieter * rechtsschutz) / pos.gesamtkosten!), positionId: pos.id };
  },
  "I-17.b": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, z.ganz(0, 1) ? "Rechtsschutzversicherung Vermieter" : "Mietausfallversicherung", "versicherung")),
  "I-17.c": (a) => ((a.erlaeuterungen = [{ text: "Das Versicherungspaket umfasst auch den Vermieter-Rechtsschutz." }]), { positionId: "k09" }),
  "R-08.b": (a, z) => {
    const kwh = z.ganz(2000, 9000);
    const faktor = z.ganz(2, 4);
    const anfang = z.ganz(1000, 50000);
    a.zaehler!.push({ art: "heizung", bezeichnung: "Wärmezähler", anfang, ende: anfang + kwh, faktor, faktorLautProtokoll: 1, verbrauchUebernommen: kwh * faktor });
    a.heizkosten!.verbrauchMieter = kwh * faktor;
    a.heizkosten!.verbrauchskostenMieter = z.euro(300, 1500);
    return { betrag: runde((a.heizkosten!.verbrauchskostenMieter * (kwh * faktor - kwh)) / (kwh * faktor)) };
  },
  "R-09.a": (a, z) => {
    const pos = p(a, "k06");
    const fremd = z.euro(50, pos.gesamtkosten! * 0.5);
    a.belege = [{ zuPosition: "k06", bezeichnung: "Rechnung Treppenhausreinigung", betrag: fremd, fremdesObjekt: true, objekt: "anderes Objekt in Leipzig", seite: 6 }];
    return { betrag: runde((pos.anteilMieter * fremd) / pos.gesamtkosten!), positionId: "k06" };
  },
  "R-09.b": (a, z) => {
    const pos = p(a, "k07");
    const brutto = z.euro(200, 2000);
    const satz = z.ganz(0, 2);
    // doppelte Umsatzsteuer (19 % oder 7 %) oder ein beliebiger Übertragungsfehler
    const uebernommen = runde(satz === 0 ? brutto * 1.19 : satz === 1 ? brutto * 1.07 : brutto + z.euro(1, 300));
    pos.gesamtkosten = uebernommen;
    pos.anteilMieter = runde((uebernommen * w(a)) / g(a));
    a.belege = [{ zuPosition: "k07", bezeichnung: "Rechnung Gartenpflege", betrag: brutto, uebernommen, seite: 5 }];
    return { betrag: runde((pos.anteilMieter * runde(uebernommen - brutto)) / uebernommen), positionId: "k07" };
  },
  "R-09.c": (a, z) => {
    const h = a.heizkosten!;
    const gutschrift = z.euro(50, 1500);
    a.belege = [
      { zuPosition: "heizkosten", bezeichnung: "Jahresrechnung Heizstrom", betrag: h.gesamtkosten! },
      { zuPosition: "heizkosten", bezeichnung: "Gutschrift Preiskorrektur", art: "gutschrift", betrag: gutschrift, seite: 7 },
    ];
    return { betrag: runde((h.anteilMieter * gutschrift) / h.gesamtkosten!) };
  },
  "I-18.a": (a, z) => {
    const pos = p(a, "k07");
    const fremd = z.ganz(50, Math.floor(pos.gesamtkosten! * 0.5));
    if (z.ganz(0, 1)) pos.bestandteile = [{ bezeichnung: "Pflege Gemeinschaftsgarten", betrag: runde(pos.gesamtkosten! - fremd) }, { bezeichnung: "Pflege Privatgarten Wohnung EG rechts", betrag: fremd }];
    else pos.hinweise = [`Enthalten sind ${fremd.toLocaleString("de-DE")} € für die Pflege des Privatgartens der Erdgeschosswohnung.`];
    return { betrag: runde((pos.anteilMieter * fremd) / pos.gesamtkosten!), positionId: pos.id };
  },
  "I-18.b": (a, z) => {
    const kosten = z.euro(50, 400);
    a.kostenpositionen.push({ id: "x99", bezeichnung: "Gartenservice Privatgarten", kategorie: "gartenpflege", umlageschluessel: { typ: "direkt" }, anteilMieter: kosten, hinweise: ["Grundlage ist Anlage G zum Mietvertrag. Die Anlage G liegt nicht bei."] });
    a.ausgewiesen!.summeKostenMieter = runde(a.ausgewiesen!.summeKostenMieter! + kosten);
    a.ausgewiesen!.saldo = runde(a.ausgewiesen!.saldo! + kosten);
    return { positionId: "x99" };
  },
  "K-01.a": (a, z) => {
    const mitPosition = z.ganz(0, 1) === 1;
    a.kontrollbefunde = [{ beschreibung: "Der Anfangsstand des Wasserzählers wurde manuell übernommen und noch nicht mit der Vorjahresabrechnung abgeglichen.", textstelle: "Ein Abgleich mit dem Endstand der Abrechnung 2024 steht noch aus", ...(mitPosition ? { positionId: "k02" } : {}), seite: 3 }];
    return mitPosition ? { positionId: "k02" } : {};
  },
  "I-08.a": (a, z) => {
    const kosten = z.euro(300, 3000);
    // 30 kg CO₂ je m² → Vermieter trägt 40 %
    a.heizkosten!.co2 = { emissionKg: 30 * g(a), flaecheM2: g(a), kostenGesamt: kosten, vermieteranteil: runde(kosten * 0.4 - z.euro(1.5, kosten * 0.4)) };
    return {};
  },
  "I-09.a": (a) => {
    const pos = p(a, "k02");
    pos.umlageschluessel = { typ: "wohnflaeche", anteilEinheit: w(a), anteilGesamt: g(a) };
    pos.anteilMieter = runde((pos.gesamtkosten! * w(a)) / g(a));
    return {};
  },
  "I-10.a": (a, z) => {
    const x = neu(a, z, "Rauchwarnmelderservice", "sonstige");
    const miete = z.euro(10, x.gesamtkosten! * 0.8);
    x.bestandteile = [
      { bezeichnung: "Gerätemiete Rauchwarnmelder", betrag: miete },
      { bezeichnung: "Wartung und Funktionsprüfung", betrag: runde(x.gesamtkosten! - miete) },
    ];
    return { betrag: runde((x.anteilMieter * miete) / x.gesamtkosten!), positionId: x.id };
  },
  "I-10.b": (a, z) => ((x) => ({ betrag: x.anteilMieter, positionId: x.id }))(neu(a, z, "Miete Rauchwarnmelder", "sonstige")),
  "I-10.c": (a, z) => ({ positionId: neu(a, z, "Rauchwarnmelder Miete und Wartung", "sonstige").id }),
  "I-11.a": (a) => ((p(a, "k10").bezeichnung = "Hausmeister inkl. Kleinreparaturen"), { positionId: "k10" }),
  "I-11.b": (a, z) => {
    const pos = p(a, "k10");
    const verwaltung = z.ganz(20, Math.floor(pos.gesamtkosten! * 0.5));
    if (z.ganz(0, 1)) {
      // als Satz in einer Erläuterung, Betrag in deutscher Schreibweise
      pos.hinweise = [`Das Jahresentgelt enthält ${verwaltung.toLocaleString("de-DE")} € für Mietkonten, Mieterkorrespondenz und Abrechnungsvorbereitung.`];
    } else {
      pos.bestandteile = [
        { bezeichnung: "Hauswarttätigkeiten", betrag: runde(pos.gesamtkosten! - verwaltung) },
        { bezeichnung: "Verwaltung: Mietkonten und Korrespondenz", betrag: verwaltung },
      ];
    }
    return { betrag: runde((pos.anteilMieter * verwaltung) / pos.gesamtkosten!), positionId: pos.id };
  },
  "I-12.a": (a) => ((a.ausstattung!.gewerbeImHaus = true), {}),
  "I-13.a": (a, z) => {
    const alle = z.ganz(8, 40);
    const weniger = alle - z.ganz(1, 4);
    neu(a, z, "Kabelgrundgebühr Technik", "sonstige", { umlageschluessel: { typ: "einheiten", anteilEinheit: 1, anteilGesamt: alle } });
    const x = neu(a, z, "Treppenhausreinigung je Wohnung", "gebaeudereinigung_ungeziefer", { umlageschluessel: { typ: "einheiten", anteilEinheit: 1, anteilGesamt: weniger } });
    x.anteilMieter = runde(x.gesamtkosten! / weniger);
    return { betrag: runde(x.anteilMieter * (1 - weniger / alle)) };
  },
  "I-14.a": (a, z) => {
    const pos = p(a, "k01");
    pos.anteilMieter = runde(pos.anteilMieter * (z.ganz(0, 1) ? z.zahl(1.21, 2) : z.zahl(0.3, 0.79)));
    return {};
  },
  "I-15.a": (a, z) => (neu(a, z, "Regenwassergebühr", "entwaesserung"), {}),
  "P-01.a": (a) => {
    const v = a.vorjahr!.kostenpositionen.find((x) => x.kategorie === "strassenreinigung_muell")!;
    v.anteilMieter = runde(v.anteilMieter * 0.3);
    return {};
  },
  "P-01.b": (a) => ((a.vorjahr!.kostenpositionen = a.vorjahr!.kostenpositionen.filter((x) => x.kategorie !== "gartenpflege")), {}),
  "P-02.a": (a, z) => {
    const pos = p(a, "k09");
    pos.anteilMieter = runde(z.zahl(2.6, 4) * 12 * w(a));
    pos.gesamtkosten = runde((pos.anteilMieter * g(a)) / w(a));
    return {};
  },
  "P-03.a": (a, z) => {
    const m3 = z.ganz(200, 1500);
    a.heizkosten!.warmwasser = { kostenGesamt: runde(m3 * z.zahl(20.5, 45)), verbrauchGesamtM3: m3 };
    return {};
  },
};

describe("Fehlerkatalog: Vollständigkeit", () => {
  it("jede Regel hat mindestens eine Fehlerart, jede Fehlerart gehört zu einer Regel", () => {
    const regeln = new Set(ALLE_REGELN.map((r) => r.id));
    const imKatalog = new Set(FEHLERKATALOG.map((x) => x.regelId));
    expect([...regeln].filter((id) => !imKatalog.has(id))).toEqual([]);
    expect([...imKatalog].filter((id) => !regeln.has(id))).toEqual([]);
  });

  it("jede Fehlerart hat genau einen Test, IDs sind eindeutig", () => {
    const ids = FEHLERKATALOG.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(EINBAUEN).sort()).toEqual([...ids].sort());
  });
});

describe(`Keine Fehlalarme: ${KORREKTE} zufällige korrekte Abrechnungen`, () => {
  it("ergeben keinen Fehler, keinen Prüfbedarf, keinen Hinweis und keine offene Frage", () => {
    for (let i = 0; i < KORREKTE; i++) {
      const bericht = pruefeAbrechnung(korrekt(zufall(1000 + i)), { heute: HEUTE });
      const befunde = bericht.ergebnisse.filter((e) => e.status !== "ok").map((e) => `${e.regelId} ${e.status}: ${e.titel}`);
      expect(befunde, `Abrechnung Nr. ${i}`).toEqual([]);
      expect(bericht.zusammenfassung.einsparpotenzial + bericht.zusammenfassung.klaerungspotenzial + bericht.zusammenfassung.pruefbedarfBetrag).toBe(0);
    }
  });

  it("Zeilenprotokoll: jede Zeile geprüft, alle ok, Summe der Zeilen geht auf", () => {
    for (let i = 0; i < 50; i++) {
      const a = korrekt(zufall(5000 + i));
      const protokoll = erstelleZeilenprotokoll(pruefeAbrechnung(a, { heute: HEUTE }), a);
      const positionen = protokoll.zeilen.filter((x) => x.art === "position");
      expect(positionen.map((x) => x.positionId)).toEqual(a.kostenpositionen.map((x) => x.id));
      // Jede Kostenposition durchläuft mindestens: Angaben vollständig, Anteil nachgerechnet, Kostenart umlagefähig
      for (const zeile of positionen) expect(zeile.pruefungen.length, zeile.bezeichnung).toBeGreaterThanOrEqual(3);
      expect(protokoll.zeilen.filter((x) => x.ergebnis !== "ok").map((x) => `${x.bezeichnung}: ${x.ergebnis}`)).toEqual([]);
      expect(protokoll.vollstaendigkeit.ok).toBe(true);
      expect(protokoll.zeilen.map((x) => x.nr)).toEqual(protokoll.zeilen.map((_, k) => k + 1));
    }
  });
});

describe(`Vollständige Erkennung: jede Fehlerart in ${VARIANTEN} Zufallsvarianten`, () => {
  const statistik: { erkannt: number; gesamt: number } = { erkannt: 0, gesamt: 0 };

  it.each(FEHLERKATALOG.map((x) => [x.id, x.name, x] as [string, string, Fehlerart]))("%s %s", (_id, _name, art) => {
    for (let i = 0; i < VARIANTEN; i++) {
      const z = zufall(art.id.split("").reduce((s, c) => s * 31 + c.charCodeAt(0), 7) + i);
      const a = korrekt(z);
      const erwartet = EINBAUEN[art.id]!(a, z);
      const bericht = pruefeAbrechnung(a, { heute: erwartet.heute ?? HEUTE });
      const treffer = bericht.ergebnisse.filter((e) => e.regelId === art.regelId && e.status === art.ergebnis && (!erwartet.positionId || !e.positionId || e.positionId === erwartet.positionId));
      statistik.gesamt++;
      expect(treffer.length, `${art.id} Variante ${i}: nicht erkannt`).toBeGreaterThan(0);
      if (art.betrag === "keiner") {
        expect(treffer.every((e) => e.betragZugunstenMieter === undefined), `${art.id} Variante ${i}: Betrag ohne Grundlage`).toBe(true);
      } else {
        expect(erwartet.betrag, `${art.id}: Test muss einen Betrag nachrechnen`).toBeDefined();
        expect(treffer.map((e) => e.betragZugunstenMieter), `${art.id} Variante ${i}: Betrag`).toContain(erwartet.betrag);
      }
      // Belegte Fehler zählen exakt zum sicheren Potenzial, alles andere nie
      if (art.ergebnis === "abweichung" && art.betrag === "exakt") expect(bericht.zusammenfassung.einsparpotenzial).toBeGreaterThanOrEqual(erwartet.betrag!);
      // Zeilenprotokoll: kein Regelergebnis geht verloren, der Fehler steht an seiner Zeile
      const protokoll = erstelleZeilenprotokoll(bericht, a);
      const imProtokoll = protokoll.zeilen.flatMap((x) => x.pruefungen.map((q) => ({ zeile: x, q })));
      for (const e of bericht.ergebnisse.filter((x) => x.status !== "ok"))
        expect(imProtokoll.some(({ q }) => q.regelId === e.regelId && q.ergebnis !== "ok"), `${art.id}: ${e.regelId} fehlt im Zeilenprotokoll`).toBe(true);
      const ERWARTET = { abweichung: "fehler", auffaelligkeit: "pruefbedarf", pruefbedarf: "pruefbedarf", hinweis: "hinweis" } as const;
      const stellen = imProtokoll.filter(({ q }) => q.regelId === art.regelId && q.ergebnis === ERWARTET[art.ergebnis]);
      expect(stellen.length, `${art.id}: nicht im Zeilenprotokoll`).toBeGreaterThan(0);
      if (erwartet.positionId) expect(stellen.some(({ zeile }) => zeile.positionId === erwartet.positionId), `${art.id}: an der falschen Zeile`).toBe(true);
      statistik.erkannt++;
    }
  });

  it("Erkennungsquote 100 %", () => {
    expect(statistik.gesamt).toBe(FEHLERKATALOG.length * VARIANTEN);
    expect(statistik.erkannt).toBe(statistik.gesamt);
  });
});

describe("Formelkatalog als Dokument", () => {
  const pfad = fileURLToPath(new URL("../../../docs/FORMELKATALOG.md", import.meta.url));
  const ERGEBNIS = { abweichung: "Belegter Fehler", auffaelligkeit: "Begründeter Prüfbedarf", pruefbedarf: "Prüfbedarf (Unterlage nötig)", hinweis: "Hinweis" };
  const BETRAG = { exakt: "exakt", bis_zu: "bis zu", keiner: "nicht bezifferbar" };
  const text = [
    "# Formelkatalog",
    "",
    "Automatisch erzeugt aus `packages/pruefkern/src/fehlerkatalog.ts`. Nicht von Hand ändern:",
    "`UPDATE_FORMELKATALOG=1 pnpm --filter @biaticheck/pruefkern test`.",
    "",
    `Der Prüfkern erkennt ${FEHLERKATALOG.length} Fehlerarten in ${ALLE_REGELN.length} Regeln allein durch Formeln. Die KI liest nur die Werte aus dem Dokument.`,
    `Nachweis: \`packages/pruefkern/test/fehlerkatalog.test.ts\` baut jede Fehlerart in ${VARIANTEN} Zufallsvarianten ein (${FEHLERKATALOG.length * VARIANTEN} Fälle) und prüft ${KORREKTE} korrekte Abrechnungen auf Fehlalarme.`,
    "",
    "| ID | Fehlerart | Formel | Ergebnis | Betrag | Braucht |",
    "|---|---|---|---|---|---|",
    ...FEHLERKATALOG.map((x) => `| ${x.id} | ${x.name} | ${x.formel.replace(/\|/g, "\\|")} | ${ERGEBNIS[x.ergebnis]} | ${BETRAG[x.betrag]} | ${x.braucht} |`),
    "",
    "## Nicht aus der Abrechnung berechenbar",
    "",
    "Diese Fehler stehen nicht in den Zahlen der Abrechnung. Sie brauchen Belege oder einen Fachprüfer:",
    "",
    ...NICHT_BERECHENBAR.map((x) => `- ${x}`),
    "",
  ].join("\n");

  it("docs/FORMELKATALOG.md entspricht dem Katalog im Code", () => {
    if (process.env.UPDATE_FORMELKATALOG) writeFileSync(pfad, text);
    expect(readFileSync(pfad, "utf-8")).toBe(text);
  });
});
