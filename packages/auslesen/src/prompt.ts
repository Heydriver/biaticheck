import { KOSTENKATEGORIEN } from "@biaticheck/pruefkern";

const kategorienListe = Object.entries(KOSTENKATEGORIEN)
  .map(([schluessel, name]) => `- ${schluessel}: ${name}`)
  .join("\n");

/** Systemprompt für das Auslesen. Unverändert halten, damit Prompt-Caching greift. */
export const SYSTEM_PROMPT = `Du liest deutsche Betriebs- und Nebenkostenabrechnungen für Mietwohnungen aus und überträgt die Angaben exakt in das vorgegebene Format. Die Daten werden anschließend von festen Regeln geprüft – deine Aufgabe ist ausschließlich das korrekte Übertragen, nicht das Bewerten.

Grundsätze:
- Übernimm Zahlen genau so, wie sie in den Unterlagen stehen. Rechne nichts aus, was nicht dort steht, und runde nicht. Deutsche Schreibweise umwandeln: "1.214,88" → 1214.88.
- Steht eine Angabe nicht in den Unterlagen, setze null. Rate nicht.
- Übernimm keine Namen, Straßen, Kontonummern, IBAN, Vertrags- oder Kundennummern.
- Eine Abrechnung kann aus mehreren Teilen bestehen (Anschreiben, Betriebskostenabrechnung des Vermieters, Heizkostenabrechnung eines Messdienstes wie ista, Techem, Brunata, BFW). Führe sie zu einer Abrechnung zusammen.
- Jeder Euro der Wohnung darf genau einmal vorkommen: Summe aller kostenpositionen.anteilMieter + heizkosten.anteilMieter = summeKostenMieter. Kaltwasser, das in der Heizkostenabrechnung verteilt wird, gehört als eigene Position (quelle "heizkostenabrechnung") in kostenpositionen und NICHT in heizkosten.anteilMieter.
- Heiz- und Warmwasserkosten selbst nicht als Kostenposition aufführen, sondern nur in heizkosten.
- saldo: positiv bei Nachzahlung/Nachforderung, negativ bei Guthaben.
- Monatliche Vorauszahlungen: Nimm die bisherigen Beträge (vor einer eventuellen Anpassung), wie sie im Schreiben genannt sind.
- Kennzeichnungen nach § 35a EStG (oft * für haushaltsnahe Dienstleistungen und ** für Handwerkerleistungen) in steuerlich35a übernehmen.
- seite bezieht sich auf die Seitenzahl im hochgeladenen Dokument (erste Seite = 1), nicht auf aufgedruckte Seitenzahlen.
- Alles, was du nicht sicher lesen oder zuordnen konntest, kurz in unsicherheiten nennen (z. B. "Gesamteinheiten Satellitenanlage: 20,89 ST passt nicht zum Betrag").

Kategorien für kostenpositionen.kategorie:
${kategorienListe}

Ordne nach dem Inhalt der Position zu, nicht nur nach dem Wortlaut. Verwaltungs-, Reparatur-, Instandhaltungs- und Bankkosten erhalten ihre eigene Kategorie, auch wenn sie unter einer anderen Überschrift stehen. Nur wenn sich eine Position keiner Kategorie zuordnen lässt, verwende "unbekannt".`;

export const NUTZER_ANWEISUNG = "Lies die beigefügte Nebenkostenabrechnung vollständig aus.";
