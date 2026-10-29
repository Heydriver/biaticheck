import { euro, runde, tageInklusive } from "../hilfen";
import type { Befund, Regel } from "../regel";
import type { Abrechnung } from "../schema";

/** Summe aller Kosten der Wohnung, inkl. Heizkosten, falls separat ausgewiesen. */
export function summeKostenMieter(a: Abrechnung): number {
  const positionen = a.kostenpositionen.reduce((s, p) => s + p.anteilMieter, 0);
  const heizung = a.heizkosten && !a.heizkosten.inKostenpositionenEnthalten ? a.heizkosten.anteilMieter : 0;
  return runde(positionen + heizung);
}

/** Zeitanteil des Mieters bei Ein- oder Auszug während des Abrechnungszeitraums. */
export function zeitanteil(a: Abrechnung): number {
  const z = a.meta.abrechnungszeitraum;
  const n = a.meta.nutzungszeitraum;
  if (!z || !n) return 1;
  return tageInklusive(n.von, n.bis) / tageInklusive(z.von, z.bis);
}

const ZEITANTEILIGE_SCHLUESSEL = new Set(["wohnflaeche", "einheiten", "miteigentumsanteil", "personen"]);

export const R01_Positionsanteil: Regel = {
  id: "R-01",
  version: "1.0.0",
  titel: "Anteil je Kostenposition nachgerechnet",
  bereich: "rechnerisch",
  grundlage: "§ 556a BGB (Umlagemaßstab)",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const faktorZeit = zeitanteil(a);
    const befunde: Befund[] = [];
    let geprueft = 0;

    for (const p of a.kostenpositionen) {
      const s = p.umlageschluessel;
      if (
        p.gesamtkosten === undefined ||
        !s ||
        !ZEITANTEILIGE_SCHLUESSEL.has(s.typ) ||
        s.anteilEinheit === undefined ||
        s.anteilGesamt === undefined
      ) {
        continue;
      }
      geprueft++;
      const erwartet = runde((p.gesamtkosten * s.anteilEinheit) / s.anteilGesamt * faktorZeit);
      const differenz = runde(p.anteilMieter - erwartet);
      if (Math.abs(differenz) <= einstellungen.toleranzEuro) continue;

      befunde.push({
        status: "abweichung",
        titel: `Rechenfehler: ${p.bezeichnung}`,
        erklaerung:
          differenz > 0
            ? `Nach dem angegebenen Schlüssel ergibt sich ein Anteil von ${euro(erwartet)}, berechnet wurden ${euro(p.anteilMieter)} – also ${euro(differenz)} zu viel.`
            : `Nach dem angegebenen Schlüssel ergibt sich ein Anteil von ${euro(erwartet)}, berechnet wurden nur ${euro(p.anteilMieter)}.`,
        naechsterSchritt: differenz > 0 ? "Fordern Sie eine Korrektur dieser Position." : undefined,
        betragZugunstenMieter: differenz,
        positionId: p.id,
        beleg: {
          gesamtkosten: p.gesamtkosten,
          schluessel: s,
          zeitanteil: runde(faktorZeit * 10000) / 10000,
          erwartet,
          berechnet: p.anteilMieter,
          differenz,
        },
      });
    }

    if (befunde.length > 0) return befunde;
    if (geprueft === 0) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Anteile nicht nachrechenbar",
          erklaerung: "Die Abrechnung enthält keine Position mit vollständigen Angaben (Gesamtkosten und Verteilerschlüssel), die sich nachrechnen ließe.",
        },
      ];
    }
    return [
      {
        status: "ok",
        titel: "Anteile korrekt berechnet",
        erklaerung: `${geprueft} Kostenposition(en) nachgerechnet – keine Rechenfehler gefunden.`,
        beleg: { geprueft },
      },
    ];
  },
};

export const R02_Gesamtsumme: Regel = {
  id: "R-02",
  version: "1.0.0",
  titel: "Gesamtsumme der Kosten",
  bereich: "rechnerisch",
  grundlage: "Rechnerische Richtigkeit",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const ausgewiesen = a.ausgewiesen.summeKostenMieter;
    if (ausgewiesen === undefined) return [];
    const berechnet = summeKostenMieter(a);
    const differenz = runde(ausgewiesen - berechnet);
    if (Math.abs(differenz) <= einstellungen.toleranzEuro) {
      return [
        {
          status: "ok",
          titel: "Gesamtsumme stimmt",
          erklaerung: `Die Summe der Einzelpositionen ergibt ${euro(berechnet)} und stimmt mit der Abrechnung überein.`,
          beleg: { ausgewiesen, berechnet },
        },
      ];
    }
    return [
      {
        status: "abweichung",
        titel: "Gesamtsumme falsch addiert",
        erklaerung: `Die Einzelpositionen ergeben ${euro(berechnet)}, ausgewiesen sind ${euro(ausgewiesen)} (Differenz ${euro(differenz)}).`,
        naechsterSchritt: differenz > 0 ? "Fordern Sie eine Korrektur der Gesamtsumme." : undefined,
        betragZugunstenMieter: differenz,
        beleg: { ausgewiesen, berechnet, differenz },
      },
    ];
  },
};

