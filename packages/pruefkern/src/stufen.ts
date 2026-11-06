import { antworttyp, type Antworttyp } from "./antworten";
import { datumDE, euro, plusMonate, runde, tageInklusive, vergleiche, zahlDE } from "./hilfen";
import { ALLE_REGELN, type Pruefbericht } from "./pruefung";
import type { Regelergebnis, Status } from "./regel";
import { Abrechnung, NICHT_UMLAGEFAEHIG, type AbrechnungEingabe, type Kostenkategorie } from "./schema";
import { vergleicheKosten, type KostenvergleichErgebnis, type Referenzwerte } from "./vergleich";

/**
 * Ergebnisstufen für den Kunden.
 *
 * Stufe 1 (kostenlos)
 *   1.1 Fehlerpotenzial und Widerspruchsfrist
 *   1.2 Kostenvergleich, Betriebskosten und Nachzahlung
 * Stufe 2 (nach Bezahlung)
 *   Auffälligkeiten mit Lösungsvorschlägen, Zusammenfassung, Anschreiben an die Hausverwaltung
 *
 * Stufe 1 wird unverändert an den Browser geschickt und darf keine Inhalte
 * aus Stufe 2 enthalten (Titel, Erklärungen, Lösungsvorschläge).
 */

// ---------- Lösungsvorschläge ----------

/**
 * Lösungsvorschläge für Befunde, deren Regel keinen eigenen nächsten Schritt liefert.
 * Schlüssel: "Regel-ID:Status". Fachlich vom Expertenteam zu pflegen.
 */
export const LOESUNGSVORSCHLAEGE: Readonly<Record<string, string>> = {
  "F-02:nicht_pruefbar":
    "Ermitteln Sie, an welchem Tag Ihnen die Abrechnung zugegangen ist (Poststempel, Eingang der E-Mail), und tragen Sie das Datum ein. Davon hängt ab, ob eine Nachforderung überhaupt noch zulässig ist.",
  "F-03:nicht_pruefbar":
    "Tragen Sie das Zugangsdatum der Abrechnung ein. Dann berechnen wir, bis wann Sie Einwände erheben können.",
  "F-03:auffaelligkeit":
    "Prüfen Sie, ob Sie die Frist ohne eigenes Verschulden versäumt haben, etwa weil Ihnen Belege nicht zugänglich gemacht wurden. In diesem Fall können Einwände noch möglich sein – lassen Sie sich dazu beraten.",
  "R-01:nicht_pruefbar":
    "Fordern Sie beim Vermieter eine Abrechnung an, die je Kostenart die Gesamtkosten und den Verteilerschlüssel ausweist. Nur dann ist Ihr Anteil nachvollziehbar.",
  "R-03:nicht_pruefbar":
    "Gleichen Sie die Summe Ihrer Vorauszahlungen mit Ihren Kontoauszügen oder dem Mietkonto ab und tragen Sie sie ein.",
  "I-02:nicht_pruefbar":
    "Sehen Sie in Ihrem Mietvertrag nach, ob diese Kostenart ausdrücklich als sonstige Betriebskosten vereinbart ist. Ist sie dort nicht genannt, fordern Sie die Streichung der Position.",
  "I-04:nicht_pruefbar":
    "Fordern Sie beim Vermieter die Einzelabrechnung des Messdienstes (Heizkostenabrechnung) an. Ohne sie lassen sich Heiz- und Warmwasserkosten nicht prüfen.",
  "I-06:nicht_pruefbar":
    "Prüfen Sie, ob Ihr Mietvertrag Erdgeschosswohnungen von den Aufzugskosten ausnimmt. Erreichen Sie über den Aufzug weder Keller noch Tiefgarage, sprechen Sie die Hausverwaltung darauf an.",
  "P-01:nicht_pruefbar":
    "Legen Sie die Abrechnung des Vorjahres bereit. Mit ihr erkennen wir ungewöhnliche Kostensteigerungen einzelner Positionen.",
  "P-02:nicht_pruefbar": "Tragen Sie die Wohnfläche laut Mietvertrag ein, damit wir Ihre Kosten mit üblichen Werten vergleichen können.",
};

export function loesungsvorschlag(e: Regelergebnis): string | undefined {
  if (e.status === "ok") return undefined;
  return e.naechsterSchritt ?? LOESUNGSVORSCHLAEGE[`${e.regelId}:${e.status}`];
}

// ---------- Stufe 1 ----------

export type Fehlerstufe = "hoch" | "mittel" | "gering" | "keins";

/**
 * Fehlerpotenzial als einfache Aussage: Anteil der Prüfregeln, die einen Fehler
 * oder eine Auffälligkeit melden. Ein sicher bezifferbarer Fehler ist immer „hoch“.
 * Schwellen sind vom Expertenteam zu bestätigen.
 */
export function fehlerstufe(quote: number, sicher: number): Fehlerstufe {
  if (sicher > 0 || quote >= 20) return "hoch";
  if (quote >= 10) return "mittel";
  if (quote > 0) return "gering";
  return "keins";
}

export type Friststatus = "offen" | "abgelaufen" | "unbekannt";

