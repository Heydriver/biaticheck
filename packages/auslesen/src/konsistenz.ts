import type { AbrechnungEingabe } from "@biaticheck/pruefkern";

/**
 * Selbstkontrolle nach dem Auslesen.
 *
 * Stimmen die ausgelesenen Zahlen untereinander nicht, liegt entweder ein
 * Lesefehler oder ein echter Fehler in der Abrechnung vor. In beiden Fällen
 * darf das Ergebnis nicht automatisch an den Kunden gehen – ein Experte prüft.
 */
export interface Konsistenz {
  konsistent: boolean;
  gruende: string[];
}

const TOLERANZ_EURO = 1;

const fast = (a: number, b: number, toleranz = TOLERANZ_EURO) => Math.abs(a - b) <= toleranz;
const r = (n: number) => Math.round(n * 100) / 100;

export function pruefeKonsistenz(a: AbrechnungEingabe): Konsistenz {
  const gruende: string[] = [];

  if (a.kostenpositionen.length === 0) gruende.push("Keine Kostenpositionen ausgelesen");
  if (!a.meta.abrechnungszeitraum) gruende.push("Abrechnungszeitraum fehlt");

  const summePositionen = a.kostenpositionen.reduce((s, p) => s + p.anteilMieter, 0);
  const summe = r(summePositionen + (a.heizkosten?.anteilMieter ?? 0));
  const ausgewiesen = a.ausgewiesen?.summeKostenMieter;
  if (ausgewiesen === undefined) gruende.push("Gesamtsumme der Kosten nicht ausgelesen");
  else if (!fast(summe, ausgewiesen)) gruende.push(`Positionen ergeben ${summe} €, ausgewiesen sind ${ausgewiesen} €`);

  const saldo = a.ausgewiesen?.saldo;
  if (saldo === undefined) gruende.push("Abrechnungsergebnis (Saldo) nicht ausgelesen");
  if (saldo !== undefined && ausgewiesen !== undefined && a.vorauszahlungen !== undefined) {
    const erwartet = r(ausgewiesen - a.vorauszahlungen);
    if (!fast(erwartet, saldo)) gruende.push(`Summe − Vorauszahlungen = ${erwartet} €, ausgewiesener Saldo ${saldo} €`);
  }

  const d = a.vorauszahlungenDetail;
  if (d?.betriebskosten !== undefined && d.heizkosten !== undefined && a.vorauszahlungen !== undefined) {
    const teilsumme = r(d.betriebskosten + d.heizkosten);
    if (!fast(teilsumme, a.vorauszahlungen)) {
      gruende.push(`Vorauszahlungen Betriebs- + Heizkosten = ${teilsumme} €, gesamt ausgelesen ${a.vorauszahlungen} €`);
    }
  }

  // Grobe Nachrechnung je Position: große Abweichungen deuten eher auf Lesefehler als auf Rundung hin.
  for (const p of a.kostenpositionen) {
    const s = p.umlageschluessel;
    if (p.gesamtkosten === undefined || !s || s.anteilEinheit === undefined || !s.anteilGesamt) continue;
    if (s.typ === "direkt" || s.typ === "sonstig") continue;
    const erwartet = (p.gesamtkosten * s.anteilEinheit) / s.anteilGesamt;
    if (!fast(erwartet, p.anteilMieter, Math.max(TOLERANZ_EURO, erwartet * 0.02))) {
      gruende.push(`„${p.bezeichnung}“: ${p.gesamtkosten} × ${s.anteilEinheit}/${s.anteilGesamt} = ${r(erwartet)} €, ausgelesen ${p.anteilMieter} €`);
    }
  }

  return { konsistent: gruende.length === 0, gruende };
}