export const R03_Saldo: Regel = {
  id: "R-03",
  version: "1.0.0",
  titel: "Nachzahlung / Guthaben",
  bereich: "rechnerisch",
  grundlage: "Rechnerische Richtigkeit",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const saldo = a.ausgewiesen.saldo;
    if (saldo === undefined) return [];
    if (a.vorauszahlungen === undefined) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Vorauszahlungen nicht angegeben",
          erklaerung: "Die Abrechnung weist keine Vorauszahlungen aus. Ohne sie lässt sich die Nachzahlung bzw. das Guthaben nicht prüfen.",
          rueckfrage: {
            feld: "vorauszahlungen",
            frage: "Wie viel haben Sie im Abrechnungszeitraum insgesamt an Nebenkosten-Vorauszahlungen geleistet?",
          },
        },
      ];
    }
    const kosten = a.ausgewiesen.summeKostenMieter ?? summeKostenMieter(a);
    const erwartet = runde(kosten - a.vorauszahlungen);
    const differenz = runde(saldo - erwartet);
    if (Math.abs(differenz) <= einstellungen.toleranzEuro) {
      return [
        {
          status: "ok",
          titel: "Nachzahlung/Guthaben korrekt",
          erklaerung: `Kosten ${euro(kosten)} abzüglich Vorauszahlungen ${euro(a.vorauszahlungen)} ergeben ${euro(erwartet)}.`,
          beleg: { kosten, vorauszahlungen: a.vorauszahlungen, erwartet },
        },
      ];
    }
    return [
      {
        status: "abweichung",
        titel: "Nachzahlung/Guthaben falsch berechnet",
        erklaerung: `Kosten ${euro(kosten)} abzüglich Vorauszahlungen ${euro(a.vorauszahlungen)} ergeben ${euro(erwartet)}, ausgewiesen sind ${euro(saldo)}.`,
        naechsterSchritt: "Prüfen Sie die angerechneten Vorauszahlungen anhand Ihrer Kontoauszüge und fordern Sie eine Korrektur.",
        betragZugunstenMieter: differenz,
        beleg: { kosten, vorauszahlungen: a.vorauszahlungen, erwartet, ausgewiesen: saldo, differenz },
      },
    ];
  },
};

export const R04_Flaechen: Regel = {
  id: "R-04",
  version: "1.1.0",
  titel: "Einheitliche Flächenangaben",
  bereich: "rechnerisch",
  grundlage: "§ 556a Abs. 1 BGB",
  stand: "entwurf",
  pruefe(a) {
    const flaechenPositionen = a.kostenpositionen.filter((p) => p.umlageschluessel?.typ === "wohnflaeche");
    if (flaechenPositionen.length === 0) return [];

    const wohnflaechen = new Set(flaechenPositionen.map((p) => p.umlageschluessel?.anteilEinheit).filter((x) => x !== undefined));
    const gesamtflaechen = new Set(flaechenPositionen.map((p) => p.umlageschluessel?.anteilGesamt).filter((x) => x !== undefined));
    if (a.flaechen.wohnflaecheMieter !== undefined) wohnflaechen.add(a.flaechen.wohnflaecheMieter);

    const befunde: Befund[] = [];
    if (wohnflaechen.size > 1) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Unterschiedliche Wohnflächen verwendet",
        erklaerung: `In der Abrechnung werden für Ihre Wohnung unterschiedliche Flächen verwendet (${[...wohnflaechen].join(" m², ")} m²).`,
        naechsterSchritt: "Vergleichen Sie die Flächen mit Ihrem Mietvertrag und fragen Sie beim Vermieter nach.",
        beleg: { wohnflaechen: [...wohnflaechen] },
      });
    }
    if (gesamtflaechen.size > 1) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Unterschiedliche Gesamtflächen verwendet",
        erklaerung: `Bei der Verteilung nach Fläche werden unterschiedliche Gesamtflächen angesetzt (${[...gesamtflaechen].join(" m², ")} m²). Das kann berechtigt sein (z. B. Gewerbe ausgenommen), sollte aber erklärt werden.`,
        naechsterSchritt: "Bitten Sie den Vermieter um eine Erläuterung der unterschiedlichen Gesamtflächen.",
        beleg: { gesamtflaechen: [...gesamtflaechen] },
      });
    }
    const h = a.heizkosten;
    const wohnflaeche = a.flaechen.wohnflaecheMieter ?? [...wohnflaechen][0];
    if (h?.flaecheMieter !== undefined && wohnflaeche !== undefined && h.flaecheMieter !== wohnflaeche) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Heizfläche weicht von Wohnfläche ab",
        erklaerung: `In der Heizkostenabrechnung werden für Ihre Wohnung ${h.flaecheMieter} m² angesetzt, in der Betriebskostenabrechnung ${wohnflaeche} m². Das kann berechtigt sein (z. B. unbeheizte Räume), sollte aber erklärt werden.`,
        naechsterSchritt: "Fragen Sie nach, welche Räume nicht als beheizte Fläche zählen.",
        beleg: { heizflaeche: h.flaecheMieter, wohnflaeche, heizGesamtflaeche: h.gesamtflaeche },
      });
    }
    if (befunde.length > 0) return befunde;
    return [
      {
        status: "ok",
        titel: "Flächenangaben einheitlich",
        erklaerung: "Für alle nach Fläche verteilten Positionen werden dieselben Flächen verwendet.",
      },
    ];
  },
};

