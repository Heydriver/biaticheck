import type { Regel } from "../regel";

/**
 * K-01: Funde der KI-Kontrolle. Die KI vergleicht das Dokument mit dem Zeilenprotokoll und meldet konkrete
 * Unstimmigkeiten, die keine Formel erfasst – immer mit wörtlicher Textstelle. Sie sind begründeter Prüfbedarf:
 * Sie zählen nicht als belegter Fehler und haben keinen Betrag, stehen aber bei den gefundenen Punkten und im
 * Schreiben an die Hausverwaltung (dort nur als Zitat aus der Abrechnung mit der Bitte um Erläuterung).
 */
export const K01_KiKontrolle: Regel = {
  id: "K-01",
  version: "1.0.0",
  titel: "Auffälligkeiten aus der KI-Kontrolle",
  bereich: "inhaltlich",
  grundlage: "§ 259 BGB (nachvollziehbare Abrechnung); Belegeinsicht nach § 556 Abs. 4 BGB",
  stand: "entwurf",
  pruefe(a) {
    return a.kontrollbefunde.map((k) => {
      const position = k.positionId ? a.kostenpositionen.find((p) => p.id === k.positionId) : undefined;
      return {
        status: "auffaelligkeit" as const,
        titel: position ? `Unstimmigkeit im Dokument: ${position.bezeichnung}` : "Unstimmigkeit im Dokument",
        erklaerung: k.beschreibung,
        naechsterSchritt: "Bitten Sie die Hausverwaltung um eine Erläuterung dieser Stelle und um die zugehörigen Belege.",
        positionId: position?.id,
        betroffen: position?.anteilMieter,
        textstelle: k.textstelle,
        beleg: { quelle: "ki-kontrolle", seite: k.seite },
      };
    });
  },
};
