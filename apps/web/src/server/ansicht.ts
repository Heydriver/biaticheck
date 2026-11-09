import { erstelleStufe1, erstelleStufe2, istBeanstandet, type Auffaelligkeit, type Fakt, type Referenzwerte, type Stufe1, type Stufe2, type Unterlagenanforderung } from "@biaticheck/pruefkern";
import type { faelle, Fallstatus } from "./db/schema";

/**
 * Alles, was der Kunde über seinen Fall sieht. Wird an den Browser geschickt –
 * deshalb ausschließlich hier zusammengestellt, nie aus dem Datenbankobjekt direkt.
 *
 * Preismodell B: Prüfen und die gefundenen Fehler (Kurzfassung) sind kostenlos.
 * Das Erledigen-Paket (Stufe 2: Schritte, Schreiben, Beratung) kostet nur, wenn
 * mindestens MINDESTERSPARNIS gefunden wurde – sonst ist es ebenfalls frei.
 */
export const MINDESTERSPARNIS = 30;
export const PREIS = 9.9;

export interface FehlerKurz {
  titel: string;
  satz: string;
  betrag?: number;
  /** Bei Prüfbedarf: Frage an den Kunden, die den Punkt klärt. */
  rueckfrage?: { feld: string; frage: string; typ: Stufe1["rueckfragen"][number]["typ"] };
  /** Nachvollziehbare Zahlen und Fundstelle. */
  fakten: Fakt[];
  fundstelle?: string;
  grundlage?: string;
}

const kurz = (p: Auffaelligkeit): FehlerKurz => ({
  titel: p.kurz.titel,
  satz: p.kurz.satz,
  ...(p.betrag !== undefined ? { betrag: p.betrag } : {}),
  ...(p.rueckfrage ? { rueckfrage: p.rueckfrage } : {}),
  fakten: p.fakten,
  ...(p.fundstelle ? { fundstelle: p.fundstelle } : {}),
  ...(p.grundlage ? { grundlage: p.grundlage.replace(/\s*\(Schwellenwert[^)]*\)/, "") } : {}),
});

export interface FallAnsicht {
  id: string;
  status: Fallstatus;
  erstelltAm: string;
  /** Ergebnis stammt aus der Musterabrechnung (Demo-Modus ohne KI-Auslesen). */
  demo: boolean;
  freischaltung: "test" | "aus";
  bezahlt: boolean;
  /** Preis des Erledigen-Pakets; nicht gesetzt, wenn es für diesen Fall kostenlos ist. */
  preis?: number;
  stufe1?: Stufe1;
  /** Gefundene Fehler und Auffälligkeiten in Kurzfassung (kostenlos). */
  fehler?: FehlerKurz[];
  /** Mögliche Fehler, die erst mit weiteren Unterlagen sicher sind (kostenlos, ohne Betrag im Potenzial). */
  pruefbedarf?: FehlerKurz[];
  unterlagen?: Unterlagenanforderung[];
  stufe2?: Stufe2;
}

export function erstelleFallAnsicht(
  fall: typeof faelle.$inferSelect,
  optionen: { zahlungModus: "test" | "aus"; regional?: Referenzwerte; heute?: string },
): FallAnsicht {
  const sichtbar = fall.status === "fertig" && fall.bericht && fall.daten;
  const stufe1 = sichtbar ? erstelleStufe1(fall.bericht!, fall.daten!, { heute: optionen.heute, regional: optionen.regional }) : undefined;
  const bezahlt = Boolean(fall.bezahltAm);
  const stufe2 = stufe1 ? erstelleStufe2(fall.bericht!, fall.daten!, stufe1) : undefined;
  const lohnt = stufe1 ? stufe1.fehlerpotenzial.sicher + stufe1.fehlerpotenzial.zuKlaeren >= MINDESTERSPARNIS : false;
  const fehler = stufe2?.auffaelligkeiten
    .filter((p) => istBeanstandet(p.status))
    .map(kurz);
  const pruefbedarf = stufe2?.auffaelligkeiten
    .filter((p) => p.status === "pruefbedarf")
    .map(kurz);
  return {
    id: fall.id,
    status: fall.status,
    erstelltAm: fall.erstelltAm.toISOString(),
    demo: fall.auslesung?.modell === "demo",
    freischaltung: optionen.zahlungModus,
    bezahlt,
    preis: lohnt && !bezahlt ? PREIS : undefined,
    stufe1,
    fehler,
    pruefbedarf,
    unterlagen: stufe2?.unterlagen,
    stufe2: bezahlt || !lohnt ? stufe2 : undefined,
  };
}

export const LAEUFT: readonly Fallstatus[] = ["hochgeladen", "wird_ausgelesen"];