export interface Stufe1 {
  regelwerkVersion: string;
  geprueftAm: string;
  abrechnungsjahr?: number;
  /** 1.1 Fehlerpotenzial und Widerspruchsfrist */
  fehlerpotenzial: {
    /** Sicher bezifferbare Ersparnis aus eindeutigen Fehlern. */
    sicher: number;
    /** Beträge, die sich nach Klärung als Ersparnis erweisen können. */
    zuKlaeren: number;
    anzahl: Record<Status, number>;
    /** Anteil der Prüfregeln mit Fehler oder Auffälligkeit, in Prozent. */
    quote: number;
    /** Zahl der Prüfregeln mit Fehler oder Auffälligkeit / Zahl aller Prüfregeln. */
    regelnAuffaellig: number;
    regelnGesamt: number;
    stufe: Fehlerstufe;
  };
  widerspruchsfrist: {
    status: Friststatus;
    /** Letzter Tag für Einwände (Zugang + 12 Monate). */
    bis?: string;
    tageVerbleibend?: number;
    /** Abrechnungsfrist des Vermieters (Ende Zeitraum + 12 Monate). */
    abrechnungsfrist: { status: "eingehalten" | "versaeumt" | "unbekannt"; bis?: string };
  };
  /** 1.2 Kostenvergleich, Betriebskosten und Nachzahlung */
  kosten: {
    betriebskosten?: number;
    heizkosten?: number;
    vorauszahlungen?: number;
    /** Positiv = Nachzahlung, negativ = Guthaben. */
    saldo?: number;
  };
  vergleich: KostenvergleichErgebnis;
  /** Rückfragen, die Stufe 1 vervollständigen (z. B. Zugangsdatum, PLZ). */
  rueckfragen: { feld: string; frage: string; typ: Antworttyp }[];
}

/** Felder, die schon in Stufe 1 abgefragt werden – alle anderen Rückfragen gehören zu Stufe 2. */
const STUFE1_FELDER = new Set(["meta.zugangAm", "meta.plz", "flaechen.wohnflaecheMieter"]);

const FRAGE_PLZ = { feld: "meta.plz", frage: "In welcher Postleitzahl liegt Ihre Wohnung? (für den regionalen Kostenvergleich)" };

export function erstelleStufe1(
  bericht: Pruefbericht,
  eingabe: AbrechnungEingabe,
  optionen: { heute?: string; regional?: Referenzwerte } = {},
): Stufe1 {
  const a = Abrechnung.parse(eingabe);
  const heute = optionen.heute ?? bericht.geprueftAm;
  const z = bericht.zusammenfassung;

  // Fristen
  const zeitraum = a.meta.abrechnungszeitraum;
  const abrechnungsfristBis = zeitraum ? plusMonate(zeitraum.bis, 12) : undefined;
  const zugang = a.meta.zugangAm;
  const stichtag = zugang ?? (a.meta.erstelltAm && abrechnungsfristBis && vergleiche(a.meta.erstelltAm, abrechnungsfristBis) > 0 ? a.meta.erstelltAm : undefined);
  const abrechnungsfrist: Stufe1["widerspruchsfrist"]["abrechnungsfrist"] = !abrechnungsfristBis
    ? { status: "unbekannt" }
    : !stichtag
      ? { status: "unbekannt", bis: abrechnungsfristBis }
      : { status: vergleiche(stichtag, abrechnungsfristBis) > 0 ? "versaeumt" : "eingehalten", bis: abrechnungsfristBis };

  let widerspruch: Omit<Stufe1["widerspruchsfrist"], "abrechnungsfrist"> = { status: "unbekannt" };
  if (zugang) {
    const bis = plusMonate(zugang, 12);
    const tage = vergleiche(heute, bis) > 0 ? 0 : tageInklusive(heute, bis) - 1;
    widerspruch = { status: vergleiche(heute, bis) > 0 ? "abgelaufen" : "offen", bis, tageVerbleibend: tage };
  }

  // Kosten
  const betriebskosten = runde(a.kostenpositionen.reduce((s, p) => s + p.anteilMieter, 0));
  const heizkosten = a.heizkosten && !a.heizkosten.inKostenpositionenEnthalten ? a.heizkosten.anteilMieter : undefined;

  // Rückfragen für Stufe 1
  const rueckfragen = z.rueckfragen.filter((r) => STUFE1_FELDER.has(r.feld));
  if (!a.meta.plz && !rueckfragen.some((r) => r.feld === FRAGE_PLZ.feld)) rueckfragen.push(FRAGE_PLZ);

  const regelnAuffaellig = new Set(bericht.ergebnisse.filter((e) => e.status === "abweichung" || e.status === "auffaelligkeit").map((e) => e.regelId)).size;
  const quote = Math.round((regelnAuffaellig / ALLE_REGELN.length) * 100);

  return {
    regelwerkVersion: bericht.regelwerkVersion,
    geprueftAm: bericht.geprueftAm,
    abrechnungsjahr: zeitraum ? Number(zeitraum.bis.slice(0, 4)) : undefined,
    fehlerpotenzial: {
      sicher: z.einsparpotenzial,
      zuKlaeren: z.klaerungspotenzial,
      anzahl: { ...z.anzahl },
      quote,
      regelnAuffaellig,
      regelnGesamt: ALLE_REGELN.length,
      stufe: fehlerstufe(quote, z.einsparpotenzial),
    },
    widerspruchsfrist: { ...widerspruch, abrechnungsfrist },
    kosten: { betriebskosten, heizkosten, vorauszahlungen: a.vorauszahlungen, saldo: a.ausgewiesen.saldo },
    vergleich: vergleicheKosten(a, optionen.regional),
    rueckfragen: rueckfragen.map((r) => {
      const typ = antworttyp(r.feld);
      if (!typ) throw new Error(`Rückfrage-Feld nicht registriert: ${r.feld}`);
      return { feld: r.feld, frage: r.frage, typ };
    }),
  };
}