export const R05_Vorauszahlungen: Regel = {
  id: "R-05",
  version: "1.0.0",
  titel: "Angerechnete Vorauszahlungen plausibel",
  bereich: "rechnerisch",
  grundlage: "§ 556 Abs. 2 BGB; Abgleich mit vereinbarten Vorauszahlungen",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const d = a.vorauszahlungenDetail;
    const zeitraum = a.meta.nutzungszeitraum ?? a.meta.abrechnungszeitraum;
    if (!d?.monatlich || !zeitraum) return [];
    const monate = Math.round(tageInklusive(zeitraum.von, zeitraum.bis) / (365.25 / 12));

    const arten = [
      ["betriebskosten", "Betriebskosten"],
      ["heizkosten", "Heizkosten"],
    ] as const;
    const befunde: Befund[] = [];
    for (const [art, name] of arten) {
      const jahr = d[art];
      const monatlich = d.monatlich[art];
      if (jahr === undefined || monatlich === undefined) continue;
      const erwartet = runde(monatlich * monate);
      const differenz = runde(erwartet - jahr);
      if (Math.abs(differenz) <= Math.max(einstellungen.toleranzEuro, 1)) {
        befunde.push({
          status: "ok",
          titel: `Vorauszahlungen ${name} plausibel`,
          erklaerung: `Angerechnet sind ${euro(jahr)} – das entspricht ${monate} × ${euro(monatlich)}.`,
          beleg: { art, jahr, monatlich, monate },
        });
        continue;
      }
      befunde.push({
        status: "auffaelligkeit",
        titel: `Vorauszahlungen ${name} prüfen`,
        erklaerung: `Angerechnet sind ${euro(jahr)} (Ø ${euro(jahr / monate)} pro Monat). Bei den angegebenen ${euro(monatlich)} pro Monat wären es ${euro(erwartet)} – eine Differenz von ${euro(Math.abs(differenz))}. Möglicherweise wurde die Vorauszahlung im Lauf des Jahres geändert, oder nicht alle Zahlungen wurden berücksichtigt.`,
        naechsterSchritt: "Gleichen Sie die angerechneten Vorauszahlungen mit Ihren Kontoauszügen bzw. Ihrem Mietkonto für den Abrechnungszeitraum ab. Fehlende Zahlungen schriftlich beim Vermieter reklamieren.",
        betragZugunstenMieter: differenz > 0 ? differenz : undefined,
        beleg: { art, jahr, monatlich, monate, erwartet, differenz },
        rueckfrage: {
          feld: `vorauszahlungenDetail.monatlich.${art}`,
          frage: `Wie viel haben Sie im Abrechnungszeitraum monatlich an Vorauszahlung für ${name} gezahlt? (Kontoauszug oder Mietkonto)`,
        },
      });
    }
    return befunde;
  },
};

export const RECHNERISCHE_REGELN = [R01_Positionsanteil, R02_Gesamtsumme, R03_Saldo, R04_Flaechen, R05_Vorauszahlungen];
