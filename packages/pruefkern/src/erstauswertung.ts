import { antworttyp, type Antworttyp } from "./antworten";
import type { Pruefbericht } from "./pruefung";
import type { Regelbereich, Status } from "./regel";

/**
 * Kostenlose Erstauswertung: bewusst nur Überblick und Titel.
 * Erklärungen, nächste Schritte, Beträge je Punkt und Belege gehören in den
 * bezahlten Bericht und dürfen diese Struktur nie erreichen – sie wird
 * unverändert an den Browser geschickt.
 */
export interface Erstauswertung {
  regelwerkVersion: string;
  geprueftAm: string;
  anzahl: Record<Status, number>;
  einsparpotenzial: number;
  klaerungspotenzial: number;
  punkte: { titel: string; status: Exclude<Status, "ok">; bereich: Regelbereich }[];
  rueckfragen: { feld: string; frage: string; typ: Antworttyp }[];
}

const REIHENFOLGE: Record<Exclude<Status, "ok">, number> = { abweichung: 0, auffaelligkeit: 1, nicht_pruefbar: 2 };

export function erstelleErstauswertung(bericht: Pruefbericht): Erstauswertung {
  const punkte = bericht.ergebnisse
    .filter((e): e is typeof e & { status: Exclude<Status, "ok"> } => e.status !== "ok")
    .sort((a, b) => REIHENFOLGE[a.status] - REIHENFOLGE[b.status])
    .map((e) => ({ titel: e.titel, status: e.status, bereich: e.bereich }));

  return {
    regelwerkVersion: bericht.regelwerkVersion,
    geprueftAm: bericht.geprueftAm,
    anzahl: { ...bericht.zusammenfassung.anzahl },
    einsparpotenzial: bericht.zusammenfassung.einsparpotenzial,
    klaerungspotenzial: bericht.zusammenfassung.klaerungspotenzial,
    punkte,
    rueckfragen: bericht.zusammenfassung.rueckfragen.map((r) => {
      const typ = antworttyp(r.feld);
      if (!typ) throw new Error(`Rückfrage-Feld nicht registriert: ${r.feld}`);
      return { feld: r.feld, frage: r.frage, typ };
    }),
  };
}