// ---------- Stufe 2 ----------

export interface Auffaelligkeit {
  regelId: string;
  status: Exclude<Status, "ok">;
  titel: string;
  befund: string;
  loesung: string;
  betrag?: number;
  grundlage: string;
  /** Formulierung für das Anschreiben an die Hausverwaltung (sachlich, an den Vermieter gerichtet). */
  brief: string;
  /** Kurzfassung für den Kunden: kurzer Titel und ein Satz, ohne Fachsprache. */
  kurz: { titel: string; satz: string };
}

/** Die eine Empfehlung, die der Kunde zuerst sieht. */
export interface Empfehlung {
  titel: string;
  text: string;
  /** Hauptknopf: Schreiben an die Hausverwaltung, Expertenberatung oder nichts zu tun. */
  aktion: "schreiben" | "beratung" | "keine";
}

export interface Stufe2 {
  auffaelligkeiten: Auffaelligkeit[];
  /** Weitere Rückfragen, die die Prüfung vervollständigen. */
  rueckfragen: { feld: string; frage: string; typ: Antworttyp }[];
  /** Zusammenfassung in ganzen Sätzen – ohne Aufzählungszeichen, Hervorhebungen oder Symbole. */
  zusammenfassung: string[];
  empfehlung: Empfehlung;
  /** Konkretes Ergebnis: korrigierte Nachzahlung, nächste Schritte mit Terminen, Belege, Steuerhinweis. */
  fahrplan: Fahrplan;
  anschreiben: { betreff: string; text: string };
}

const REIHENFOLGE: Record<Exclude<Status, "ok">, number> = { abweichung: 0, auffaelligkeit: 1, nicht_pruefbar: 2 };

const GRUNDLAGEN = new Map(ALLE_REGELN.map((r) => [r.id, r.grundlage]));

export function erstelleStufe2(bericht: Pruefbericht, eingabe: AbrechnungEingabe, stufe1: Stufe1): Stufe2 {
  const a = Abrechnung.parse(eingabe);
  const auffaelligkeiten: Auffaelligkeit[] = bericht.ergebnisse
    .filter((e): e is Regelergebnis & { status: Exclude<Status, "ok"> } => e.status !== "ok")
    .sort((x, y) => REIHENFOLGE[x.status] - REIHENFOLGE[y.status] || (y.betragZugunstenMieter ?? 0) - (x.betragZugunstenMieter ?? 0))
    .map((e) => {
      const loesung = loesungsvorschlag(e);
      if (!loesung) throw new Error(`Kein Lösungsvorschlag für ${e.regelId}:${e.status}`);
      return {
        regelId: e.regelId,
        status: e.status,
        titel: e.titel,
        befund: e.erklaerung,
        loesung,
        betrag: e.betragZugunstenMieter !== undefined && e.betragZugunstenMieter > 0 ? e.betragZugunstenMieter : undefined,
        grundlage: GRUNDLAGEN.get(e.regelId) ?? "",
        brief: briefpunkt(e, a),
        kurz: kurzfassung(e, a),
      };
    });

  return {
    auffaelligkeiten,
    rueckfragen: bericht.zusammenfassung.rueckfragen
      .filter((r) => !STUFE1_FELDER.has(r.feld))
      .map((r) => ({ feld: r.feld, frage: r.frage, typ: antworttyp(r.feld)! })),
    zusammenfassung: erstelleZusammenfassung(stufe1, auffaelligkeiten),
    empfehlung: erstelleEmpfehlung(stufe1, auffaelligkeiten),
    fahrplan: erstelleFahrplan(stufe1, auffaelligkeiten, bericht, a),
    anschreiben: erstelleAnschreiben(a, auffaelligkeiten.filter((p) => gehoertInsAnschreiben(p, bericht)), stufe1),
  };
}

/**
 * Nicht jeder Befund gehört in den Brief an die Hausverwaltung:
 * - Kostenvergleich mit Durchschnittswerten (P-02) ist keine Frage an den Vermieter
 * - „Neue Kostenart“ (P-01) für Kosten, gegen die ohnehin ein Einwand erhoben wird, wäre doppelt
 */
function gehoertInsAnschreiben(p: Auffaelligkeit, bericht: Pruefbericht): boolean {
  if (p.regelId === "P-02") return false;
  if (p.regelId === "P-01") {
    const quelle = bericht.ergebnisse.find((e) => e.regelId === "P-01" && e.titel === p.titel);
    const kategorie = quelle?.beleg?.kategorie as Kostenkategorie | undefined;
    if (kategorie && NICHT_UMLAGEFAEHIG.includes(kategorie)) return false;
  }
  return true;
}

