import { antworttyp, type Antworttyp } from "./antworten";
import { datumDE, euro, monateZwischen, plusMonate, runde, tageInklusive, vergleiche, zahlDE } from "./hilfen";
import { ALLE_REGELN, type Pruefbericht } from "./pruefung";
import { einordnung, istBeanstandet, UNTERLAGEN, type Einordnung, type Regelergebnis, type Status, type Unterlage } from "./regel";
import { Abrechnung, KOSTENKATEGORIEN, NICHT_UMLAGEFAEHIG, type AbrechnungEingabe, type Kostenkategorie } from "./schema";
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
    "Tragen Sie die Summe Ihrer Vorauszahlungen im Abrechnungszeitraum ein.",
  "I-02:nicht_pruefbar":
    "Sehen Sie in Ihrem Mietvertrag nach, ob diese Kostenart ausdrücklich als sonstige Betriebskosten vereinbart ist. Ist sie dort nicht genannt, fordern Sie die Streichung der Position.",
  "I-04:nicht_pruefbar":
    "Fordern Sie beim Vermieter die Einzelabrechnung des Messdienstes (Heizkostenabrechnung) an. Ohne sie lassen sich Heiz- und Warmwasserkosten nicht prüfen.",
  "I-06:nicht_pruefbar":
    "Prüfen Sie, ob Ihr Mietvertrag Erdgeschosswohnungen von den Aufzugskosten ausnimmt. Erreichen Sie über den Aufzug weder Keller noch Tiefgarage, sprechen Sie die Hausverwaltung darauf an.",
  "P-01:nicht_pruefbar":
    "Legen Sie die Abrechnung des Vorjahres bereit. Mit ihr erkennen wir ungewöhnliche Kostensteigerungen einzelner Positionen.",
  "R-05:pruefbedarf":
    "Laden Sie die Abrechnung des Vorjahres hoch. Dann prüfen wir, ob wirklich Zahlungen fehlen.",
  "P-02:nicht_pruefbar": "Tragen Sie die Wohnfläche laut Mietvertrag ein, damit wir Ihre Kosten mit üblichen Werten vergleichen können.",
};

export function loesungsvorschlag(e: Regelergebnis): string | undefined {
  if (e.status === "ok") return undefined;
  return e.naechsterSchritt ?? LOESUNGSVORSCHLAEGE[`${e.regelId}:${e.status}`];
}

// ---------- Stufe 1 ----------

export type Fehlerstufe = "hoch" | "gering" | "pruefbedarf" | "keins";

/** Anzeige der Einstufung für den Kunden. */
export const FEHLERSTUFE_TEXT: Readonly<Record<Fehlerstufe, string>> = { hoch: "hoch", gering: "gering", pruefbedarf: "Prüfbedarf", keins: "kein Fehler erkannt" };

/** Ab diesem sicher belegten Betrag gilt das Fehlerpotenzial als hoch (vom Expertenteam zu bestätigen). */
export const FEHLERPOTENZIAL_HOCH_AB = 30;

/**
 * Einstufung des Fehlerpotenzials:
 * 1. Belegter Fehler gefunden → "hoch" (sicher ≥ 30 €) oder "gering".
 * 2. Kein belegter Fehler, aber es fehlen noch Unterlagen → "pruefbedarf".
 * 3. Nur Punkte zum Klären, keine Unterlage offen → "gering".
 * 4. Nichts gefunden → "keins" (Anzeige: „kein Fehler erkannt“).
 */
export function fehlerstufe(e: { fehler: number; sicher: number; klaeren: number; unterlagenOffen: number }): Fehlerstufe {
  if (e.fehler > 0) return e.sicher >= FEHLERPOTENZIAL_HOCH_AB ? "hoch" : "gering";
  if (e.unterlagenOffen > 0) return "pruefbedarf";
  if (e.klaeren > 0) return "gering";
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
    /** Mögliche Fehler, die erst nach weiteren Unterlagen sicher sind (nicht im Potenzial enthalten). */
    pruefbedarf: { anzahl: number; betrag: number; /** Punkte, deren Auswirkung noch nicht bezifferbar ist. */ ohneBetrag: number };
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
    /** Ergebnis nach Abzug der belegten Fehler (nur wenn es belegte Fehler gibt). Positiv = Nachzahlung. */
    korrigierterSaldo?: number;
  };
  vergleich: KostenvergleichErgebnis;
  /**
   * Kurze Erklärung zu jedem berechneten Wert – erscheint, wenn der Kunde den Wert anklickt.
   * Ein bis zwei einfache Sätze mit den Zahlen, aus denen der Wert entsteht.
   */
  erklaerungen: { betrag: string; stufe: string; saldo?: string; korrigiert?: string; frist?: string; vergleich?: string };
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

  // ---------- Erklärungen zu den berechneten Werten ----------
  const liste = (status: Status) => {
    const punkte = bericht.ergebnisse.filter((e) => e.status === status && e.betragZugunstenMieter && e.betragZugunstenMieter > 0).sort((x, y) => y.betragZugunstenMieter! - x.betragZugunstenMieter!);
    const gezeigt = punkte.slice(0, 4).map((e) => `${kurzfassung(e, a).titel} ${euro(e.betragZugunstenMieter!)}`);
    return gezeigt.join(" + ") + (punkte.length > 4 ? ` + ${punkte.length - 4} weitere` : "");
  };
  const stufe = fehlerstufe({ fehler: z.anzahl.abweichung, sicher: z.einsparpotenzial, klaeren: z.anzahl.auffaelligkeit, unterlagenOffen: z.anzahl.pruefbedarf });
  const summe = a.ausgewiesen.summeKostenMieter;
  const saldo = a.ausgewiesen.saldo;
  const v = vergleicheKosten(a, optionen.regional);
  const zeitraumV = a.meta.nutzungszeitraum ?? a.meta.abrechnungszeitraum;
  const erklaerungen: Stufe1["erklaerungen"] = {
    betrag:
      z.einsparpotenzial > 0
        ? `Das ist die Summe der belegten Fehler: ${liste("abweichung")} = ${euro(z.einsparpotenzial)}. Punkte mit Prüfbedarf zählen hier nicht mit.`
        : z.klaerungspotenzial > 0
          ? `Das ist die Summe der Beträge, die nach Klärung wegfallen können: ${liste("auffaelligkeit")} = ${euro(z.klaerungspotenzial)}. Sicher ist dieser Betrag noch nicht.`
          : "Wir haben keinen Betrag gefunden, der falsch abgerechnet ist.",
    stufe:
      stufe === "hoch"
        ? `Wir haben belegte Fehler über zusammen ${euro(z.einsparpotenzial)} gefunden. Ab ${euro(FEHLERPOTENZIAL_HOCH_AB)} stufen wir das Fehlerpotenzial als hoch ein.`
        : stufe === "gering"
          ? z.anzahl.abweichung > 0
            ? `Wir haben belegte Fehler über zusammen ${euro(z.einsparpotenzial)} gefunden. Unter ${euro(FEHLERPOTENZIAL_HOCH_AB)} stufen wir das Fehlerpotenzial als gering ein.`
            : "Wir haben keinen belegten Fehler gefunden, aber Punkte, die Sie klären sollten."
          : stufe === "pruefbedarf"
            ? `Wir haben keinen belegten Fehler gefunden. Für ${z.anzahl.pruefbedarf === 1 ? "einen Punkt" : `${z.anzahl.pruefbedarf} Punkte`} fehlt noch eine Unterlage. Erst damit können wir sicher prüfen.`
            : `Alle ${ALLE_REGELN.length} Prüfregeln sind ohne Fehler durchgelaufen.`,
    ...(saldo !== undefined && summe !== undefined && a.vorauszahlungen !== undefined
      ? { saldo: `So steht es in Ihrer Abrechnung: Ihre Kosten ${euro(summe)} minus Ihre Vorauszahlungen ${euro(a.vorauszahlungen)} = ${euro(Math.abs(saldo))} ${saldo >= 0 ? "Nachzahlung" : "Guthaben"}.` }
      : saldo !== undefined
        ? { saldo: "Diesen Betrag weist Ihre Abrechnung als Ergebnis aus." }
        : {}),
    ...(saldo !== undefined && z.einsparpotenzial > 0
      ? { korrigiert: `${saldo >= 0 ? "Nachzahlung" : "Guthaben"} laut Abrechnung ${euro(Math.abs(saldo))}, ${saldo >= 0 ? "minus" : "plus"} belegte Fehler ${euro(z.einsparpotenzial)} = ${runde(saldo - z.einsparpotenzial) === 0 ? "0,00 €. Es bleibt nichts zu zahlen" : `${euro(Math.abs(runde(saldo - z.einsparpotenzial)))} ${saldo - z.einsparpotenzial > 0 ? "Nachzahlung" : "Guthaben"}`}.` }
      : {}),
    ...(zugang ? { frist: `Einwände sind bis 12 Monate nach Erhalt der Abrechnung möglich. Sie haben sie am ${datumDE(zugang)} erhalten, also bis ${datumDE(plusMonate(zugang, 12))}.` } : {}),
    ...(v.ok && v.vergleich.gesamt.durchschnitt !== undefined && a.flaechen.wohnflaecheMieter && zeitraumV
      ? {
          vergleich:
            `Ihre Kosten ${euro(runde(betriebskosten + (heizkosten ?? 0)))} geteilt durch ${zahlDE(a.flaechen.wohnflaecheMieter)} m² und ${zahlDE(monateZwischen(zeitraumV.von, zeitraumV.bis), 1)} Monate = ${zahlDE(v.vergleich.gesamt.ihr)} € je m² im Monat. ` +
            `Der Durchschnitt liegt bei ${zahlDE(v.vergleich.gesamt.durchschnitt)} €. Das ist ein Unterschied von ${Math.abs(v.vergleich.gesamt.abweichungProzent ?? 0)} %.`,
        }
      : {}),
  };

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
      stufe,
      pruefbedarf: { anzahl: z.anzahl.pruefbedarf, betrag: z.pruefbedarfBetrag, ohneBetrag: z.pruefbedarfOhneBetrag },
    },
    widerspruchsfrist: { ...widerspruch, abrechnungsfrist },
    kosten: {
      betriebskosten,
      heizkosten,
      vorauszahlungen: a.vorauszahlungen,
      saldo: a.ausgewiesen.saldo,
      ...(a.ausgewiesen.saldo !== undefined && z.einsparpotenzial > 0 ? { korrigierterSaldo: runde(a.ausgewiesen.saldo - z.einsparpotenzial) } : {}),
    },
    vergleich: v,
    erklaerungen,
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
  /** Einordnung für den Kunden: belegter Fehler, begründeter Prüfbedarf, Hinweis, Vergleich oder offene Frage. */
  einordnung: Einordnung;
  /** Abgerechneter Kostenanteil, der möglicherweise betroffen ist – kein Einsparpotenzial. */
  betroffen?: number;
  /** Wörtliche Textstelle aus der Abrechnung, die den Befund trägt. */
  textstelle?: string;
  titel: string;
  befund: string;
  loesung: string;
  betrag?: number;
  grundlage: string;
  /** Formulierung für das Anschreiben an die Hausverwaltung (sachlich, an den Vermieter gerichtet). */
  brief: string;
  /** Kurzfassung für den Kunden: kurzer Titel und ein Satz, ohne Fachsprache. */
  kurz: { titel: string; satz: string };
  /** Bei Prüfbedarf: Unterlagen, mit denen der Punkt sicher geprüft werden kann (eine genügt). */
  unterlagen?: Unterlage[];
  /** Bei Prüfbedarf: Frage an den Kunden, die den Punkt klärt. */
  rueckfrage?: { feld: string; frage: string; typ: Antworttyp };
  /** Nachvollziehbare Zahlen: was in der Abrechnung steht, was richtig wäre, Differenz. */
  fakten: Fakt[];
  /** Wo der Kunde den Punkt in seiner Abrechnung findet, z. B. „Seite 5“. */
  fundstelle?: string;
}

