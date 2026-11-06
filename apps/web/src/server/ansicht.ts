import { erstelleStufe1, erstelleStufe2, type Referenzwerte, type Stufe1, type Stufe2 } from "@biaticheck/pruefkern";
import type { faelle, Fallstatus } from "./db/schema";

/**
 * Alles, was der Kunde über seinen Fall sieht. Wird an den Browser geschickt –
 * deshalb ausschließlich hier zusammengestellt, nie aus dem Datenbankobjekt direkt.
 *
 * Stufe 1 (kostenlos) sobald das Ergebnis freigegeben ist,
 * Stufe 2 (ausführlich) erst nach der Freischaltung.
 */
export interface FallAnsicht {
  id: string;
  status: Fallstatus;
  erstelltAm: string;
  /** Ergebnis stammt aus der Musterabrechnung (Demo-Modus ohne KI-Auslesen). */
  demo: boolean;
  freischaltung: "test" | "aus";
  bezahlt: boolean;
  stufe1?: Stufe1;
  stufe2?: Stufe2;
}

export function erstelleFallAnsicht(
  fall: typeof faelle.$inferSelect,
  optionen: { zahlungModus: "test" | "aus"; regional?: Referenzwerte; heute?: string },
): FallAnsicht {
  const sichtbar = fall.status === "fertig" && fall.bericht && fall.daten;
  const stufe1 = sichtbar ? erstelleStufe1(fall.bericht!, fall.daten!, { heute: optionen.heute, regional: optionen.regional }) : undefined;
  const bezahlt = Boolean(fall.bezahltAm);
  return {
    id: fall.id,
    status: fall.status,
    erstelltAm: fall.erstelltAm.toISOString(),
    demo: fall.auslesung?.modell === "demo",
    freischaltung: optionen.zahlungModus,
    bezahlt,
    stufe1,
    stufe2: stufe1 && bezahlt ? erstelleStufe2(fall.bericht!, fall.daten!, stufe1) : undefined,
  };
}

export const LAEUFT: readonly Fallstatus[] = ["hochgeladen", "wird_ausgelesen"];