export function erstelleZusammenfassung(s1: Stufe1, punkte: Auffaelligkeit[]): string[] {
  const n = s1.fehlerpotenzial.anzahl;
  const jahr = s1.abrechnungsjahr ? ` ${s1.abrechnungsjahr}` : "";
  const saetze: string[] = [];

  const teile = [
    n.abweichung ? `${n.abweichung} Fehler` : "",
    n.auffaelligkeit ? `${n.auffaelligkeit} ${n.auffaelligkeit === 1 ? "Auffälligkeit" : "Auffälligkeiten"}` : "",
    n.nicht_pruefbar ? `${n.nicht_pruefbar} ${n.nicht_pruefbar === 1 ? "offenen Punkt" : "offene Punkte"}` : "",
  ].filter(Boolean);
  saetze.push(
    teile.length
      ? `Wir haben Ihre Abrechnung${jahr} anhand von ${ALLE_REGELN.length} Prüfregeln untersucht und dabei ${teile.join(", ").replace(/, ([^,]*)$/, " und $1")} festgestellt.`
      : `Wir haben Ihre Abrechnung${jahr} geprüft und keine Fehler oder Auffälligkeiten festgestellt.`,
  );

  const { sicher, zuKlaeren } = s1.fehlerpotenzial;
  if (sicher > 0) saetze.push(`Sicher bezifferbar ist ein Einsparpotenzial von ${euro(sicher)}.`);
  if (zuKlaeren > 0) saetze.push(`Weitere ${euro(zuKlaeren)} können sich nach Klärung mit dem Vermieter als Ersparnis erweisen.`);

  if (s1.vergleich.ok) {
    const g = s1.vergleich.vergleich.gesamt;
    if (g.abweichungProzent !== undefined && g.durchschnitt !== undefined) {
      const richtung = g.abweichungProzent > 0 ? `${g.abweichungProzent} % über` : g.abweichungProzent < 0 ? `${-g.abweichungProzent} % unter` : "genau im";
      saetze.push(
        `Ihre Nebenkosten liegen mit ${zahlDE(g.ihr)} € je m² und Monat ${richtung} dem Durchschnitt (${zahlDE(g.durchschnitt)} €, ${s1.vergleich.vergleich.region}).`,
      );
    }
  }

  const wichtigster = punkte.find((p) => p.status !== "nicht_pruefbar");
  if (wichtigster) saetze.push(`Der wichtigste Punkt ist „${wichtigster.titel}“. ${wichtigster.loesung}`);

  const f = s1.widerspruchsfrist;
  if (f.status === "offen" && f.bis) saetze.push(`Einwände gegen die Abrechnung können Sie bis zum ${datumDE(f.bis)} schriftlich erheben.`);
  if (f.status === "abgelaufen" && f.bis) saetze.push(`Die Frist für Einwände ist am ${datumDE(f.bis)} abgelaufen.`);
  if (f.status === "unbekannt") saetze.push("Tragen Sie das Zugangsdatum der Abrechnung ein, damit wir Ihre Frist für Einwände berechnen können.");
  return saetze;
}

/** Eine klare Empfehlung statt vieler Einzelschritte. */
export function erstelleEmpfehlung(s1: Stufe1, punkte: Auffaelligkeit[]): Empfehlung {
  const f = s1.widerspruchsfrist;
  const saldo = s1.kosten.saldo ?? 0;
  const beanstandet = punkte.filter((p) => p.status !== "nicht_pruefbar");
  const frist = f.status === "offen" && f.bis ? ` Senden Sie es bis spätestens ${datumDE(f.bis)}.` : "";

  if (f.status === "abgelaufen")
    return {
      titel: "Die Frist für Einwände ist abgelaufen",
      text: "Einwände sind nur noch in Ausnahmefällen möglich. Unsere Experten prüfen, ob das bei Ihnen zutrifft.",
      aktion: "beratung",
    };
  if (punkte.some((p) => p.regelId === "F-02" && p.status === "abweichung") && saldo > 0)
    return {
      titel: "Sie müssen die Nachzahlung nicht bezahlen",
      text: `Die Abrechnung kam zu spät. Damit entfällt die Nachzahlung von ${euro(saldo)}. Teilen Sie das Ihrer Hausverwaltung mit dem vorbereiteten Schreiben mit.`,
      aktion: "schreiben",
    };
  if (beanstandet.length)
    return {
      titel: "Schicken Sie das vorbereitete Schreiben an Ihre Hausverwaltung",
      text: `Darin fordern wir die Klärung von ${beanstandet.length === 1 ? "einem Punkt" : `${beanstandet.length} Punkten`}, die Sie Geld kosten können.${frist}`,
      aktion: "schreiben",
    };
  if (punkte.length)
    return {
      titel: "Keine Fehler gefunden",
      text: "Einige Punkte lassen sich nur mit Ihrem Mietvertrag prüfen. Das übernehmen unsere Experten für Sie.",
      aktion: "beratung",
    };
  return { titel: "Ihre Abrechnung ist in Ordnung", text: "Wir haben keine Fehler gefunden.", aktion: "keine" };
}

/**
 * Kurzfassung eines Befunds für den Kunden: kurzer Titel und ein Satz.
 * Ohne eigene Formulierung: Titel der Regel und der erste Satz der Erklärung.
 */
