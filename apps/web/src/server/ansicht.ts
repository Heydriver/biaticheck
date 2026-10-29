import { erstelleErstauswertung, type Erstauswertung } from "@biaticheck/pruefkern";
import type { faelle, Fallstatus } from "./db/schema";

/**
 * Alles, was der Kunde über seinen Fall sieht. Wird an den Browser geschickt –
 * deshalb ausschließlich hier zusammengestellt, nie aus dem Datenbankobjekt direkt.
 */
export interface FallAnsicht {
  id: string;
  status: Fallstatus;
  erstelltAm: string;
  erstauswertung?: Erstauswertung;
}

export function erstelleFallAnsicht(fall: typeof faelle.$inferSelect): FallAnsicht {
  return {
    id: fall.id,
    status: fall.status,
    erstelltAm: fall.erstelltAm.toISOString(),
    erstauswertung: fall.status === "fertig" && fall.bericht ? erstelleErstauswertung(fall.bericht) : undefined,
  };
}

export const LAEUFT: readonly Fallstatus[] = ["hochgeladen", "wird_ausgelesen"];
