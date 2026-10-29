import { runde } from "./hilfen.js";
import {
  STANDARD_EINSTELLUNGEN,
  type Einstellungen,
  type Regel,
  type Regelergebnis,
  type Rueckfrage,
  type Status,
} from "./regel.js";
import { FORMELLE_REGELN } from "./regeln/formell.js";
import { INHALTLICHE_REGELN } from "./regeln/inhaltlich.js";
import { PLAUSIBILITAETS_REGELN } from "./regeln/plausibilitaet.js";
import { RECHNERISCHE_REGELN } from "./regeln/rechnerisch.js";
import { Abrechnung, type AbrechnungEingabe } from "./schema.js";

export const REGELWERK_VERSION = "0.1.0";

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

  const anzahl: Record<Status, number> = { ok: 0, abweichung: 0, auffaelligkeit: 0, nicht_pruefbar: 0 };
  let einzeln = 0;
  let gesamt = 0;
  const rueckfragen = new Map<string, Rueckfrage>();

  for (const e of ergebnisse) {
    anzahl[e.status]++;
    if (e.status === "abweichung" && e.betragZugunstenMieter && e.betragZugunstenMieter > 0) {
      if (GESAMTREGELN.has(e.regelId)) gesamt = Math.max(gesamt, e.betragZugunstenMieter);
      else einzeln += e.betragZugunstenMieter;
    }
    if (e.rueckfrage && !rueckfragen.has(e.rueckfrage.feld)) rueckfragen.set(e.rueckfrage.feld, e.rueckfrage);
  }

  return {
    regelwerkVersion: REGELWERK_VERSION,
    geprueftAm: heute,
    ergebnisse,
    zusammenfassung: {
      anzahl,
      einsparpotenzial: runde(Math.max(einzeln, gesamt)),
      rueckfragen: [...rueckfragen.values()],
    },
  };
}