export function kurzfassung(e: Regelergebnis, a: Abrechnung): { titel: string; satz: string } {
  const b = e.beleg ?? {};
  const rohName = (e.positionId ? a.kostenpositionen.find((p) => p.id === e.positionId)?.bezeichnung : undefined) ?? e.titel.replace(/^[^:]*: /, "");
  // Paragraphen-Verweise aus Positionsnamen entfernen („§ 2 Nr. 13 – Versicherung“ → „Versicherung“)
  const name = rohName.replace(/^§\s*\d+[^–-]*[–-]\s*/, "").trim() || rohName;
  const k = (titel: string, satz: string) => ({ titel, satz });
  const s = e.status;

  switch (e.regelId) {
    case "F-01":
      return s === "abweichung" ? k("Zeitraum zu lang", "Eine Abrechnung darf höchstens 12 Monate umfassen.") : k("Zeitraum fehlt", "Der Abrechnungszeitraum ist nicht erkennbar.");
    case "F-02":
      if (s === "abweichung") return k("Abrechnung kam zu spät", "Eine Nachzahlung müssen Sie deshalb nicht leisten.");
      if (s === "nicht_pruefbar") return k("Eingangsdatum fehlt", "Davon hängt ab, ob Sie überhaupt nachzahlen müssen.");
      return k("Abrechnung kam zu spät", "Ein Guthaben steht Ihnen trotzdem zu.");
    case "F-03":
      return s === "nicht_pruefbar" ? k("Eingangsdatum fehlt", "Damit berechnen wir Ihre Frist für Einwände.") : k("Frist abgelaufen", "Einwände sind nur noch in Ausnahmefällen möglich.");
    case "F-04":
      return k(`Angaben fehlen: ${name}`, "Gesamtkosten oder Verteilung sind nicht angegeben.");
    case "F-05":
      return k("Pauschale vereinbart", "Bei einer Pauschale darf nicht nachberechnet werden.");
    case "R-01":
      return s === "abweichung" ? k(`Rechenfehler: ${name}`, "Ihr Anteil ist falsch berechnet.") : k("Anteile nicht nachrechenbar", "Gesamtkosten oder Verteilung fehlen.");
    case "R-02":
      return k("Summe falsch addiert", "Die Einzelposten ergeben eine andere Summe.");
    case "R-03":
      return s === "abweichung" ? k("Nachzahlung falsch berechnet", "Kosten minus Vorauszahlungen ergibt einen anderen Betrag.") : k("Vorauszahlungen fehlen", "Ohne sie lässt sich die Nachzahlung nicht prüfen.");
    case "R-04":
      return k("Unterschiedliche Flächen", "Für Ihre Wohnung werden verschiedene Größen angesetzt.");
    case "R-05": {
      const art = b.art === "heizkosten" ? "Heizkosten" : "Betriebskosten";
      const jahr = zahl(b.jahr), erwartet = zahl(b.erwartet);
      return k(
        (zahl(b.differenz) ?? 0) > 0 ? `Vorauszahlungen ${art} zu niedrig angerechnet` : `Vorauszahlungen ${art} abweichend angerechnet`,
        jahr !== undefined && erwartet !== undefined ? `Angerechnet sind ${euro(jahr)}, nach Ihren Monatsbeträgen wären es ${euro(erwartet)}.` : "Die angerechneten Zahlungen passen nicht zu Ihren Monatsbeträgen.",
      );
    }
    case "I-01":
      return k(`Nicht erlaubt: ${name}`, "Diese Kosten darf der Vermieter nicht auf Sie umlegen.");
    case "I-02":
      return s === "abweichung" ? k(`Nicht vereinbart: ${name}`, "Steht nicht in Ihrem Mietvertrag und darf nicht umgelegt werden.") : k(name, "Nur erlaubt, wenn es in Ihrem Mietvertrag steht.");
    case "I-03":
      return k(`Unklar: ${name}`, "Es ist nicht erkennbar, wofür diese Kosten sind.");
    case "I-04":
      if (s === "abweichung") return k("Heizung nicht nach Verbrauch abgerechnet", "Sie dürfen Ihren Anteil um 15 % kürzen.");
      if (s === "nicht_pruefbar") return k("Heizkostenabrechnung fehlt", "Ohne sie lassen sich die Heizkosten nicht prüfen.");
      return k("Heizkosten ungewöhnlich verteilt", "Der Anteil nach Verbrauch liegt außerhalb des Üblichen.");
    case "I-05":
      return s === "abweichung" ? k(`Kabelfernsehen: ${name}`, "Seit Juli 2024 nicht mehr umlagefähig.") : k(`Kabelfernsehen: ${name}`, "Erlaubt sind nur Kosten bis Juni 2024.");
    case "I-06":
      return s === "abweichung" ? k("Aufzug trotz Erdgeschoss", "Ihr Mietvertrag nimmt Sie davon aus.") : k("Aufzug im Erdgeschoss", "Nur unzulässig, wenn Ihr Mietvertrag das so regelt.");
    case "I-07":
      return k(`Reparaturen in „${name}“?`, "Reparaturen dürfen nicht auf Mieter umgelegt werden.");
    case "I-08":
      return k("CO₂-Kosten falsch verteilt", "Einen Teil davon muss der Vermieter selbst tragen.");
    case "P-01":
      if (s === "nicht_pruefbar") return k("Vorjahresabrechnung fehlt", "Mit ihr erkennen wir ungewöhnliche Preissprünge.");
      return e.titel.startsWith("Neue") ? k(`Neu: ${name}`, "Diese Kosten gab es im Vorjahr nicht.") : k(`Stark gestiegen: ${name}`, "Deutlich teurer als im Vorjahr.");
    case "P-02":
      return s === "nicht_pruefbar" ? k("Wohnfläche fehlt", "Damit vergleichen wir Ihre Kosten mit anderen.") : k("Nebenkosten über Durchschnitt", "Deutlich teurer als bei vergleichbaren Wohnungen.");
    case "P-03": {
      const m3 = zahl(b.proM3);
      return k("Warmwasser sehr teuer", m3 !== undefined ? `${euro(m3)} je m³, üblich sind bis etwa 20 €.` : "Deutlich teurer als üblich.");
    }
  }
  return k(e.titel, e.erklaerung.split(/(?<=\.)\s/)[0]!);
}

