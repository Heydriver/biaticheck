import { Abrechnung, ordneKategorieZu, type AbrechnungEingabe, type Kostenposition } from "@biaticheck/pruefkern";
import type { Rohdaten } from "./rohdaten.js";

export interface Umwandlung {
  abrechnung: AbrechnungEingabe;
  /** Hinweise für den Prüfbereich (nicht für den Kunden). */
  hinweise: string[];
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Wandelt die Modellausgabe in das Datenschema des Prüfkerns um. */
export function wandleUm(roh: Rohdaten): Umwandlung {
  const hinweise = [...roh.unsicherheiten.map((u) => `Modell unsicher: ${u}`)];

  const datum = (wert: string | null, feld: string): string | undefined => {
    if (wert === null) return undefined;
    if (ISO_DATUM.test(wert) && !Number.isNaN(Date.parse(wert))) return wert;
    hinweise.push(`Ungültiges Datum in ${feld}: "${wert}" – verworfen`);
    return undefined;
  };
  const wert = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
  const positiv = (v: number | null): number | undefined => (v !== null && v > 0 ? v : undefined);

  const zeitraum = (vonRoh: string | null, bisRoh: string | null, feld: string) => {
    const von = datum(vonRoh, `${feld}.von`);
    const bis = datum(bisRoh, `${feld}.bis`);
    if (!von || !bis) return undefined;
    if (von > bis) {
      hinweise.push(`${feld}: Beginn ${von} liegt nach Ende ${bis} – verworfen`);
      return undefined;
    }
    return { von, bis };
  };

  const kostenpositionen: Kostenposition[] = roh.kostenpositionen.map((p, i) => {
    const vorschlag = ordneKategorieZu(p.bezeichnung);
    if (vorschlag !== "unbekannt" && vorschlag !== p.kategorie) {
      hinweise.push(`Kategorie prüfen: „${p.bezeichnung}“ als ${p.kategorie} eingeordnet, Stichwortsuche ergibt ${vorschlag}`);
    }
    const hatSchluessel = p.schluesselTyp !== null;
    return {
      id: `p${String(i + 1).padStart(2, "0")}`,
      bezeichnung: p.bezeichnung,
      kategorie: p.kategorie,
      gesamtkosten: wert(p.gesamtkosten),
      gesamtkostenVorVorwegabzug: wert(p.gesamtkostenVorVorwegabzug),
      umlageschluessel: hatSchluessel
        ? {
            typ: p.schluesselTyp!,
            anteilEinheit: p.anteilEinheit !== null && p.anteilEinheit >= 0 ? p.anteilEinheit : undefined,
            anteilGesamt: positiv(p.anteilGesamt),
          }
        : undefined,
      anteilMieter: p.anteilMieter,
      steuerlich35a: wert(p.steuerlich35a),
      fundstelle: p.seite !== null && p.seite > 0 ? { seite: p.seite } : undefined,
    };
  });

  const h = roh.heizkosten;
  const co2Vollstaendig =
    h && h.co2EmissionKg !== null && h.co2FlaecheM2 !== null && h.co2FlaecheM2 > 0 && h.co2KostenGesamt !== null && h.co2Vermieteranteil !== null;
  const verbrauchsanteilRoh = h?.verbrauchsanteilProzent ?? null;
  const verbrauchsanteilGueltig = verbrauchsanteilRoh !== null && verbrauchsanteilRoh >= 0 && verbrauchsanteilRoh <= 100;
  if (verbrauchsanteilRoh !== null && !verbrauchsanteilGueltig) {
    hinweise.push(`Verbrauchsanteil ${verbrauchsanteilRoh} % unplausibel – verworfen`);
  }

  const monatlich = {
    betriebskosten: wert(roh.monatlicheVorauszahlungBetriebskosten),
    heizkosten: wert(roh.monatlicheVorauszahlungHeizkosten),
  };
  const hatMonatlich = monatlich.betriebskosten !== undefined || monatlich.heizkosten !== undefined;

  const abrechnung: AbrechnungEingabe = {
    meta: {
      wohnung: wert(roh.wohnung),
      geschoss: wert(roh.geschoss),
      abrechnungszeitraum: zeitraum(roh.abrechnungszeitraumVon, roh.abrechnungszeitraumBis, "abrechnungszeitraum"),
      nutzungszeitraum: zeitraum(roh.nutzungszeitraumVon, roh.nutzungszeitraumBis, "nutzungszeitraum"),
      erstelltAm: datum(roh.erstelltAm, "erstelltAm"),
    },
    flaechen: { wohnflaecheMieter: positiv(roh.wohnflaecheMieter), gesamtflaeche: positiv(roh.gesamtflaeche) },
    kostenpositionen,
    heizkosten: h
      ? {
          gesamtkosten: wert(h.gesamtkosten),
          verbrauchsanteilProzent: verbrauchsanteilGueltig ? verbrauchsanteilRoh : undefined,
          verbrauchErfasst: wert(h.verbrauchErfasst),
          anteilMieter: h.anteilMieter,
          inKostenpositionenEnthalten: false,
          flaecheMieter: positiv(h.flaecheMieter),
          gesamtflaeche: positiv(h.gesamtflaeche),
          warmwasser:
            h.warmwasserKostenGesamt !== null || h.warmwasserVerbrauchM3 !== null
              ? {
                  kostenGesamt: wert(h.warmwasserKostenGesamt),
                  verbrauchGesamtM3: positiv(h.warmwasserVerbrauchM3),
                  energieKwh: positiv(h.warmwasserEnergieKwh),
                }
              : undefined,
          co2: co2Vollstaendig
            ? {
                emissionKg: h.co2EmissionKg!,
                flaecheM2: h.co2FlaecheM2!,
                kostenGesamt: h.co2KostenGesamt!,
                vermieteranteil: h.co2Vermieteranteil!,
              }
            : undefined,
        }
      : undefined,
    vorauszahlungen: wert(roh.vorauszahlungenGesamt),
    vorauszahlungenDetail:
      roh.vorauszahlungenBetriebskosten !== null || roh.vorauszahlungenHeizkosten !== null || hatMonatlich
        ? {
            betriebskosten: wert(roh.vorauszahlungenBetriebskosten),
            heizkosten: wert(roh.vorauszahlungenHeizkosten),
            monatlich: hatMonatlich ? monatlich : undefined,
          }
        : undefined,
    ausgewiesen: { summeKostenMieter: wert(roh.summeKostenMieter), saldo: wert(roh.saldo) },
  };

  // Letzte Sicherung: Das Ergebnis muss dem Schema des Prüfkerns entsprechen.
  const geprueft = Abrechnung.safeParse(abrechnung);
  if (!geprueft.success) {
    throw new Error(`Ausgelesene Daten passen nicht zum Datenschema: ${geprueft.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return { abrechnung, hinweise };
}
