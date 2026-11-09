/** Kleine, getestete Hilfsfunktionen für Datum und Beträge. */

export function runde(betrag: number): number {
  return Math.round(betrag * 100) / 100;
}

export function euro(betrag: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(betrag);
}

/** Zahl im deutschen Format, z. B. 3187.97 → "3.187,97". */
export function zahlDE(n: number, nachkommastellen = 2): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: nachkommastellen }).format(n);
}

export function datumDE(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

function parse(iso: string): Date {
  const [j, m, t] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(j, m - 1, t));
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Addiert Monate kalendergenau. Läuft der Zieltag über das Monatsende hinaus,
 * wird auf den letzten Tag des Zielmonats gekürzt (vgl. § 188 Abs. 3 BGB).
 */
export function plusMonate(iso: string, monate: number): string {
  const d = parse(iso);
  const tag = d.getUTCDate();
  const ziel = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monate, 1));
  const letzterTag = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(tag, letzterTag));
  return format(ziel);
}

/** Länge eines Zeitraums in ganzen Tagen, beide Grenzen eingeschlossen. */
export function tageInklusive(von: string, bis: string): number {
  return Math.round((parse(bis).getTime() - parse(von).getTime()) / 86_400_000) + 1;
}

export function vergleiche(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Monate zwischen zwei Daten (beide inklusive), kalendergenau: volle Kalendermonate zählen 1,
 * angebrochene Monate anteilig nach Tagen. 01.01.–31.12. ergibt genau 12.
 */
export function monateZwischen(von: string, bis: string): number {
  const [jv, mv, tv] = von.split("-").map(Number) as [number, number, number];
  const [jb, mb, tb] = bis.split("-").map(Number) as [number, number, number];
  let summe = 0;
  for (let j = jv, m = mv; j < jb || (j === jb && m <= mb); m === 12 ? ((j += 1), (m = 1)) : (m += 1)) {
    const tageImMonat = new Date(Date.UTC(j, m, 0)).getUTCDate();
    const start = j === jv && m === mv ? tv : 1;
    const ende = j === jb && m === mb ? tb : tageImMonat;
    summe += Math.max(0, ende - start + 1) / tageImMonat;
  }
  return summe;
}