const zahl = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Formuliert einen Befund als Punkt im Brief an die Hausverwaltung: sachlich,
 * an den Vermieter gerichtet, mit den konkreten Zahlen. Ohne eigene Formulierung
 * wird der Titel ohne Handlungsaufforderung verwendet.
 */
export function briefpunkt(e: Regelergebnis, a: Abrechnung): string {
  const b = e.beleg ?? {};
  const position = e.positionId ? a.kostenpositionen.find((p) => p.id === e.positionId) : undefined;
  const name = position?.bezeichnung;
  const betrag = e.betragZugunstenMieter !== undefined && e.betragZugunstenMieter > 0 ? ` (${euro(e.betragZugunstenMieter)})` : "";

  switch (e.regelId) {
    case "F-02":
      if (e.status === "abweichung" && typeof b.stichtag === "string" && typeof b.fristEnde === "string")
        return `Die Abrechnung ist mir erst am ${datumDE(b.stichtag)} zugegangen, nach Ablauf der Abrechnungsfrist am ${datumDE(b.fristEnde)}. Eine Nachforderung ist daher ausgeschlossen.`;
      break;
    case "R-01":
      if (name && zahl(b.erwartet) !== undefined && zahl(b.berechnet) !== undefined)
        return `${name}: Nach dem angegebenen Verteilerschlüssel ergeben sich ${euro(zahl(b.erwartet)!)}, berechnet wurden ${euro(zahl(b.berechnet)!)}.`;
      break;
    case "R-02":
      return `Die Summe der Einzelpositionen stimmt nicht mit der ausgewiesenen Gesamtsumme überein${betrag}.`;
    case "R-03":
      return `Das ausgewiesene Abrechnungsergebnis stimmt nicht mit Kosten abzüglich Vorauszahlungen überein${betrag}.`;
    case "R-04":
      if (zahl(b.heizflaeche) !== undefined && zahl(b.wohnflaeche) !== undefined)
        return `Unterschiedliche Flächen: In der Heizkostenabrechnung werden ${zahlDE(zahl(b.heizflaeche)!)} m² angesetzt, in der Betriebskostenabrechnung ${zahlDE(zahl(b.wohnflaeche)!)} m². Bitte erläutern Sie die Abweichung.`;
      return "Für meine Wohnung werden unterschiedliche Flächen angesetzt. Bitte erläutern Sie die Abweichung.";
    case "R-05":
      if (zahl(b.jahr) !== undefined)
        return `Angerechnete Vorauszahlungen für ${b.art === "heizkosten" ? "Heizkosten" : "Betriebskosten"}: ${euro(zahl(b.jahr)!)}. Bitte gleichen Sie diesen Betrag mit meinen tatsächlichen Zahlungen im Abrechnungszeitraum ab.`;
      break;
    case "I-01":
      if (name) return `${name}${betrag}: Diese Kosten sind nicht als Betriebskosten umlagefähig.`;
      break;
    case "I-02":
      if (name) return `${name}${betrag}: Diese Kostenart ist im Mietvertrag nicht als sonstige Betriebskosten vereinbart.`;
      break;
    case "I-04":
      if (e.status === "abweichung") return `Meine Heizkosten wurden nicht nach Verbrauch abgerechnet. Ich kürze meinen Anteil um 15 %${betrag}.`;
      return "Bitte erläutern Sie den gewählten Verteilerschlüssel der Heizkosten.";
    case "I-05":
      if (name) return `${name}: Bitte belegen Sie, dass nur Kosten bis zum 30.06.2024 enthalten sind.`;
      break;
    case "I-06":
      if (e.status === "abweichung") return `Aufzugskosten${betrag}: Nach meinem Mietvertrag sind Erdgeschosswohnungen davon ausgenommen.`;
      break;
    case "I-07":
      if (name) return `${name}: Bitte legen Sie den Wartungsvertrag vor und weisen Sie aus, ob darin Reparaturkosten enthalten sind.`;
      break;
    case "I-08":
      return "Die Aufteilung der CO₂-Kosten entspricht nicht dem Stufenmodell nach dem CO2KostAufG. Bitte korrigieren Sie die Aufteilung.";
    case "P-01":
      return `${e.titel.replace(/^Starker Anstieg: |^Neue Kostenart: /, "")}: Bitte erläutern Sie ${e.titel.startsWith("Neue") ? "diese neu abgerechnete Kostenart" : "den deutlichen Kostenanstieg gegenüber dem Vorjahr"} und legen Sie die Belege vor.`;
    case "P-03":
      if (zahl(b.proM3) !== undefined)
        return `Warmwasserkosten von ${euro(zahl(b.proM3)!)} je m³: Bitte legen Sie die Belege zu Energie, Entkalkung und Wartung vor.`;
      break;
  }
  return e.titel.replace(/^(.*) prüfen: (.*)$/, "$2 ($1)").replace(/ prüfen$/, "");
}

