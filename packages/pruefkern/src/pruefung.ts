import { runde } from "./hilfen";
import {
  STANDARD_EINSTELLUNGEN,
  type Einstellungen,
  type Regel,
  type Regelergebnis,
  type Rueckfrage,
  type Status,
} from "./regel";
import { FORMELLE_REGELN } from "./regeln/formell";
import { INHALTLICHE_REGELN } from "./regeln/inhaltlich";
import { PLAUSIBILITAETS_REGELN } from "./regeln/plausibilitaet";
import { RECHNERISCHE_REGELN } from "./regeln/rechnerisch";
import { Abrechnung, type AbrechnungEingabe } from "./schema";

export const REGELWERK_VERSION = "0.10.0";

export const ALLE_REGELN: readonly Regel[] = [
  ...FORMELLE_REGELN,
  ...RECHNERISCHE_REGELN,
  ...INHALTLICHE_REGELN,
  ...PLAUSIBILITAETS_REGELN,
];

export interface Pruefbericht {
  regelwerkVersion: string;
  geprueftAm: string;
  ergebnisse: Regelergebnis[];
  zusammenfassung: {
    anzahl: Record<Status, number>;
    /**
     * Geschätztes Einsparpotenzial in Euro. Ist die Nachforderung insgesamt
     * ausgeschlossen (z. B. Frist), werden Einzelbeträge nicht zusätzlich addiert,
     * sondern der höhere Wert genommen.
     */
    einsparpotenzial: number;
    /** Beträge aus Auffälligkeiten, die sich nach Klärung als Ersparnis erweisen können. */
    klaerungspotenzial: number;
    /** Mögliche Beträge aus Prüfbedarf – erst nach weiteren Unterlagen belastbar, nicht im Potenzial enthalten. */
    pruefbedarfBetrag: number;
    /** Prüfbedarf-Punkte, deren Auswirkung noch nicht bezifferbar ist. */
    pruefbedarfOhneBetrag: number;
    rueckfragen: Rueckfrage[];
  };
}

export interface Pruefoptionen {
  /** Stichtag, Standard: heute. */
  heute?: string;
  einstellungen?: Partial<Einstellungen>;
  regeln?: readonly Regel[];
}

/** Regeln, deren Befund die gesamte Nachforderung betrifft (nicht mit Einzelbeträgen addieren). */
const GESAMTREGELN = new Set(["F-02", "F-05"]);

export function pruefeAbrechnung(eingabe: AbrechnungEingabe, optionen: Pruefoptionen = {}): Pruefbericht {
  const abrechnung = Abrechnung.parse(eingabe);
  const heute = optionen.heute ?? new Date().toISOString().slice(0, 10);
  const kontext = { heute, einstellungen: { ...STANDARD_EINSTELLUNGEN, ...optionen.einstellungen } };

  const ergebnisse: Regelergebnis[] = [];
  for (const regel of optionen.regeln ?? ALLE_REGELN) {
    const kopf = { regelId: regel.id, regelVersion: regel.version, regelTitel: regel.titel, bereich: regel.bereich };
    try {
      for (const befund of regel.pruefe(abrechnung, kontext)) ergebnisse.push({ ...kopf, ...befund });
    } catch (fehler) {
      // Eine fehlerhafte Regel darf nie die ganze Prüfung abbrechen – der Fall landet beim Experten.
      ergebnisse.push({
        ...kopf,
        status: "nicht_pruefbar",
        titel: "Interner Prüffehler",
        erklaerung: "Dieser Prüfschritt konnte nicht automatisch durchgeführt werden und wird von einem Experten geprüft.",
        beleg: { fehler: String(fehler) },
      });
    }
  }

  const anzahl: Record<Status, number> = { ok: 0, abweichung: 0, auffaelligkeit: 0, pruefbedarf: 0, hinweis: 0, nicht_pruefbar: 0 };
  let einzeln = 0;
  // Mehrere Regeln können dieselbe Position beanstanden. Ganze-Position-Befunde (Betrag = Anteil) zählen einmal,
  // Teilbeträge werden addiert – zusammen nie mehr, als die Position die Wohnung kostet (keine Doppelzählung).
  const jePosition = new Map<string, number>();
  const anteilDer = new Map(abrechnung.kostenpositionen.map((p) => [p.id, p.anteilMieter]));
  let gesamt = 0;
  let klaerung = 0;
  let pruefbedarf = 0;
  let pruefbedarfOhneBetrag = 0;
  const rueckfragen = new Map<string, Rueckfrage>();

  for (const e of ergebnisse) {
    anzahl[e.status]++;
    if (e.status === "abweichung" && e.betragZugunstenMieter && e.betragZugunstenMieter > 0) {
      if (GESAMTREGELN.has(e.regelId)) gesamt = Math.max(gesamt, e.betragZugunstenMieter);
      else if (e.positionId) {
        const grenze = anteilDer.get(e.positionId) ?? Infinity;
        const bisher = jePosition.get(e.positionId) ?? 0;
        // Ein Befund über die ganze Position ersetzt die Summe, sonst addieren und auf den Anteil begrenzen
        jePosition.set(e.positionId, e.betragZugunstenMieter >= grenze ? Math.max(bisher, e.betragZugunstenMieter) : Math.min(Math.max(grenze, bisher), bisher + e.betragZugunstenMieter));
      }
      else einzeln += e.betragZugunstenMieter;
    }
    if (e.status === "auffaelligkeit" && e.betragZugunstenMieter && e.betragZugunstenMieter > 0) {
      klaerung += e.betragZugunstenMieter;
    }
    if (e.status === "pruefbedarf" && e.betragZugunstenMieter && e.betragZugunstenMieter > 0) {
      pruefbedarf += e.betragZugunstenMieter;
    }
    if (e.status === "pruefbedarf" && !(e.betragZugunstenMieter && e.betragZugunstenMieter > 0)) pruefbedarfOhneBetrag++;
    if (e.rueckfrage && !rueckfragen.has(e.rueckfrage.feld)) rueckfragen.set(e.rueckfrage.feld, e.rueckfrage);
  }

  return {
    regelwerkVersion: REGELWERK_VERSION,
    geprueftAm: heute,
    ergebnisse,
    zusammenfassung: {
      anzahl,
      einsparpotenzial: runde(Math.max(einzeln + [...jePosition.values()].reduce((s, x) => s + x, 0), gesamt)),
      klaerungspotenzial: runde(klaerung),
      pruefbedarfBetrag: runde(pruefbedarf),
      pruefbedarfOhneBetrag,
      rueckfragen: [...rueckfragen.values()],
    },
  };
}
