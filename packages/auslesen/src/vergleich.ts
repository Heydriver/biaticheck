import type { AbrechnungEingabe } from "@biaticheck/pruefkern";

/**
 * Vergleicht eine ausgelesene Abrechnung mit dem vom Experten erfassten
 * Golden-Set-Fall. Grundlage, um die Genauigkeit des Auslesens zu messen.
 */
export interface Vergleich {
  felder: number;
  richtig: number;
  quote: number;
  abweichungen: { feld: string; erwartet: unknown; gelesen: unknown }[];
}

const TOLERANZ = 0.011;

function gleich(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= TOLERANZ;
  return a === b;
}

export function vergleiche(golden: AbrechnungEingabe, gelesen: AbrechnungEingabe): Vergleich {
  const abweichungen: Vergleich["abweichungen"] = [];
  let felder = 0;
  const pruefe = (feld: string, erwartet: unknown, ist: unknown) => {
    felder++;
    if (!gleich(erwartet, ist)) abweichungen.push({ feld, erwartet, gelesen: ist });
  };

  pruefe("abrechnungszeitraum.von", golden.meta.abrechnungszeitraum?.von, gelesen.meta.abrechnungszeitraum?.von);
  pruefe("abrechnungszeitraum.bis", golden.meta.abrechnungszeitraum?.bis, gelesen.meta.abrechnungszeitraum?.bis);
  pruefe("erstelltAm", golden.meta.erstelltAm, gelesen.meta.erstelltAm);
  pruefe("geschoss", golden.meta.geschoss, gelesen.meta.geschoss);
  pruefe("wohnflaecheMieter", golden.flaechen?.wohnflaecheMieter, gelesen.flaechen?.wohnflaecheMieter);
  pruefe("gesamtflaeche", golden.flaechen?.gesamtflaeche, gelesen.flaechen?.gesamtflaeche);
  pruefe("vorauszahlungen", golden.vorauszahlungen, gelesen.vorauszahlungen);
  pruefe("summeKostenMieter", golden.ausgewiesen?.summeKostenMieter, gelesen.ausgewiesen?.summeKostenMieter);
  pruefe("saldo", golden.ausgewiesen?.saldo, gelesen.ausgewiesen?.saldo);
  pruefe("heizkosten.anteilMieter", golden.heizkosten?.anteilMieter, gelesen.heizkosten?.anteilMieter);
  pruefe("heizkosten.verbrauchsanteilProzent", golden.heizkosten?.verbrauchsanteilProzent, gelesen.heizkosten?.verbrauchsanteilProzent);
  pruefe("anzahlPositionen", golden.kostenpositionen.length, gelesen.kostenpositionen.length);

  // Positionen über den Betrag zuordnen – Reihenfolge und Wortlaut können abweichen.
  const offen = [...gelesen.kostenpositionen];
  for (const p of golden.kostenpositionen) {
    const index = offen.findIndex((q) => gleich(q.anteilMieter, p.anteilMieter) && gleich(q.gesamtkosten, p.gesamtkosten));
    if (index === -1) {
      pruefe(`position „${p.bezeichnung}“`, p.anteilMieter, "nicht gefunden");
      continue;
    }
    const [q] = offen.splice(index, 1);
    pruefe(`position „${p.bezeichnung}“.anteilMieter`, p.anteilMieter, q!.anteilMieter);
    pruefe(`position „${p.bezeichnung}“.kategorie`, p.kategorie, q!.kategorie);
    pruefe(`position „${p.bezeichnung}“.schluessel`, p.umlageschluessel?.typ, q!.umlageschluessel?.typ);
  }

  const richtig = felder - abweichungen.length;
  return { felder, richtig, quote: Math.round((richtig / felder) * 1000) / 1000, abweichungen };
}
