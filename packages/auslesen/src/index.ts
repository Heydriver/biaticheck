import type Anthropic from "@anthropic-ai/sdk";
import type { AbrechnungEingabe } from "@biaticheck/pruefkern";
import { pruefeKonsistenz, type Konsistenz } from "./konsistenz.js";
import { rufeModellAuf, type Dokument } from "./modell.js";
import { wandleUm } from "./umwandlung.js";

export { AuslesenFehler, MODELL, type Dokument, type Dokumenttyp } from "./modell.js";
export { erkenneDokumenttyp } from "./dateityp.js";
export { pruefeKonsistenz, type Konsistenz } from "./konsistenz.js";
export { Rohdaten } from "./rohdaten.js";
export { wandleUm } from "./umwandlung.js";
export { vergleiche, type Vergleich } from "./vergleich.js";

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