/** Sachliches Anschreiben an die Hausverwaltung – Vorlage zum Anpassen, keine Rechtsberatung. */
export function erstelleAnschreiben(a: Abrechnung, punkte: Auffaelligkeit[], s1: Stufe1): { betreff: string; text: string } {
  const z = a.meta.abrechnungszeitraum;
  const zeitraum = z ? `${datumDE(z.von)} bis ${datumDE(z.bis)}` : "[Abrechnungszeitraum]";
  const jahr = s1.abrechnungsjahr ?? "[Jahr]";
  const wohnung = a.meta.wohnung ? `, Wohnung ${a.meta.wohnung}` : "";
  const fehler = punkte.filter((p) => p.status === "abweichung");
  const klaeren = punkte.filter((p) => p.status === "auffaelligkeit");

  const zeilen = [
    "Sehr geehrte Damen und Herren,",
    "",
    `zu Ihrer Betriebs- und Heizkostenabrechnung für den Zeitraum ${zeitraum}${a.meta.erstelltAm ? ` vom ${datumDE(a.meta.erstelltAm)}` : ""} habe ich folgende Anmerkungen.`,
  ];
  if (fehler.length) {
    zeilen.push("", "Ich erhebe Einwände gegen folgende Punkte:");
    fehler.forEach((p, i) => zeilen.push(`${i + 1}. ${p.brief}`));
  }
  if (klaeren.length) {
    zeilen.push("", "Zu folgenden Punkten bitte ich um Erläuterung und Einsicht in die zugehörigen Belege:");
    klaeren.forEach((p, i) => zeilen.push(`${i + 1}. ${p.brief}`));
  }
  if (!fehler.length && !klaeren.length) zeilen.push("", "Bitte senden Sie mir die zugehörigen Belege zur Einsicht.");
  zeilen.push(
    "",
    "Bitte prüfen Sie die genannten Punkte und senden Sie mir innerhalb von 14 Tagen eine Stellungnahme bzw. eine korrigierte Abrechnung.",
    "",
    "Mit freundlichen Grüßen",
    "",
    "[Ihr Name]",
    `[Ihre Anschrift${wohnung}]`,
  );
  return { betreff: `Betriebskostenabrechnung ${jahr}${wohnung}: Einwände und Bitte um Belegeinsicht`, text: zeilen.join("\n") };
}

// ---------- Persönliches Anschreiben ----------

/** Angaben für das Anschreiben. Werden nicht im Prüfdatensatz gespeichert. */
export interface Kontakt {
  mieterName?: string;
  mieterAnschrift?: string;
  vermieterName?: string;
  vermieterAnschrift?: string;
  vermieterEmail?: string;
  /** Mieter-, Kunden- oder Vertragsnummer, wie sie die Hausverwaltung verwendet. */
  mieternummer?: string;
}

const sauber = (t?: string) => (t ?? "").replace(/\s+\n/g, "\n").trim();

/** Setzt Name, Anschriften und Mieternummer in die Vorlage ein. Fehlende Angaben bleiben als Platzhalter stehen. */
export function personalisiereAnschreiben(anschreiben: { betreff: string; text: string }, k: Kontakt): { betreff: string; text: string; an?: string } {
  let text = anschreiben.text;
  const name = sauber(k.mieterName), anschrift = sauber(k.mieterAnschrift);
  if (name) text = text.replace("[Ihr Name]", name);
  if (anschrift) text = text.replace(/\[Ihre Anschrift[^\]]*\]/, anschrift);
  const empfaenger = [sauber(k.vermieterName), sauber(k.vermieterAnschrift)].filter(Boolean).join("\n");
  if (empfaenger) text = `${empfaenger}\n\n${text}`;
  const nummer = sauber(k.mieternummer);
  const email = sauber(k.vermieterEmail);
  return {
    betreff: nummer ? `${anschreiben.betreff}, Mieternummer ${nummer}` : anschreiben.betreff,
    text,
    an: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
  };
}

// ---------- Fahrplan: konkrete Ergebnisse für die bezahlte Auswertung ----------

export interface Schritt {
  titel: string;
  text: string;
  /** Letzter Tag, ISO-Datum. */
  bis?: string;
}

export interface Fahrplan {
  /** Nachzahlung laut Abrechnung und nach Abzug der eindeutigen Fehler (positiv = Nachzahlung). */
  zahlung?: { laut: number; hoechstens: number; entfaellt: boolean };
  schritte: Schritt[];
  /** Unterlagen, die die Hausverwaltung vorlegen soll. */
  belege: string[];
  /** Steuerlich begünstigte Beträge nach § 35a EStG laut Abrechnung. */
  steuer?: { haushaltsnah: number; handwerker: number; ersparnisBis: number };
  /** Punkte, die sich erst mit dem Mietvertrag prüfen lassen. */
  mietvertragOffen: number;
}

/** Steuerermäßigung nach § 35a EStG: 20 % der Arbeitskosten. Der Betrag laut Abrechnung kann Material enthalten, daher „bis zu“. */
const STEUERSATZ_35A = 0.2;

