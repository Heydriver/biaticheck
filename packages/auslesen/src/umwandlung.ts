import { Abrechnung, ordneKategorieZu, type AbrechnungEingabe, type Kostenposition } from "@biaticheck/pruefkern";
import type { Rohdaten } from "./rohdaten";

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
  const plzOderNichts = (v: string | null): string | undefined => {
    if (v === null) return undefined;
    const ziffern = v.replace(/\s/g, "");
    if (/^\d{5}$/.test(ziffern)) return ziffern;
    hinweise.push(`Ungültige PLZ "${v}" – verworfen`);
    return undefined;
  };
  const positiv = (v: number | null): number | undefined => (v !== null && v > 0 ? v : undefined);
  const normal = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]/g, "");

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
      unterart: p.unterart ?? undefined,
      bestandteile: p.bestandteile.length ? p.bestandteile.filter((b) => Number.isFinite(b.betrag) && b.bezeichnung.trim()) : undefined,
      hinweise: p.hinweise.length ? p.hinweise.map((t) => t.trim()).filter(Boolean) : undefined,
      belegnummer: p.belegnummer?.trim() || undefined,
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
  const hatGezahlt = roh.gezahlteVorauszahlungenBetriebskosten !== null || roh.gezahlteVorauszahlungenHeizkosten !== null || roh.gezahlteVorauszahlungenGesamt !== null;
  const hatMonatlich = monatlich.betriebskosten !== undefined || monatlich.heizkosten !== undefined;

  const abrechnung: AbrechnungEingabe = {
    meta: {
      wohnung: wert(roh.wohnung),
      plz: plzOderNichts(roh.plz),
      geschoss: wert(roh.geschoss),
      abrechnungszeitraum: zeitraum(roh.abrechnungszeitraumVon, roh.abrechnungszeitraumBis, "abrechnungszeitraum"),
      nutzungszeitraum: zeitraum(roh.nutzungszeitraumVon, roh.nutzungszeitraumBis, "nutzungszeitraum"),
      erstelltAm: datum(roh.erstelltAm, "erstelltAm"),
    },
    flaechen: { wohnflaecheMieter: positiv(roh.wohnflaecheMieter), gesamtflaeche: positiv(roh.gesamtflaeche) },
    kostenpositionen,
    zaehler: roh.zaehler
      .filter((x) => x.anfang >= 0 && x.ende >= x.anfang)
      .map((x) => ({ art: x.art, bezeichnung: x.bezeichnung ?? undefined, anfang: x.anfang, ende: x.ende, verbrauchUebernommen: x.verbrauchUebernommen !== null && x.verbrauchUebernommen >= 0 ? x.verbrauchUebernommen : undefined, faktor: positiv(x.faktor), faktorLautProtokoll: positiv(x.faktorLautProtokoll), seite: x.seite !== null && x.seite > 0 ? x.seite : undefined })),
    belege: roh.belege.flatMap((b) => {
      const name = normal(b.positionBezeichnung);
      const position = kostenpositionen.find((p) => normal(p.bezeichnung) === name) ?? kostenpositionen.find((p) => name.length >= 4 && (normal(p.bezeichnung).includes(name) || name.includes(normal(p.bezeichnung))));
      const zuPosition = position?.id ?? (/heiz|wärme|waerme|warmwasser/.test(name) ? "heizkosten" : undefined);
      if (!zuPosition || !(b.betrag >= 0)) {
        hinweise.push(`Beleg „${b.bezeichnung}“ konnte keiner Position zugeordnet werden (${b.positionBezeichnung})`);
        return [];
      }
      return [{ zuPosition, bezeichnung: b.bezeichnung, art: b.art, betrag: b.betrag, uebernommen: b.uebernommen !== null && b.uebernommen >= 0 ? b.uebernommen : undefined, objekt: b.objekt?.trim() || undefined, fremdesObjekt: b.fremdesObjekt || undefined, beruecksichtigt: b.beruecksichtigt ?? undefined, seite: b.seite !== null && b.seite > 0 ? b.seite : undefined }];
    }),
    erlaeuterungen: roh.erlaeuterungen.map((e) => ({ text: e.text.trim(), ...(e.seite !== null && e.seite > 0 ? { seite: e.seite } : {}) })).filter((e) => e.text),
    heizkosten: h
      ? {
          gesamtkosten: wert(h.gesamtkosten),
          verbrauchsanteilProzent: verbrauchsanteilGueltig ? verbrauchsanteilRoh : undefined,
          verbrauchErfasst: wert(h.verbrauchErfasst),
          anteilMieter: h.anteilMieter,
          inKostenpositionenEnthalten: false,
          verbrauchMieter: h.verbrauchMieter !== null && h.verbrauchMieter >= 0 ? h.verbrauchMieter : undefined,
          verbrauchskostenMieter: wert(h.verbrauchskostenMieter),
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
      roh.vorauszahlungenBetriebskosten !== null || roh.vorauszahlungenHeizkosten !== null || hatMonatlich || hatGezahlt
        ? {
            gezahlt: hatGezahlt
              ? {
                  betriebskosten: wert(roh.gezahlteVorauszahlungenBetriebskosten),
                  heizkosten: wert(roh.gezahlteVorauszahlungenHeizkosten),
                  gesamt: wert(roh.gezahlteVorauszahlungenGesamt),
                  seite: roh.gezahlteVorauszahlungenSeite !== null && roh.gezahlteVorauszahlungenSeite > 0 ? roh.gezahlteVorauszahlungenSeite : undefined,
                }
              : undefined,
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
