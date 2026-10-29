import type Anthropic from "@anthropic-ai/sdk";
import type { AbrechnungEingabe } from "@biaticheck/pruefkern";
import { pruefeKonsistenz, type Konsistenz } from "./konsistenz";
import { rufeModellAuf, type Dokument } from "./modell";
import { wandleUm } from "./umwandlung";

export { AuslesenFehler, MODELL, type Dokument, type Dokumenttyp } from "./modell";
export { erkenneDokumenttyp } from "./dateityp";
export { pruefeKonsistenz, type Konsistenz } from "./konsistenz";
export { Rohdaten } from "./rohdaten";
export { wandleUm } from "./umwandlung";
export { vergleiche, type Vergleich } from "./vergleich";

export interface Auslesung {
  /** Nicht gesetzt, wenn das Dokument keine Nebenkostenabrechnung ist. */
  abrechnung?: AbrechnungEingabe;
  istNebenkostenabrechnung: boolean;
  konsistenz: Konsistenz;
  hinweise: string[];
  modell: string;
  nutzung: { eingabeTokens: number; ausgabeTokens: number };
}

/** Liest Dokumente aus und kontrolliert das Ergebnis auf innere Stimmigkeit. */
export async function leseAus(client: Anthropic, dokumente: Dokument[]): Promise<Auslesung> {
  const aufruf = await rufeModellAuf(client, dokumente);
  if (!aufruf.rohdaten.istNebenkostenabrechnung) {
    return {
      istNebenkostenabrechnung: false,
      konsistenz: { konsistent: false, gruende: ["Dokument ist keine Nebenkostenabrechnung"] },
      hinweise: aufruf.rohdaten.unsicherheiten,
      modell: aufruf.modell,
      nutzung: aufruf.nutzung,
    };
  }
  const { abrechnung, hinweise } = wandleUm(aufruf.rohdaten);
  return {
    abrechnung,
    istNebenkostenabrechnung: true,
    konsistenz: pruefeKonsistenz(abrechnung),
    hinweise,
    modell: aufruf.modell,
    nutzung: aufruf.nutzung,
  };
}