function belegFuer(e: Regelergebnis, a: Abrechnung): string | undefined {
  const name = e.positionId ? a.kostenpositionen.find((p) => p.id === e.positionId)?.bezeichnung : undefined;
  switch (e.regelId) {
    case "R-01": return name ? `Gesamtkosten und Verteilerschlüssel für „${name}“` : undefined;
    case "R-04": return "Flächenaufstellung für Wohn- und Heizfläche";
    case "R-05": return "Aufstellung der angerechneten Vorauszahlungen";
    case "I-01": case "I-03": return name ? `Rechnungen zu „${name}“` : undefined;
    case "I-04": return "Heizkostenabrechnung des Messdienstes";
    case "I-05": return name ? `Vertrag und Rechnungen zu „${name}“` : "Vertrag und Rechnungen zum Kabel- oder Satellitenanschluss";
    case "I-07": return name ? `Wartungsvertrag und Rechnungen zu „${name}“` : undefined;
    case "I-08": return "Aufteilung der CO₂-Kosten";
    case "P-01": return name && e.status !== "nicht_pruefbar" ? `Rechnungen zu „${name}“` : undefined;
    case "P-03": return "Rechnungen für Energie und Warmwasserbereitung";
  }
  return undefined;
}

/**
 * Leitet aus dem Prüfergebnis die konkreten nächsten Schritte ab.
 * Fachlich vom Expertenteam zu bestätigen (insbesondere Zahlungs- und Zurückbehaltungshinweise).
 */
export function erstelleFahrplan(s1: Stufe1, punkte: Auffaelligkeit[], bericht: Pruefbericht, a: Abrechnung): Fahrplan {
  const saldo = s1.kosten.saldo;
  const { sicher, zuKlaeren } = s1.fehlerpotenzial;
  const entfaellt = punkte.some((p) => (p.regelId === "F-02" || p.regelId === "F-05") && p.status === "abweichung");
  const beanstandet = punkte.filter((p) => p.status !== "nicht_pruefbar");
  const f = s1.widerspruchsfrist;
  const schritte: Schritt[] = [];

  const zahlung = saldo !== undefined && saldo > 0 ? { laut: saldo, hoechstens: entfaellt ? 0 : runde(Math.max(0, saldo - sicher)), entfaellt } : undefined;

  if (zahlung?.entfaellt) {
    schritte.push({ titel: "Nachzahlung nicht bezahlen", text: `Die ${euro(zahlung.laut)} schulden Sie nicht. Das teilen Sie mit dem Schreiben mit.` });
  } else if (zahlung && sicher > 0) {
    schritte.push({
      titel: `Höchstens ${euro(zahlung.hoechstens)} statt ${euro(zahlung.laut)} zahlen`,
      text: `Die ${euro(sicher)} aus eindeutigen Fehlern ziehen Sie ab.${zuKlaeren > 0 ? " Den Rest erst zahlen, wenn die offenen Punkte geklärt sind." : ""}`,
    });
  } else if (zahlung && zuKlaeren > 0) {
    schritte.push({ titel: "Nachzahlung noch nicht bezahlen", text: "Warten Sie mit der Zahlung, bis die Hausverwaltung die Punkte geklärt und Ihnen die Belege gezeigt hat." });
  }

  if (beanstandet.length || entfaellt) {
    schritte.push({
      titel: "Schreiben an die Hausverwaltung senden",
      text: "Das Schreiben ist fertig vorbereitet. Per E-Mail oder als Brief, am besten mit Nachweis.",
      bis: f.status === "offen" ? f.bis : undefined,
    });
  }

  const belege = [...new Set(bericht.ergebnisse.filter((e) => e.status === "abweichung" || e.status === "auffaelligkeit").map((e) => belegFuer(e, a)).filter((b): b is string => !!b))];
  if (belege.length) schritte.push({ titel: "Belege einsehen", text: `Die Hausverwaltung muss Ihnen ${belege.length === 1 ? "eine Unterlage" : `${belege.length} Unterlagen`} zeigen. Wir haben sie im Schreiben angefordert.` });

  if (beanstandet.length || entfaellt) {
    schritte.push({ titel: "Antwort abwarten", text: "Die Hausverwaltung hat 14 Tage Zeit. Kommt keine Antwort oder eine Ablehnung, übernehmen unsere Experten." });
  }

  const mietvertragOffen = a.mietvertrag ? 0 : punkte.filter((p) => p.status === "nicht_pruefbar" && (p.regelId === "I-02" || p.regelId === "I-06")).length;
  if (mietvertragOffen) schritte.push({ titel: "Mietvertrag hochladen", text: `Damit prüfen wir ${mietvertragOffen === 1 ? "einen weiteren Punkt" : `${mietvertragOffen} weitere Punkte`}.` });

  const summe = (art: "haushaltsnah" | "handwerker") => runde(a.kostenpositionen.filter((p) => p.steuerlich35a === art).reduce((x, p) => x + p.anteilMieter, 0));
  const haushaltsnah = summe("haushaltsnah"), handwerker = summe("handwerker");
  const steuer = haushaltsnah + handwerker > 0 ? { haushaltsnah, handwerker, ersparnisBis: runde((haushaltsnah + handwerker) * STEUERSATZ_35A) } : undefined;
  if (steuer) schritte.push({ titel: "Steuern sparen", text: `${euro(haushaltsnah + handwerker)} aus Ihrer Abrechnung sind steuerlich begünstigt. Das senkt Ihre Steuer um bis zu ${euro(steuer.ersparnisBis)}.` });

  return { zahlung, schritte, belege, steuer, mietvertragOffen };
}
