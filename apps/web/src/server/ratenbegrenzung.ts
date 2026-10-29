/**
 * Einfache Ratenbegrenzung im Arbeitsspeicher (gleitendes Fenster).
 * Schützt vor Missbrauch und unkontrollierten API-Kosten.
 * Gilt je Server-Prozess – bei mehreren Instanzen auf Redis/Postgres umstellen.
 */
export function erstelleRatenbegrenzung(grenze: number, fensterMs: number, jetzt: () => number = Date.now) {
  const treffer = new Map<string, number[]>();

  return {
    /** true, wenn die Anfrage erlaubt ist (und zählt sie). */
    erlaube(schluessel: string): boolean {
      const zeit = jetzt();
      const aktuell = (treffer.get(schluessel) ?? []).filter((t) => zeit - t < fensterMs);
      if (aktuell.length >= grenze) {
        treffer.set(schluessel, aktuell);
        return false;
      }
      aktuell.push(zeit);
      treffer.set(schluessel, aktuell);
      // Speicher begrenzen: alte Einträge gelegentlich aufräumen
      if (treffer.size > 10_000) {
        for (const [k, v] of treffer) if (v.every((t) => zeit - t >= fensterMs)) treffer.delete(k);
      }
      return true;
    },
  };
}
