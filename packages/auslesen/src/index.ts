import type Anthropic from "@anthropic-ai/sdk";
import { erstelleZeilenprotokoll, pruefeAbrechnung, type AbrechnungEingabe } from "@biaticheck/pruefkern";
import type { Kontrolle } from "./kontrolle";
import { kontrolliere } from "./kontrollaufruf";
import { pruefeKonsistenz, type Konsistenz } from "./konsistenz";
import { rufeModellAuf, type Dokument } from "./modell";
import { wandleUm } from "./umwandlung";

export { AuslesenFehler, MODELL, type Dokument, type Dokumenttyp } from "./modell";
export { erkenneDokumenttyp } from "./dateityp";
export { pruefeKonsistenz, type Konsistenz } from "./konsistenz";
export { Rohdaten } from "./rohdaten";
export { KEINE_KONTROLLE, KONTROLL_PROMPT, KontrolleRoh, protokollFuerKontrolle, werteKontrolleAus, type Kontrolle } from "./kontrolle";
export { kontrolliere } from "./kontrollaufruf";
export { wandleUm } from "./umwandlung";
export { vergleiche, type Vergleich } from "./vergleich";
export { bereinigeVerlauf, leseVorauszahlungen, VorauszahlungenRoh, type Vorauszahlungsverlauf } from "./vorauszahlungen";

export interface Auslesung {
  /** Nicht gesetzt, wenn das Dokument keine Nebenkostenabrechnung ist. */
  abrechnung?: AbrechnungEingabe;
  istNebenkostenabrechnung: boolean;
  konsistenz: Konsistenz;
  /** Ergebnis der KI-Kontrolle (Unterschritt 2). Nicht gesetzt, wenn sie abgeschaltet ist. */
  kontrolle?: Kontrolle;
  hinweise: string[];
  modell: string;
  nutzung: { eingabeTokens: number; ausgabeTokens: number };
}

/**
 * Liest Dokumente aus und kontrolliert das Ergebnis:
 * 1. innere Stimmigkeit der Zahlen (Formeln),
 * 2. Formelprüfung Zeile für Zeile (Zeilenprotokoll),
 * 3. KI-Kontrolle des Protokolls gegen das Originaldokument.
 * Besteht eine Kontrolle nicht, ist das Ergebnis nicht konsistent und geht an einen Fachprüfer.
 */
export async function leseAus(client: Anthropic, dokumente: Dokument[], optionen: { kontrolle?: boolean; heute?: string } = {}): Promise<Auslesung> {
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
  const konsistenz = pruefeKonsistenz(abrechnung);
  let kontrolle: Kontrolle | undefined;
  const nutzung = { ...aufruf.nutzung };
  if (optionen.kontrolle !== false) {
    const protokoll = erstelleZeilenprotokoll(pruefeAbrechnung(abrechnung, { heute: optionen.heute }), abrechnung);
    const ergebnis = await kontrolliere(client, dokumente, protokoll);
    kontrolle = ergebnis.kontrolle;
    nutzung.eingabeTokens += ergebnis.nutzung.eingabeTokens;
    nutzung.ausgabeTokens += ergebnis.nutzung.ausgabeTokens;
  }
  return {
    abrechnung,
    istNebenkostenabrechnung: true,
    konsistenz: kontrolle && !kontrolle.bestanden ? { konsistent: false, gruende: [...konsistenz.gruende, ...kontrolle.gruende] } : konsistenz,
    kontrolle,
    hinweise,
    modell: aufruf.modell,
    nutzung,
  };
}