/** Eine Zeile mit konkreten Zahlen zu einem Befund. */
export interface Fakt {
  label: string;
  wert: string;
  /** Ergebniszeile (Differenz, Betrag zu Ihren Gunsten) hervorheben. */
  betont?: boolean;
}

/** Eine angeforderte Unterlage mit den Punkten, die sie klärt. */
export interface Unterlagenanforderung {
  /** Alternativen – eine davon genügt. */
  arten: Unterlage[];
  titel: string;
  grund: string;
}

/** Die eine Empfehlung, die der Kunde zuerst sieht. */
export interface Empfehlung {
  titel: string;
  text: string;
  /** Hauptknopf: Schreiben an die Hausverwaltung, Expertenberatung oder nichts zu tun. */
  aktion: "schreiben" | "beratung" | "unterlagen" | "keine";
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
  /** Unterlagen, die das Tool nachfordert, bevor es mögliche Fehler als sicher ausweist. */
  unterlagen: Unterlagenanforderung[];
}

const REIHENFOLGE: Record<Exclude<Status, "ok">, number> = { abweichung: 0, auffaelligkeit: 1, pruefbedarf: 2, hinweis: 3, nicht_pruefbar: 4 };

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
        einordnung: einordnung(e.status, e.bereich, e.art),
        ...(e.betroffen !== undefined && !(e.betragZugunstenMieter && e.betragZugunstenMieter > 0) ? { betroffen: e.betroffen } : {}),
        ...(e.textstelle ? { textstelle: e.textstelle } : {}),
        titel: e.titel,
        befund: e.erklaerung,
        loesung,
        betrag: e.betragZugunstenMieter !== undefined && e.betragZugunstenMieter > 0 ? e.betragZugunstenMieter : undefined,
        grundlage: GRUNDLAGEN.get(e.regelId) ?? "",
        brief: briefpunkt(e, a),
        kurz: kurzfassung(e, a),
        fakten: fakten(e, a),
        ...fundstelleVon(e, a),
        ...(e.unterlagen?.length ? { unterlagen: e.unterlagen } : {}),
        ...(e.status === "pruefbedarf" && e.rueckfrage && antworttyp(e.rueckfrage.feld)
          ? { rueckfrage: { feld: e.rueckfrage.feld, frage: e.rueckfrage.frage, typ: antworttyp(e.rueckfrage.feld)! } }
          : {}),
      };
    });

  return {
    auffaelligkeiten,
    rueckfragen: bericht.zusammenfassung.rueckfragen
      .filter((r) => !STUFE1_FELDER.has(r.feld))
      .map((r) => ({ feld: r.feld, frage: r.frage, typ: antworttyp(r.feld)! })),
    zusammenfassung: erstelleZusammenfassung(stufe1, auffaelligkeiten),
    empfehlung: erstelleEmpfehlung(stufe1, auffaelligkeiten),
    unterlagen: sammleUnterlagen(auffaelligkeiten),
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
  // Hinweise und Vergleichswerte sind keine Einwände gegen die Abrechnung
  if (p.status === "hinweis" || p.einordnung === "vergleich") return false;
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

  const klaeren = n.auffaelligkeit + n.pruefbedarf;
  const teile = [
    n.abweichung ? `${n.abweichung} belegte${n.abweichung === 1 ? "n" : ""} Fehler` : "",
    klaeren ? `${klaeren} ${klaeren === 1 ? "Punkt" : "Punkte"} mit begründetem Prüfbedarf` : "",
  ].filter(Boolean);
  const zusatz = [
    n.hinweis ? `${n.hinweis} ${n.hinweis === 1 ? "Hinweis" : "Hinweise"} ohne Fehlerverdacht` : "",
    n.nicht_pruefbar ? `${n.nicht_pruefbar} ${n.nicht_pruefbar === 1 ? "offene Frage" : "offene Fragen"}` : "",
  ].filter(Boolean);
  const und = (xs: string[]) => xs.join(", ").replace(/, ([^,]*)$/, " und $1");
  saetze.push(
    teile.length
      ? `Wir haben Ihre Abrechnung${jahr} anhand von ${ALLE_REGELN.length} Prüfregeln untersucht und dabei ${und(teile)} festgestellt.`
      : `Wir haben Ihre Abrechnung${jahr} anhand von ${ALLE_REGELN.length} Prüfregeln untersucht und keine Fehler festgestellt.`,
  );
  if (zusatz.length) saetze.push(`Außerdem gibt es ${und(zusatz)}.`);

  const { sicher, zuKlaeren } = s1.fehlerpotenzial;
  if (sicher > 0) saetze.push(`Sicher bezifferbar ist ein Einsparpotenzial von ${euro(sicher)}.`);
  if (zuKlaeren > 0) saetze.push(`Weitere ${euro(zuKlaeren)} können sich nach Klärung mit dem Vermieter als Ersparnis erweisen.`);
  const ohne = punkte.filter((p) => (p.status === "auffaelligkeit" || p.status === "pruefbedarf") && p.betrag === undefined).length;
  if (ohne) saetze.push(`Bei ${ohne === 1 ? "einem Punkt" : `${ohne} Punkten`} ist die Auswirkung noch nicht bezifferbar.`);

  if (s1.vergleich.ok) {
    const g = s1.vergleich.vergleich.gesamt;
    if (g.abweichungProzent !== undefined && g.durchschnitt !== undefined) {
      const richtung = g.abweichungProzent > 0 ? `${g.abweichungProzent} % über` : g.abweichungProzent < 0 ? `${-g.abweichungProzent} % unter` : "genau im";
      const v = s1.vergleich.vergleich;
      saetze.push(
        `${v.bezeichnung}: Ihre Kosten liegen mit ${zahlDE(g.ihr)} € je m² und Monat ${richtung} dem Durchschnitt von ${zahlDE(g.durchschnitt)} € (${v.quelle}). Das ist eine statistische Einordnung und kein Nachweis eines Fehlers.`,
      );
    }
  }

  const wichtigster = punkte.find((p) => istBeanstandet(p.status));
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
  const beanstandet = punkte.filter((p) => istBeanstandet(p.status));
  const fehlerAnz = beanstandet.filter((p) => p.status === "abweichung").length;
  const klaerAnz = beanstandet.length - fehlerAnz;
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
  const pruefbedarf = punkte.filter((p) => p.status === "pruefbedarf");
  if (!beanstandet.length && pruefbedarf.length)
    return {
      titel: "Wir brauchen noch eine Unterlage",
      text: "Ein möglicher Fehler lässt sich erst mit weiteren Unterlagen sicher prüfen. Laden Sie sie hoch, dann wissen Sie, ob sich ein Schreiben lohnt.",
      aktion: "unterlagen",
    };
  if (beanstandet.length)
    return {
      titel: "Schicken Sie das vorbereitete Schreiben an Ihre Hausverwaltung",
      text: `Darin ${[
        fehlerAnz ? `fordern wir die Korrektur von ${fehlerAnz === 1 ? "einem belegten Fehler" : `${fehlerAnz} belegten Fehlern`}` : "",
        klaerAnz ? `${fehlerAnz ? "bitten" : "bitten wir"} um Klärung von ${klaerAnz === 1 ? "einem Punkt" : `${klaerAnz} Punkten`}` : "",
      ]
        .filter(Boolean)
        .join(" und ")}.${frist}`,
      aktion: "schreiben",
    };
  if (punkte.some((p) => p.status === "nicht_pruefbar" && p.regelId !== "P-02"))
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
      if (s === "pruefbedarf")
        return k("Abrechnung möglicherweise zu spät", `Dann müssten Sie ${euro(zahl(b.saldo) ?? 0)} nicht zahlen. Das bestätigen wir mit Ihrer Vorjahresabrechnung.`);
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
      if (typeof b.leerstand === "string" && zahl(b.nenner) !== undefined)
        return k(`Leerstand herausgerechnet: ${name}`, `Verteilt auf ${zahlDE(zahl(b.nenner)!)} statt ${zahlDE(zahl(b.hausflaeche)!)} m². Leerstand trägt der Vermieter.`);
      if (zahl(b.nenner) !== undefined && zahl(b.hausflaeche) !== undefined)
        return s === "abweichung"
          ? k(`Falsche Gesamtfläche: ${name}`, `Verteilt auf ${zahlDE(zahl(b.nenner)!)} statt ${zahlDE(zahl(b.hausflaeche)!)} m². Ihr Anteil ist zu hoch.`)
          : k(`Kleinere Gesamtfläche: ${name}`, `Verteilt auf ${zahlDE(zahl(b.nenner)!)} statt ${zahlDE(zahl(b.hausflaeche)!)} m². Der Grund muss erklärt werden.`);
      return k("Unterschiedliche Flächen", "Für Ihre Wohnung werden verschiedene Größen angesetzt.");
    case "R-05": {
      const art = b.art === "heizkosten" ? "Heizkosten" : b.art === "gesamt" ? "insgesamt" : "Betriebskosten";
      if (s === "abweichung" && b.quelle === "dokument")
        return k(`Vorauszahlungen ${art} unvollständig angerechnet`, `Die Abrechnung belegt selbst ${euro(zahl(b.summe) ?? 0)}, angerechnet wurden nur ${euro(zahl(b.jahr) ?? 0)}.`);
      if (s === "pruefbedarf")
        return k(`Vorauszahlungen ${art}: Prüfbedarf`, `Möglich sind bis zu ${euro(zahl(b.differenz) ?? 0)}. Dafür brauchen wir Ihre Vorjahresabrechnung.`);
      if (s === "abweichung" && zahl(b.summe) !== undefined)
        return k(`Vorauszahlungen ${art} zu niedrig angerechnet`, `Gezahlt haben Sie ${euro(zahl(b.summe)!)}, angerechnet wurden nur ${euro(zahl(b.jahr) ?? 0)}.`);
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
    case "I-17":
      if (s === "abweichung") return b.ganzePosition === true ? k(`Versicherung nicht umlagefähig: ${name}`, "Nur Sach- und Haftpflichtversicherungen für das Gebäude dürfen umgelegt werden.") : k(`Rechtsschutz oder Ähnliches in „${name}“`, "Dieser Versicherungsanteil darf nicht umgelegt werden.");
      return k(`Versicherung: „${name}“`, "Enthält eine nicht umlagefähige Versicherung. Auswirkung noch nicht bezifferbar.");
    case "I-16":
      return s === "abweichung" ? k("Leistung doppelt berechnet", "Zwei Positionen beziehen sich auf dieselbe Rechnung. Eine davon ist zu streichen.") : k("Leistung doppelt berechnet?", "Zwei Positionen derselben Kostenart haben genau dieselben Beträge.");
    case "R-09":
      if (b.art === "fremdes_objekt") return k("Rechnung eines anderen Hauses umgelegt", "Der Beleg betrifft ein anderes Objekt und darf nicht umgelegt werden.");
      if (b.art === "gutschrift") return s === "abweichung" ? k("Gutschrift nicht abgezogen", `Eine Gutschrift über ${euro(zahl(b.belegBetrag) ?? 0)} für das Haus fehlt in der Abrechnung.`) : k("Gutschrift abgezogen?", "Ob die Gutschrift berücksichtigt wurde, ist nicht erkennbar.");
      return zahl(b.umsatzsteuerProzent) !== undefined
        ? k("Umsatzsteuer doppelt aufgeschlagen", `Rechnung ${euro(zahl(b.belegBetrag) ?? 0)}, übernommen ${euro(zahl(b.uebernommen) ?? 0)}.`)
        : k("Mehr übernommen als im Beleg", `Rechnung ${euro(zahl(b.belegBetrag) ?? 0)}, übernommen ${euro(zahl(b.uebernommen) ?? 0)}.`);
    case "R-08":
      if (zahl(b.faktorLautProtokoll) !== undefined || !e.positionId || e.titel.includes("Wärme"))
        return k(e.titel, `Gemessen ${zahlDE(zahl(b.verbrauchZaehler) ?? 0)}, abgerechnet ${zahlDE(zahl(b.verbrauchAbgerechnet) ?? 0)}.`);
      return k(`Verbrauch falsch übertragen: ${name}`, `Laut Zähler ${zahlDE(zahl(b.verbrauchZaehler) ?? 0)} m³, abgerechnet ${zahlDE(zahl(b.verbrauchAbgerechnet) ?? 0)} m³.`);
    case "I-07":
      if (s === "abweichung" && b.ganzePosition === true) return k(`Reparaturkosten umgelegt: ${name}`, "Laut Leistungsnachweis sind das Reparaturen. Sie dürfen nicht umgelegt werden.");
      if (s === "abweichung") return k(`Reparaturen in „${name}“`, "Der ausgewiesene Reparaturanteil darf nicht umgelegt werden.");
      return e.titel.startsWith("Vollwartung")
        ? k(`Vollwartung: „${name}“`, "Der Reparaturanteil ist nicht ausgewiesen. Auswirkung noch nicht bezifferbar.")
        : k(`Reparaturen in „${name}“?`, "Die Bezeichnung nennt Reparaturen. Auswirkung noch nicht bezifferbar.");
    case "I-08":
      return k("CO₂-Kosten falsch verteilt", "Einen Teil davon muss der Vermieter selbst tragen.");
    case "I-09":
      if (s === "nicht_pruefbar") return k("Wasserzähler in der Wohnung?", "Davon hängt ab, ob Frischwasser nach Verbrauch abgerechnet werden muss.");
      if (s === "hinweis") return k(`Inhalt unklar: ${name}`, "Die Position kann verschiedene Wasserkosten zusammenfassen.");
      return k("Wasser nicht nach Verbrauch abgerechnet", "Wird der Verbrauch aller Wohnungen erfasst, muss danach abgerechnet werden.");
    case "I-15":
      return k("Niederschlagswasser doppelt?", "Die Gebühr für Regenwasser darf nur einmal umgelegt werden.");
    case "I-10":
      return s === "abweichung" ? k("Rauchwarnmelder: Miete umgelegt", "Die Miete der Geräte darf nicht umgelegt werden, die Wartung schon.") : k("Rauchwarnmelder: Miete enthalten", "Nur die Wartung ist erlaubt. Auswirkung noch nicht bezifferbar.");
    case "I-11":
      if (s === "abweichung") return k("Verwaltung im Hauswart enthalten", "Der ausgewiesene Anteil für Verwaltung oder Reparaturen darf nicht umgelegt werden.");
      return s === "hinweis"
        ? k("Hauswart teurer als üblich", "Statistischer Vergleich, kein Fehler. Anlass für die Belegeinsicht.")
        : k("Hauswart: Reparaturen enthalten?", "Reparatur- und Verwaltungsarbeiten müssen herausgerechnet werden.");
    case "R-06":
      return k("Ein- oder Auszug nicht berücksichtigt", "Sie zahlen Kosten für Tage, an denen Sie dort nicht gewohnt haben.");
    case "R-07":
      return k("Mehr Fläche als im Mietvertrag", "Nach Fläche verteilte Kosten sind dadurch zu hoch.");
    case "I-12":
      return s === "nicht_pruefbar" ? k("Gewerbe im Haus?", "Dann müssen dessen höhere Kosten vorab abgezogen werden.") : k("Kein Abzug für Gewerbe", "Kosten des Gewerbes zahlen sonst die Mieter mit.");
    case "I-13":
      return k("Leere Wohnungen nicht mitgezählt?", "Den Anteil leerer Wohnungen trägt der Vermieter.");
    case "I-14":
      return k("Grundsteuer stark verändert", "Seit 2025 gilt ein neuer Bescheid. Er muss zur Abrechnung passen.");
    case "P-01":
      if (s === "nicht_pruefbar") return k("Vorjahresabrechnung fehlt", "Mit ihr erkennen wir ungewöhnliche Preissprünge.");
      return e.titel.startsWith("Neue") ? k(`Neu: ${name}`, "Diese Kosten gab es im Vorjahr nicht.") : k(`Stark gestiegen: ${name}`, "Deutlich teurer als im Vorjahr. Das ist für sich kein Fehler.");
    case "P-02":
      return s === "nicht_pruefbar" ? k("Wohnfläche fehlt", "Damit vergleichen wir Ihre Kosten mit anderen.") : k("Nebenkosten über dem Bundesdurchschnitt", "Statistischer Vergleich, kein Nachweis eines Fehlers.");
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
      if (zahl(b.nenner) !== undefined && zahl(b.hausflaeche) !== undefined && name)
        return e.status === "abweichung"
          ? `${name}: Die Kosten werden auf ${zahlDE(zahl(b.nenner)!)} m² verteilt, die Abrechnung nennt als Gesamtfläche jedoch ${zahlDE(zahl(b.hausflaeche)!)} m². Mein Anteil beträgt danach ${euro(zahl(b.korrekt)!)} statt ${euro(zahl(b.abgerechnet)!)}${betrag}.`
          : `${name}: Die Kosten werden auf ${zahlDE(zahl(b.nenner)!)} m² statt auf die Gesamtfläche von ${zahlDE(zahl(b.hausflaeche)!)} m² verteilt. Bitte erläutern Sie die kleinere Fläche.`;
      if (zahl(b.heizflaeche) !== undefined && zahl(b.wohnflaeche) !== undefined)
        return `Unterschiedliche Flächen: In der Heizkostenabrechnung werden ${zahlDE(zahl(b.heizflaeche)!)} m² angesetzt, in der Betriebskostenabrechnung ${zahlDE(zahl(b.wohnflaeche)!)} m². Bitte erläutern Sie die Abweichung.`;
      return "Für meine Wohnung werden unterschiedliche Flächen angesetzt. Bitte erläutern Sie die Abweichung.";
    case "R-05":
      if (e.status === "abweichung" && zahl(b.summe) !== undefined && zahl(b.jahr) !== undefined)
        return `Vorauszahlungen für ${b.art === "heizkosten" ? "Heizkosten" : "Betriebskosten"}: Gezahlt habe ich im Abrechnungszeitraum ${euro(zahl(b.summe)!)}, angerechnet wurden nur ${euro(zahl(b.jahr)!)}. Bitte rechnen Sie die fehlenden ${euro(zahl(b.differenz) ?? 0)} an; Zahlungsnachweise liegen bei.`;
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
    case "I-17":
      if (e.status === "abweichung" && name) return `${name}${betrag}: Darin ist eine nicht umlagefähige Versicherung enthalten (${e.textstelle ?? ""}). Nach § 2 Nr. 13 BetrKV sind nur Sach- und Haftpflichtversicherungen für das Gebäude umlagefähig. Bitte ziehen Sie den Betrag ab.`;
      if (name) return `${name}: Bitte legen Sie die Versicherungsscheine und Beitragsrechnungen vor und weisen Sie Anteile für Rechtsschutz-, Mietausfall- oder Hausratversicherung aus.`;
      break;
    case "I-16":
      return e.status === "abweichung"
        ? `${e.titel.replace("Doppelt berechnet: ", "")}: Beide Positionen beziehen sich auf dieselbe Rechnung (${String(b.belegnummer ?? "")}). Bitte streichen Sie eine der beiden Positionen${betrag}.`
        : `${e.titel.replace("Doppelt berechnet: ", "")}: Beide Positionen weisen identische Beträge aus. Bitte legen Sie die Rechnungen zu beiden Positionen vor.`;
    case "R-09":
      return `${e.textstelle ?? e.titel}: ${b.art === "fremdes_objekt" ? "Der Beleg betrifft ein anderes Objekt. Bitte nehmen Sie ihn aus der Abrechnung" : b.art === "gutschrift" ? "Bitte ziehen Sie die Gutschrift von den umgelegten Kosten ab" : "Bitte korrigieren Sie die umgelegten Kosten auf den Betrag laut Beleg"}${betrag}.`;
    case "R-08":
      if (e.titel.includes("Wärme") && e.textstelle) return `${e.textstelle}. Bitte rechnen Sie nach dem gemessenen Verbrauch ab${betrag}.`;
      if (name && zahl(b.verbrauchZaehler) !== undefined)
        return `${name}: Die Zählerstände ergeben ${zahlDE(zahl(b.verbrauchZaehler)!)} m³, abgerechnet wurden ${zahlDE(zahl(b.verbrauchAbgerechnet)!)} m³. Bitte rechnen Sie nach dem Verbrauch laut Zählerständen ab${betrag}.`;
      break;
    case "I-07":
      if (e.status === "abweichung" && b.ganzePosition === true && name) return `${name}${betrag}: Laut Leistungsnachweis handelt es sich um Reparaturen („${e.textstelle ?? ""}“). Diese sind nach § 1 Abs. 2 Nr. 2 BetrKV keine Betriebskosten. Bitte streichen Sie die Position.`;
      if (e.status === "abweichung" && name) return `${name}${betrag}: Der ausgewiesene Reparaturanteil (${e.textstelle ?? "laut Aufstellung"}) ist nach § 1 Abs. 2 Nr. 2 BetrKV nicht umlagefähig. Bitte ziehen Sie ihn ab.`;
      if (name) return `${name}: Bitte legen Sie den Wartungsvertrag und die Rechnungen vor und weisen Sie einen enthaltenen Reparaturanteil aus.`;
      break;
    case "I-09":
      if (e.status === "auffaelligkeit") return "Frisch- und Schmutzwasser werden nicht nach Verbrauch verteilt, obwohl meine Wohnung einen Wasserzähler hat. Bitte teilen Sie mit, ob der Verbrauch aller Wohnungen erfasst wird, und rechnen Sie in diesem Fall nach Verbrauch ab.";
      break;
    case "I-15":
      return "Niederschlagswasser scheint mehrfach umgelegt zu werden. Bitte legen Sie den Gebührenbescheid für die Entwässerung vor.";
    case "I-10":
      if (e.status === "abweichung" && name) return `${name}${betrag}: Mietkosten für Rauchwarnmelder sind nicht als Betriebskosten umlagefähig.`;
      if (name) return `${name}: Bitte legen Sie die Rechnung vor und weisen Sie Miete und Wartung getrennt aus; der Mietanteil ist nicht umlagefähig.`;
      break;
    case "R-06":
      if (typeof b.von === "string" && typeof b.bis === "string")
        return `Ich habe die Wohnung im Abrechnungszeitraum nur vom ${datumDE(b.von)} bis ${datumDE(b.bis)} gemietet. Bitte rechnen Sie die zeitabhängigen Kosten nur für diesen Zeitraum ab${betrag}.`;
      break;
    case "R-07":
      if (zahl(b.vertrag) !== undefined && zahl(b.abrechnung) !== undefined)
        return `Die Abrechnung setzt ${zahlDE(zahl(b.abrechnung)!)} m² an, mein Mietvertrag nennt ${zahlDE(zahl(b.vertrag)!)} m². Bitte begründen Sie die angesetzte Fläche und legen Sie eine Wohnflächenberechnung vor${betrag}.`;
      break;
    case "I-12":
      return "Im Haus gibt es Gewerbe, die Abrechnung enthält aber keinen Vorwegabzug. Bitte legen Sie dar, wie die Kosten des Gewerbes (insbesondere Müll, Wasser und Reinigung) berücksichtigt sind.";
    case "I-13":
      return "Bei den nach Wohnungen verteilten Kosten werden unterschiedlich viele Wohnungen angesetzt. Bitte erläutern Sie das; der Anteil leer stehender Wohnungen ist vom Vermieter zu tragen.";
    case "I-14":
      if (zahl(b.vorher) !== undefined && zahl(b.jetzt) !== undefined)
        return `Grundsteuer: Mein Anteil hat sich von ${euro(zahl(b.vorher)!)} auf ${euro(zahl(b.jetzt)!)} geändert. Bitte legen Sie den aktuellen Grundsteuerbescheid vor.`;
      break;
    case "I-11":
      if (e.status === "abweichung" && name) return `${name}${betrag}: Die Abrechnung weist darin einen Anteil für Verwaltung oder Reparaturen aus (${e.textstelle ?? "laut Aufstellung"}). Dieser Anteil ist nach § 2 Nr. 14 BetrKV nicht umlagefähig. Bitte ziehen Sie ihn ab.`;
      if (name) return `${name}: Bitte legen Sie den Hauswartvertrag mit Leistungsverzeichnis vor und rechnen Sie Anteile für Reparaturen, Verwaltung und Bereitschaft heraus.`;
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
    case "I-09": return "Zählerstände und Verbrauchsaufstellung für Wasser";
    case "I-10": return name ? `Rechnung zu „${name}“ mit Miete und Wartung getrennt` : undefined;
    case "I-11": return name ? `Hauswartvertrag und Leistungsverzeichnis zu „${name}“` : undefined;
    case "R-07": return "Wohnflächenberechnung für Ihre Wohnung";
    case "I-12": return "Aufstellung des Vorwegabzugs für Gewerbe";
    case "I-16": return "Rechnungen zu beiden Positionen";
    case "R-09": return "Originalbelege zu den beanstandeten Rechnungen";
    case "I-17": return name ? `Versicherungsscheine und Beitragsrechnungen zu „${name}“` : undefined;
    case "R-08": return "Ableseprotokoll mit Zählerständen";
    case "I-13": return "Liste der Wohnungen mit Leerstandszeiten";
    case "I-14": return "Grundsteuerbescheid 2025";
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
  const beanstandet = punkte.filter((p) => istBeanstandet(p.status));
  const f = s1.widerspruchsfrist;
  const schritte: Schritt[] = [];
  const nachreichen = sammleUnterlagen(punkte);
  if (nachreichen.length === 1) schritte.push({ titel: `${nachreichen[0]!.titel} hochladen`, text: nachreichen[0]!.grund });
  else if (nachreichen.length > 1) schritte.push({ titel: "Unterlagen hochladen", text: nachreichen.map((u) => `${u.titel}: ${u.grund}`).join(" ") });

  const zahlung = saldo !== undefined && saldo > 0 ? { laut: saldo, hoechstens: entfaellt ? 0 : runde(Math.max(0, saldo - sicher)), entfaellt } : undefined;

  const fristUnsicher = punkte.some((p) => p.regelId === "F-02" && p.status === "pruefbedarf");
  if (zahlung && fristUnsicher) {
    schritte.push({ titel: "Nachzahlung vorerst nicht bezahlen", text: "Möglicherweise kam die Abrechnung zu spät. Warten Sie mit der Zahlung, bis wir das mit Ihrer Vorjahresabrechnung bestätigt haben." });
  } else if (zahlung?.entfaellt) {
    schritte.push({ titel: "Nachzahlung nicht bezahlen", text: `Die ${euro(zahlung.laut)} schulden Sie nicht. Das teilen Sie mit dem Schreiben mit.` });
  } else if (zahlung && sicher > 0) {
    schritte.push({
      titel: `Höchstens ${euro(zahlung.hoechstens)} statt ${euro(zahlung.laut)} zahlen`,
      text: `Die ${euro(sicher)} aus eindeutigen Fehlern ziehen Sie ab.${zuKlaeren > 0 ? " Den Rest erst zahlen, wenn die offenen Punkte geklärt sind." : ""}`,
    });
  } else if (zahlung && zuKlaeren >= 30) {
    schritte.push({ titel: "Nachzahlung noch nicht bezahlen", text: "Warten Sie mit der Zahlung, bis die Hausverwaltung die Punkte geklärt und Ihnen die Belege gezeigt hat." });
  } else if (zahlung && zuKlaeren > 0) {
    schritte.push({
      titel: "Nachzahlung unter Vorbehalt zahlen",
      text: `Die offenen Punkte betreffen nur bis zu ${euro(zuKlaeren)}. Zahlen Sie mit dem Vermerk „unter Vorbehalt“, dann können Sie zu viel Gezahltes zurückfordern.`,
    });
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

// ---------- Unterlagen nachfordern ----------

const GRUND: Partial<Record<string, string>> = {
  "F-02": "Damit bestätigen wir den Abrechnungszeitraum. Davon hängt ab, ob die Frist wirklich versäumt ist und Sie die Nachzahlung nicht zahlen müssen.",
  "R-05": "Damit prüfen wir, ob bei Ihren Vorauszahlungen wirklich Geld fehlt. Ohne diese Unterlage zählen wir den Betrag nicht als Ersparnis.",
};

/** Fasst die Unterlagen aller Punkte mit Prüfbedarf zusammen (gleiche Alternativen nur einmal). */
export function sammleUnterlagen(punkte: Auffaelligkeit[]): Unterlagenanforderung[] {
  const liste = new Map<string, Unterlagenanforderung>();
  for (const p of punkte) {
    if (p.status !== "pruefbedarf" || !p.unterlagen?.length) continue;
    const schluessel = [...p.unterlagen].sort().join("|");
    const grund = GRUND[p.regelId] ?? "Damit können wir diesen Punkt sicher prüfen.";
    const vorhanden = liste.get(schluessel);
    if (vorhanden) {
      // Dieselbe Unterlage klärt mehrere Punkte: Gründe zusammenführen
      if (!vorhanden.grund.includes(grund)) vorhanden.grund = `${vorhanden.grund} ${grund}`;
      continue;
    }
    liste.set(schluessel, { arten: p.unterlagen, titel: p.unterlagen.map((u) => UNTERLAGEN[u]).join(" oder "), grund });
  }
  return [...liste.values()];
}

/**
 * Schließt der Zeitraum der Vorjahresabrechnung lückenlos an den aktuellen an?
 * Erlaubt eine Lücke von höchstens 31 Tagen (z. B. Monatsende/Monatsanfang, Ein- oder Auszug).
 */
export function schliesstAn(vorjahr: { von: string; bis: string }, aktuell: { von: string; bis: string }): boolean {
  const tag = 864e5;
  const ende = Date.parse(vorjahr.bis), beginn = Date.parse(aktuell.von), vjBeginn = Date.parse(vorjahr.von);
  if ([ende, beginn, vjBeginn].some(Number.isNaN) || vjBeginn >= ende) return false;
  const luecke = (beginn - ende) / tag;
  return luecke >= 1 && luecke <= 31;
}

// ---------- Nachvollziehbare Zahlen je Befund ----------

const SCHLUESSEL: Record<string, string> = {
  wohnflaeche: "Wohnfläche",
  personen: "Personen",
  einheiten: "Wohneinheiten",
  verbrauch: "Verbrauch",
  miteigentumsanteil: "Miteigentumsanteil",
  direkt: "direkt zugeordnet",
};

function fundstelleVon(e: Regelergebnis, a: Abrechnung): { fundstelle?: string } {
  const p = e.positionId ? a.kostenpositionen.find((x) => x.id === e.positionId) : undefined;
  return p?.fundstelle?.seite ? { fundstelle: `Seite ${p.fundstelle.seite}` } : {};
}

/**
 * Konkrete Zahlen zu einem Befund – damit der Kunde nachvollziehen kann, woraus das Ergebnis folgt.
 * Nur Werte, die aus der Abrechnung oder der Regel stammen; nichts wird geschätzt, was nicht als Schätzung benannt ist.
 */
export function fakten(e: Regelergebnis, a: Abrechnung): Fakt[] {
  const b = e.beleg ?? {};
  const p = e.positionId ? a.kostenpositionen.find((x) => x.id === e.positionId) : undefined;
  const f: Fakt[] = [];
  const add = (label: string, wert: string | undefined, betont = false) => {
    if (wert !== undefined && wert !== "") f.push(betont ? { label, wert, betont } : { label, wert });
  };
  const eur = (v: unknown) => (zahl(v) !== undefined ? euro(zahl(v)!) : undefined);
  const datum = (v: unknown) => (typeof v === "string" ? datumDE(v) : undefined);
  const position = () => {
    if (!p) return;
    add("Position", p.bezeichnung);
    if (p.gesamtkosten !== undefined) add("Kosten für das ganze Haus", euro(p.gesamtkosten));
    if (p.umlageschluessel) {
      const s = p.umlageschluessel;
      add("Verteilt nach", s.anteilEinheit !== undefined && s.anteilGesamt !== undefined ? `${SCHLUESSEL[s.typ] ?? s.typ}: ${zahlDE(s.anteilEinheit)} von ${zahlDE(s.anteilGesamt)}` : SCHLUESSEL[s.typ] ?? s.typ);
    }
    add("Ihr Anteil", euro(p.anteilMieter));
  };

  switch (e.regelId) {
    case "F-01":
      add("Abrechnungszeitraum", b.von && b.bis ? `${datum(b.von)} bis ${datum(b.bis)}` : undefined);
      add("Erlaubt", "höchstens 12 Monate");
      break;
    case "F-02": {
      const z = (b.zeitraum ?? a.meta.abrechnungszeitraum) as { von: string; bis: string } | undefined;
      add("Abrechnungszeitraum", z ? `${datumDE(z.von)} bis ${datumDE(z.bis)}` : undefined);
      add("Abrechnung musste zugehen bis", datum(b.fristEnde));
      add("Bei Ihnen eingegangen", datum(b.stichtag));
      if (e.status !== "ok" && zahl(b.saldo) !== undefined) add(e.status === "abweichung" ? "Nachzahlung entfällt" : "Nachzahlung, die entfallen könnte", eur(b.saldo), true);
      break;
    }
    case "F-03":
      add("Erhalten am", datum(b.zugang));
      add("Einwände möglich bis", datum(b.fristEnde), true);
      break;
    case "F-04":
      position();
      if (Array.isArray(b.fehlend)) add("Es fehlt", (b.fehlend as string[]).join(", "), true);
      break;
    case "R-01": {
      position();
      add("Richtig wäre", eur(b.erwartet));
      add("Berechnet wurden", eur(b.berechnet));
      if ((zahl(b.differenz) ?? 0) > 0) add("Zu viel berechnet", eur(b.differenz), true);
      break;
    }
    case "R-02":
      add("Ausgewiesene Gesamtsumme", eur(b.ausgewiesen));
      add("Summe der Einzelposten", eur(b.berechnet));
      add("Differenz", eur(Math.abs(zahl(b.differenz) ?? 0)), true);
      break;
    case "R-03":
      add("Ihre Kosten", eur(b.kosten));
      add("Ihre Vorauszahlungen", eur(b.vorauszahlungen));
      add("Richtig wäre", eur(b.erwartet));
      add("Ausgewiesen", eur(b.ausgewiesen));
      if (zahl(b.differenz) !== undefined) add("Differenz", eur(Math.abs(zahl(b.differenz)!)), true);
      break;
    case "R-04": {
      const h = zahl(b.heizflaeche), w = zahl(b.wohnflaeche);
      if (zahl(b.nenner) !== undefined && zahl(b.hausflaeche) !== undefined) {
        position();
        add("Gesamtfläche laut Abrechnung", `${zahlDE(zahl(b.hausflaeche)!)} m²`);
        add("Verwendeter Flächennenner", `${zahlDE(zahl(b.nenner)!)} m²`, true);
        add("Richtig berechnet", `${eur(b.gesamtkosten)} × ${zahlDE(zahl(b.einheit)!)} / ${zahlDE(zahl(b.hausflaeche)!)} m² = ${eur(b.korrekt)}`);
        if (e.betragZugunstenMieter) add(e.status === "abweichung" ? "Zu viel berechnet" : "Möglicherweise zu viel", e.status === "abweichung" ? euro(e.betragZugunstenMieter) : `bis zu ${euro(e.betragZugunstenMieter)}`, true);
      } else if (h !== undefined && w !== undefined) {
        add("Fläche in der Heizkostenabrechnung", `${zahlDE(h)} m²`);
        add("Fläche in der Betriebskostenabrechnung", `${zahlDE(w)} m²`);
        add("Unterschied", `${zahlDE(Math.abs(w - h))} m² (${zahlDE((Math.abs(w - h) / w) * 100, 1)} %)`, true);
      } else if (Array.isArray(b.wohnflaechen)) add("Verwendete Wohnflächen", (b.wohnflaechen as number[]).map((x) => `${zahlDE(x)} m²`).join(", "), true);
      else if (Array.isArray(b.gesamtflaechen)) add("Verwendete Gesamtflächen", (b.gesamtflaechen as number[]).map((x) => `${zahlDE(x)} m²`).join(", "), true);
      break;
    }
    case "R-05": {
      add("Angerechnete Vorauszahlungen", eur(b.jahr));
      if (zahl(b.summe) !== undefined) {
        add(b.quelle === "dokument" ? "Gezahlt laut Zahlungsübersicht der Abrechnung" : b.quelle === "kontoauszug" ? "Gezahlt laut Ihren Zahlungsbelegen" : b.quelle === "vorjahresabrechnung" ? "Gezahlt laut Vorjahresabrechnung" : "Gezahlt laut Ihren Angaben", eur(b.summe));
        if ((zahl(b.differenz) ?? 0) > 0) add("Fehlt", eur(b.differenz), true);
      } else if (zahl(b.monatlich) !== undefined) {
        add("Laut Abrechnung pro Monat", eur(b.monatlich));
        add(`${zahl(b.monate)} Monate × ${eur(b.monatlich)}`, eur(b.erwartet));
        if ((zahl(b.differenz) ?? 0) > 0) add(e.status === "pruefbedarf" ? "Mögliche Differenz (noch nicht belegt)" : "Differenz", eur(b.differenz), true);
      }
      break;
    }
    case "I-01":
      position();
      add("Warum nicht erlaubt", p ? KOSTENART_TEXT[p.kategorie] ?? "nicht umlagefähig" : undefined);
      if (e.betragZugunstenMieter) add("Zu Ihren Gunsten", euro(e.betragZugunstenMieter), true);
      break;
    case "I-02":
      position();
      add("Im Mietvertrag vereinbart", Array.isArray(b.vereinbart) ? ((b.vereinbart as string[]).join(", ") || "keine sonstigen Kosten") : "noch nicht bekannt");
      if (e.status === "abweichung" && e.betragZugunstenMieter) add("Zu Ihren Gunsten", euro(e.betragZugunstenMieter), true);
      break;
    case "I-04":
      add("Ihre Heizkosten", eur(b.anteilMieter));
      if (zahl(b.kuerzung) !== undefined) add("Kürzung um 15 %", eur(b.kuerzung), true);
      if (zahl(b.verbrauchsanteilProzent) !== undefined) add("Anteil nach Verbrauch", `${zahlDE(zahl(b.verbrauchsanteilProzent)!, 0)} % (üblich 50–70 %)`, true);
      break;
    case "I-05":
      position();
      if (zahl(b.tageDanach) !== undefined) add("Davon nach dem 30.06.2024", `${zahl(b.tageDanach)} von ${zahl(b.tageGesamt)} Tagen`);
      if (e.betragZugunstenMieter)
        add(
          e.status === "abweichung" ? "Zu Ihren Gunsten" : `Zeitanteilig zu Ihren Gunsten (${eur(b.anteilMieter)} × ${zahl(b.tageDanach)}/${zahl(b.tageGesamt)} Tage)`,
          e.status === "abweichung" ? euro(e.betragZugunstenMieter) : `bis zu ${euro(e.betragZugunstenMieter)}`,
          true,
        );
      break;
    case "I-06":
      add("Ihre Wohnung", a.meta.geschoss === 0 ? "Erdgeschoss" : a.meta.geschoss !== undefined ? `${a.meta.geschoss}. Geschoss` : undefined);
      add("Ihre Aufzugskosten", eur(b.summe), true);
      break;
    case "I-07":
      position();
      add("Reparaturen laut Aufstellung (Haus)", eur(b.reparaturHaus));
      if (typeof b.ausschlussImDokument === "string") add("Erklärung in der Abrechnung", `„${b.ausschlussImDokument}“`);
      if (e.betragZugunstenMieter) add("Davon Ihr Anteil, nicht umlagefähig", euro(e.betragZugunstenMieter), true);
      break;
    case "R-08": {
      const eh = b.einheit === "" ? "" : " m³";
      position();
      if (zahl(b.faktorLautProtokoll) !== undefined) add("Faktor laut Geräteprotokoll", zahlDE(zahl(b.faktorLautProtokoll)!));
      if (zahl(b.faktor) !== undefined) add("Faktor in der Abrechnung", zahlDE(zahl(b.faktor)!), zahl(b.faktor) !== zahl(b.faktorLautProtokoll));
      add("Verbrauch laut Zähler", zahl(b.verbrauchZaehler) !== undefined ? `${zahlDE(zahl(b.verbrauchZaehler)!)}${eh}` : undefined);
      add("Abgerechneter Verbrauch", zahl(b.verbrauchAbgerechnet) !== undefined ? `${zahlDE(zahl(b.verbrauchAbgerechnet)!)}${eh}` : undefined, true);
      if (e.betragZugunstenMieter && zahl(b.zuViel) !== undefined) add(`Zu viel berechnet (${eur(b.anteilMieter)} × ${zahlDE(zahl(b.zuViel)!)} / ${zahlDE(zahl(b.verbrauchAbgerechnet)!)}${eh})`, euro(e.betragZugunstenMieter), true);
      break;
    }
    case "R-09":
      add("Betrag laut Beleg", eur(b.belegBetrag));
      if (b.art !== "gutschrift") add("In die Abrechnung übernommen", eur(b.uebernommen), true);
      if (typeof b.objekt === "string") add("Beleg ausgestellt für", b.objekt);
      add("Zu viel für das ganze Haus", eur(b.zuVielHaus));
      if (e.betragZugunstenMieter) add(e.status === "abweichung" ? "Davon Ihr Anteil" : "Möglicher Anteil", e.status === "abweichung" ? euro(e.betragZugunstenMieter) : `bis zu ${euro(e.betragZugunstenMieter)}`, true);
      break;
    case "I-16":
    case "I-15":
      for (const id of (b.positionen as string[] | undefined) ?? []) {
        const x = a.kostenpositionen.find((q) => q.id === id);
        if (x) add(x.bezeichnung, euro(x.anteilMieter));
      }
      if (e.regelId === "I-16") {
        add("Rechnung", typeof b.belegnummer === "string" ? b.belegnummer : undefined);
        if (e.betragZugunstenMieter) add(e.status === "abweichung" ? "Einmal zu streichen" : "Möglicherweise doppelt", e.status === "abweichung" ? euro(e.betragZugunstenMieter) : `bis zu ${euro(e.betragZugunstenMieter)}`, true);
      }
      break;
    case "I-08":
      add("CO₂-Ausstoß des Hauses", zahl(b.kgProQm) !== undefined ? `${zahlDE(zahl(b.kgProQm)!)} kg je m² und Jahr` : undefined);
      add("Anteil, den der Vermieter tragen muss", zahl(b.vermieterquote) !== undefined ? `${Math.round(zahl(b.vermieterquote)! * 100)} %` : undefined);
      add("Vom Vermieter zu tragen (Haus)", eur(b.erwartet));
      add("Tatsächlich berücksichtigt", eur(b.abgerechnet));
      if (e.betragZugunstenMieter) add("Zu Ihren Gunsten", euro(e.betragZugunstenMieter), true);
      break;
    case "I-09": {
      const ids = (b.positionen as string[] | undefined) ?? [];
      const pos = a.kostenpositionen.filter((x) => ids.includes(x.id));
      add("Positionen", pos.map((x) => x.bezeichnung).join(", "));
      add("Verteilt nach", [...new Set(pos.map((x) => SCHLUESSEL[x.umlageschluessel?.typ ?? ""] ?? "unbekannt"))].join(", "));
      add("Ihr Anteil", eur(b.summe), true);
      break;
    }
    case "I-10":
      position();
      add("Miete laut Aufstellung (Haus)", eur(b.mieteHaus));
      if (e.betragZugunstenMieter) add("Davon Ihr Anteil, nicht umlagefähig", euro(e.betragZugunstenMieter), true);
      break;
    case "I-17":
    case "I-11":
      position();
      add("Nicht umlagefähig laut Abrechnung (Haus)", eur(b.nichtUmlagefaehigHaus));
      if (e.betragZugunstenMieter) add("Davon Ihr Anteil", euro(e.betragZugunstenMieter), true);
      if (zahl(b.jeQm) !== undefined) {
        add("Ihre Kosten je m² und Monat", `${zahlDE(zahl(b.jeQm)!)} €`, true);
        add("Bundesdurchschnitt (Mieterbund 2024)", "0,37 €");
      }
      break;
    case "R-06":
      add("Ihre Mietzeit im Zeitraum", typeof b.von === "string" && typeof b.bis === "string" ? `${datumDE(b.von)} bis ${datumDE(b.bis)}` : undefined);
      if (zahl(b.tageMiete) !== undefined) add("Tage", `${zahl(b.tageMiete)} von ${zahl(b.tageGesamt)}`);
      add("Zeitabhängige Kosten (ganzes Jahr)", eur(b.zeitKosten));
      if (e.betragZugunstenMieter) add("Zu viel berechnet", `bis zu ${euro(e.betragZugunstenMieter)}`, true);
      break;
    case "R-07":
      add("Fläche laut Mietvertrag", zahl(b.vertrag) !== undefined ? `${zahlDE(zahl(b.vertrag)!)} m²` : undefined);
      add("Fläche in der Abrechnung", zahl(b.abrechnung) !== undefined ? `${zahlDE(zahl(b.abrechnung)!)} m²` : undefined, true);
      add("Nach Fläche verteilte Kosten", eur(b.flaechenKosten));
      if (e.betragZugunstenMieter) add("Mögliche Ersparnis", `bis zu ${euro(e.betragZugunstenMieter)}`, true);
      break;
    case "I-12":
      add("Gewerbe im Haus", a.ausstattung?.gewerbeImHaus === true ? "ja" : "noch nicht bekannt");
      add("Vorwegabzug in der Abrechnung", e.status === "nicht_pruefbar" ? undefined : "keiner", true);
      break;
    case "I-13":
      add("Angesetzte Wohnungen", Array.isArray(b.werte) ? (b.werte as number[]).map((w) => zahlDE(w)).join(" und ") : undefined, true);
      if (e.betragZugunstenMieter) add("Mögliche Ersparnis", `bis zu ${euro(e.betragZugunstenMieter)}`, true);
      break;
    case "I-14":
      add("Grundsteuer Vorjahr", eur(b.vorher));
      add("Grundsteuer jetzt", eur(b.jetzt), true);
      if (zahl(b.aenderung) !== undefined) add("Änderung", `${zahl(b.aenderung)! > 0 ? "+" : ""}${zahlDE(zahl(b.aenderung)!, 0)} %`);
      break;
    case "P-01":
      add("Kostenart", typeof b.kategorie === "string" ? KOSTENKATEGORIEN_KURZ(b.kategorie) : undefined);
      add("Vorjahr", eur(b.vorher));
      add("Dieses Jahr", eur(b.aktuell));
      if (zahl(b.steigerung) !== undefined) add("Anstieg", `${eur(b.steigerung)}${zahl(b.quote) !== undefined ? ` (+${zahlDE(zahl(b.quote)!, 0)} %)` : ""}`, true);
      break;
    case "P-02":
      add("Ihre Kosten je m² und Monat", zahl(b.proQmMonat) !== undefined ? `${zahlDE(zahl(b.proQmMonat)!)} €` : undefined, true);
      add("Üblich bis", zahl(b.schwelle) !== undefined ? `${zahlDE(zahl(b.schwelle)!)} €` : undefined);
      break;
    case "P-03":
      add("Warmwasserkosten im Haus", eur(b.kostenGesamt));
      add("Warmwasserverbrauch im Haus", zahl(b.verbrauchGesamtM3) !== undefined ? `${zahlDE(zahl(b.verbrauchGesamtM3)!)} m³` : undefined);
      add("Kosten je m³", eur(b.proM3), true);
      add("Üblich bis etwa", eur(b.schwelle));
      if (zahl(b.kwhProM3) !== undefined) add("Wärme je m³ Warmwasser", `${zahlDE(zahl(b.kwhProM3)!, 0)} kWh`);
      break;
    default:
      position();
  }
  // Für alle Befunde: tragende Textstelle, betroffener Betrag (kein Potenzial), nicht bezifferbare Auswirkung
  if (e.textstelle && !f.some((x) => x.wert.includes(e.textstelle!))) add("Textstelle", `„${e.textstelle}“`);
  const ohneBetrag = !(e.betragZugunstenMieter && e.betragZugunstenMieter > 0);
  if ((e.status === "auffaelligkeit" || e.status === "pruefbedarf") && ohneBetrag) {
    if (e.betroffen !== undefined && !f.some((x) => x.label === "Ihr Anteil")) add("Abgerechneter Anteil (möglicherweise betroffen)", euro(e.betroffen));
    add("Auswirkung", "noch nicht bezifferbar", true);
  }
  return f;
}

const KOSTENART_TEXT: Partial<Record<string, string>> = {
  verwaltung: "Verwaltungskosten trägt der Vermieter",
  instandhaltung: "Reparaturen und Instandhaltung trägt der Vermieter",
  ruecklage: "Rücklagen für Reparaturen trägt der Vermieter",
  bank_porto: "Bank- und Portogebühren trägt der Vermieter",
};

function KOSTENKATEGORIEN_KURZ(k: string): string {
  const name = (KOSTENKATEGORIEN as Record<string, string>)[k];
  return name ? name.replace(/^§ 2 Nr\. \d+ – /, "") : k;
}
