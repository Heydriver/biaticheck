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

  return {
    regelwerkVersion: bericht.regelwerkVersion,
    geprueftAm: bericht.geprueftAm,
    abrechnungsjahr: zeitraum ? Number(zeitraum.bis.slice(0, 4)) : undefined,
    fehlerpotenzial: { sicher: z.einsparpotenzial, zuKlaeren: z.klaerungspotenzial, anzahl: { ...z.anzahl } },
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
}

export interface Stufe2 {
  auffaelligkeiten: Auffaelligkeit[];
  /** Weitere Rückfragen, die die Prüfung vervollständigen. */
  rueckfragen: { feld: string; frage: string; typ: Antworttyp }[];
  /** Zusammenfassung in ganzen Sätzen – ohne Aufzählungszeichen, Hervorhebungen oder Symbole. */
  zusammenfassung: string[];
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
      };
    });

  return {
    auffaelligkeiten,
    rueckfragen: bericht.zusammenfassung.rueckfragen
      .filter((r) => !STUFE1_FELDER.has(r.feld))
      .map((r) => ({ feld: r.feld, frage: r.frage, typ: antworttyp(r.feld)! })),
    zusammenfassung: erstelleZusammenfassung(stufe1, auffaelligkeiten),
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
    fehler.forEach((p, i) => zeilen.push(`${i + 1}. ${p.titel}${p.betrag ? ` (${euro(p.betrag)})` : ""}`));
  }
  if (klaeren.length) {
    zeilen.push("", "Zu folgenden Punkten bitte ich um Erläuterung und Einsicht in die zugehörigen Belege:");
    klaeren.forEach((p, i) => zeilen.push(`${i + 1}. ${p.titel}`));
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
