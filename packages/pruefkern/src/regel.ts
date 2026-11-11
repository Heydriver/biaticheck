import type { Abrechnung } from "./schema";

/**
 * Ergebnistypen, die der Kunde sieht:
 * - ok:              geprüft, nichts zu beanstanden
 * - abweichung:      rechnerischer oder klarer formeller/inhaltlicher Fehler
 * - auffaelligkeit:  ungewöhnlich, sollte geklärt werden (Belegeinsicht, Rückfrage)
 * - pruefbedarf:     möglicher Fehler, aber nicht sicher genug – erst weitere Unterlagen prüfen;
 *                    der Betrag zählt NICHT zum Einspar- oder Klärungspotenzial
 * - hinweis:         allgemeine Information oder statistischer Vergleich ohne konkreten Fehlerverdacht;
 *                    zählt nie als Fehler, nie zum Potenzial und nie in die Überschrift
 * - nicht_pruefbar:  mit den vorliegenden Unterlagen nicht prüfbar
 */
export type Status = "ok" | "abweichung" | "auffaelligkeit" | "pruefbedarf" | "hinweis" | "nicht_pruefbar";

/**
 * Einordnung für den Kunden:
 * - fehler:      konkreter, anhand der Angaben nachvollziehbar belegter Fehler (abweichung)
 * - pruefbedarf: konkreter Anhaltspunkt, aber eine entscheidende Information fehlt (auffaelligkeit, pruefbedarf)
 * - hinweis:     hilfreiche Information ohne konkreten Fehlerverdacht
 * - vergleich:   statistische Einordnung (Kostenvergleich), kein Nachweis eines Fehlers
 * - frage:       offene Angabe, die der Kunde beantworten kann (nicht_pruefbar)
 */
export type Einordnung = "fehler" | "pruefbedarf" | "hinweis" | "vergleich" | "frage";

export function einordnung(status: Exclude<Status, "ok">, bereich?: Regelbereich, art?: "vergleich"): Einordnung {
  if (status === "abweichung") return "fehler";
  if (status === "auffaelligkeit" || status === "pruefbedarf") return "pruefbedarf";
  if (status === "hinweis") return art === "vergleich" || bereich === "plausibilitaet" ? "vergleich" : "hinweis";
  return "frage";
}

/** Unterlagen, die das Tool für eine sichere Prüfung nachfordern kann. */
export type Unterlage = "vorjahresabrechnung" | "kontoauszug" | "mietvertrag" | "vertragsanlage" | "heizkostenabrechnung" | "zaehlerstaende" | "rechnungen";

export const UNTERLAGEN: Readonly<Record<Unterlage, string>> = {
  vorjahresabrechnung: "Abrechnung des Vorjahres",
  kontoauszug: "Kontoauszüge oder Mietkonto",
  mietvertrag: "Mietvertrag",
  heizkostenabrechnung: "Heizkostenabrechnung des Messdienstes",
  zaehlerstaende: "Zählerstände",
  vertragsanlage: "Vertragsanlage oder Zusatzvereinbarung zum Mietvertrag",
  rechnungen: "Rechnungen und Verträge (über die Belegeinsicht)",
};

/** Fehler oder Auffälligkeit – Punkte, die beanstandet werden und ins Schreiben gehören. */
export const istBeanstandet = (s: Status) => s === "abweichung" || s === "auffaelligkeit";

export type Regelbereich = "formell" | "rechnerisch" | "inhaltlich" | "plausibilitaet";

export interface Rueckfrage {
  /** Pfad im Schema, das die Antwort füllt, z. B. "meta.zugangAm". */
  feld: string;
  frage: string;
}

export interface Befund {
  status: Status;
  /** Kurzer Titel, z. B. "Verwaltungskosten umgelegt". */
  titel: string;
  /** Verständliche Erklärung für den Kunden. */
  erklaerung: string;
  /** Konkreter nächster Schritt für den Kunden (für den ausführlichen Bericht). */
  naechsterSchritt?: string;
  /**
   * Geschätzter Betrag in Euro, um den der Mieter zu viel zahlt
   * (nur wenn sinnvoll bezifferbar).
   */
  betragZugunstenMieter?: number;
  /** Bezug auf eine Kostenposition. */
  positionId?: string;
  /** Daten und Zwischenergebnisse, die zum Befund geführt haben (für Prüfbereich und Nachvollziehbarkeit). */
  beleg?: Record<string, unknown>;
  rueckfrage?: Rueckfrage;
  /** Bei Prüfbedarf: welche Unterlagen die Prüfung sicher machen (eine davon genügt). */
  unterlagen?: Unterlage[];
  /**
   * Abgerechneter Kostenanteil, der von einem Verdacht möglicherweise betroffen ist.
   * Ausdrücklich KEIN Einsparpotenzial – nur zur Einordnung.
   */
  betroffen?: number;
  /** Wörtliche Textstelle aus der Abrechnung, die den Befund trägt (z. B. Erläuterung, Anlage). */
  textstelle?: string;
  /** "vergleich": Befund beruht auf einem statistischen Vergleich, nicht auf einem Rechtsverstoß. */
  art?: "vergleich";
}

export interface Regel {
  /** Stabile ID, z. B. "F-02". Ändert sich nie. */
  id: string;
  /** Wird erhöht, wenn sich die Logik ändert, z. B. "1.0.0". */
  version: string;
  titel: string;
  bereich: Regelbereich;
  /** Rechtsgrundlage bzw. fachliche Quelle. */
  grundlage: string;
  /** Freigabestand: "entwurf" muss vom Expertenteam bestätigt werden. */
  stand: "entwurf" | "bestaetigt";
  pruefe(abrechnung: Abrechnung, kontext: Pruefkontext): Befund[];
}

export interface Pruefkontext {
  /** Stichtag der Prüfung (für Fristberechnungen). */
  heute: string;
  einstellungen: Einstellungen;
}

export interface Einstellungen {
  /** Rundungstoleranz bei Nachrechnungen in Euro. */
  toleranzEuro: number;
  /** Ab welcher Steigerung gegenüber dem Vorjahr eine Position auffällig ist (0.1 = 10 %). */
  vorjahrSteigerungSchwelle: number;
  /** Mindestbetrag der Steigerung in Euro, damit Kleinstbeträge nicht auffallen. */
  vorjahrSteigerungMindestEuro: number;
  /** Kosten pro m² und Monat (ohne Heizung), ab denen die Gesamtkosten auffällig sind. */
  kostenProQmMonatSchwelle: number;
  /** Warmwasserkosten des Hauses pro m³, ab denen sie auffällig sind. */
  warmwasserProM3Schwelle: number;
}

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  toleranzEuro: 0.05,
  vorjahrSteigerungSchwelle: 0.1,
  vorjahrSteigerungMindestEuro: 25,
  // ENTWURF: Wert vom Expertenteam bestätigen (z. B. anhand Betriebskostenspiegel).
  kostenProQmMonatSchwelle: 2.5,
  // ENTWURF: Wert vom Expertenteam bestätigen.
  warmwasserProM3Schwelle: 20,
};

export interface Regelergebnis extends Befund {
  regelId: string;
  regelVersion: string;
  regelTitel: string;
  bereich: Regelbereich;
}
