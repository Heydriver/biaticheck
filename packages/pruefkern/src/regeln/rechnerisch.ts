import { findeAussagen, texteZu } from "../textanalyse";
import { datumDE, euro, runde, tageInklusive, zahlDE } from "../hilfen";
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
        naechsterSchritt: "Fordern Sie eine Korrektur des Abrechnungsergebnisses.",
        betragZugunstenMieter: differenz,
        beleg: { kosten, vorauszahlungen: a.vorauszahlungen, erwartet, ausgewiesen: saldo, differenz },
      },
    ];
  },
};

const LEERSTAND = /leerstand|leerstehend|leer stehend|leersteht|leer steht|unvermietet|nicht vermietet/i;

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
    // Flächennenner je Position gegen die in der Abrechnung genannte Gesamtfläche
    // Gesamtfläche laut Abrechnung; fehlt sie, die Fläche, die die Mehrheit der Positionen verwendet (mindestens 3)
    const nenner = flaechenPositionen.map((p) => p.umlageschluessel?.anteilGesamt).filter((x): x is number => x !== undefined);
    const haeufigster = [...new Set(nenner)].map((x) => [x, nenner.filter((y) => y === x).length] as const).sort((x, y) => y[1] - x[1])[0];
    const hausflaeche = a.flaechen.gesamtflaeche ?? (haeufigster && haeufigster[1] >= 3 && haeufigster[1] > nenner.length / 2 ? haeufigster[0] : undefined);
    const geprueft = new Set<string>();
    if (hausflaeche) {
      for (const p of flaechenPositionen) {
        const u = p.umlageschluessel!;
        if (u.anteilGesamt === undefined || u.anteilGesamt === hausflaeche || u.anteilEinheit === undefined || p.gesamtkosten === undefined) continue;
        geprueft.add(p.id);
        const korrekt = (p.gesamtkosten * u.anteilEinheit) / hausflaeche;
        const zuViel = runde(p.anteilMieter - korrekt);
        const heizung = ["heizung", "warmwasser", "verbundene_anlagen"].includes(p.kategorie);
        const begruendet =
          p.gesamtkostenVorVorwegabzug !== undefined ||
          findeAussagen(texteZu(p, a).erlaeuterungen.concat(p.hinweise ?? []), /gewerbe|ausgenommen|nicht beheizt|unbeheizt|beheizte fläche|vorwegabzug/i).length > 0;
        // § 7 Abs. 1 Satz 5 HeizkostenV erlaubt für Grundkosten die Fläche der beheizten Räume. Sicher falsch ist
        // der Nenner nur, wenn die Abrechnung selbst die beheizte Gesamtfläche anders angibt.
        const widerspruch = heizung ? a.heizkosten?.gesamtflaeche === hausflaeche : false;
        // Leerstand als Grund: Den Anteil leer stehender Flächen trägt der Vermieter (BGH VIII ZR 159/05) – sicherer Fehler
        const texte = texteZu(p, a);
        const leerstand = u.anteilGesamt < hausflaeche ? findeAussagen([...texte.eigene, ...texte.erlaeuterungen], LEERSTAND).find((x) => !x.verneint) : undefined;
        const sicher = zuViel > 0 && (Boolean(leerstand) || (widerspruch && !begruendet));
        const rechnung = `${euro(p.gesamtkosten)} × ${zahlDE(u.anteilEinheit)} / ${zahlDE(hausflaeche)} m² = ${euro(runde(korrekt))}`;
        befunde.push({
          status: sicher ? "abweichung" : "auffaelligkeit",
          titel: leerstand ? `Leerstand herausgerechnet: ${p.bezeichnung}` : `Falscher Flächennenner: ${p.bezeichnung}`,
          erklaerung:
            `„${p.bezeichnung}“ wird auf ${zahlDE(u.anteilGesamt)} m² verteilt, die Abrechnung nennt als Gesamtfläche aber ${zahlDE(hausflaeche)} m²` +
            (widerspruch ? " (auch für die Heizkosten)" : "") +
            `. Mit ${zahlDE(hausflaeche)} m² ergibt sich Ihr Anteil zu ${rechnung} statt ${euro(p.anteilMieter)}.` +
            (leerstand ? ` Als Grund nennt die Abrechnung Leerstand („${leerstand.text}“). Leer stehende Flächen dürfen den Anteil der anderen Mieter nicht erhöhen.` : "") +
            (sicher ? "" : heizung ? " Eine kleinere Fläche ist nur zulässig, wenn es die Fläche der beheizten Räume ist." : " Eine kleinere Fläche kann berechtigt sein (z. B. Gewerbe ausgenommen), muss aber erklärt werden."),
          naechsterSchritt: sicher ? `Fordern Sie die Korrektur Ihres Anteils (${euro(zuViel)} weniger).` : "Bitten Sie um eine Erklärung der kleineren Gesamtfläche.",
          betragZugunstenMieter: zuViel > 0 ? zuViel : undefined,
          positionId: p.id,
          textstelle: `${p.bezeichnung}: ${zahlDE(u.anteilEinheit)} / ${zahlDE(u.anteilGesamt)} m²`,
          beleg: { leerstand: leerstand?.text, nenner: u.anteilGesamt, hausflaeche, gesamtkosten: p.gesamtkosten, einheit: u.anteilEinheit, korrekt: runde(korrekt), abgerechnet: p.anteilMieter, zuViel },
        });
      }
    }
    if (wohnflaechen.size > 1) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Unterschiedliche Wohnflächen verwendet",
        erklaerung: `In der Abrechnung werden für Ihre Wohnung unterschiedliche Flächen verwendet (${[...wohnflaechen].map((f) => zahlDE(f!)).join(" m², ")} m²).`,
        naechsterSchritt: "Vergleichen Sie die Flächen mit Ihrem Mietvertrag und fragen Sie beim Vermieter nach.",
        beleg: { wohnflaechen: [...wohnflaechen] },
      });
    }
    if (gesamtflaechen.size > 1 && flaechenPositionen.some((p) => !geprueft.has(p.id) && p.umlageschluessel?.anteilGesamt !== hausflaeche)) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Unterschiedliche Gesamtflächen verwendet",
        erklaerung: `Bei der Verteilung nach Fläche werden unterschiedliche Gesamtflächen angesetzt (${[...gesamtflaechen].map((f) => zahlDE(f!)).join(" m², ")} m²). Das kann berechtigt sein (z. B. Gewerbe ausgenommen), sollte aber erklärt werden.`,
        naechsterSchritt: "Bitten Sie den Vermieter um eine Erläuterung der unterschiedlichen Gesamtflächen.",
        beleg: { gesamtflaechen: [...gesamtflaechen] },
      });
    }
    const h = a.heizkosten;
    const wohnflaeche = a.flaechen.wohnflaecheMieter ?? [...wohnflaechen][0];
    if (h?.flaecheMieter !== undefined && wohnflaeche !== undefined && h.flaecheMieter !== wohnflaeche) {
      // § 7 Abs. 1 Satz 5 HeizkostenV erlaubt die Fläche der beheizten Räume – ohne weiteren Anhaltspunkt nur ein Hinweis
      befunde.push({
        status: "hinweis",
        titel: "Heizfläche weicht von Wohnfläche ab",
        erklaerung: `In der Heizkostenabrechnung werden für Ihre Wohnung ${zahlDE(h.flaecheMieter)} m² angesetzt, in der Betriebskostenabrechnung ${zahlDE(wohnflaeche)} m². Für Heizkosten darf die Fläche der beheizten Räume verwendet werden (§ 7 Abs. 1 HeizkostenV). Das ist daher kein Fehler.`,
        naechsterSchritt: "Bei Interesse: Fragen Sie, welche Räume nicht als beheizte Fläche zählen.",
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

/** Erste Tage aller Monate im Zeitraum (ISO). */
function monatsanfaenge(von: string, bis: string): string[] {
  const liste: string[] = [];
  let [j, m] = [Number(von.slice(0, 4)), Number(von.slice(5, 7))];
  const ende = bis.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const iso = `${j}-${String(m).padStart(2, "0")}-01`;
    if (iso.slice(0, 7) > ende) break;
    liste.push(iso);
    m++;
    if (m > 12) [j, m] = [j + 1, 1];
  }
  return liste;
}

/**
 * Prüft die angerechneten Vorauszahlungen.
 * - Ohne Beleg (nur ein Monatsbetrag): Eine Differenz ist häufig eine Anpassung im Lauf des Jahres.
 *   Deshalb nur „Prüfbedarf“ mit Anforderung der Vorjahresabrechnung – kein Einsparpotenzial.
 * - Mit belegtem Verlauf: Summe Monat für Monat; eine verbleibende Differenz zugunsten des Mieters ist ein Fehler.
 */
export const R05_Vorauszahlungen: Regel = {
  id: "R-05",
  version: "2.0.0",
  titel: "Angerechnete Vorauszahlungen plausibel",
  bereich: "rechnerisch",
  grundlage: "§ 556 Abs. 2 BGB; Abgleich mit den tatsächlich geleisteten Vorauszahlungen",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const d = a.vorauszahlungenDetail;
    const zeitraum = a.meta.nutzungszeitraum ?? a.meta.abrechnungszeitraum;
    if (!d || !zeitraum || (!d.monatlich && !d.verlauf?.length && !d.gezahlt)) return [];
    const monate = monatsanfaenge(zeitraum.von, zeitraum.bis);
    const toleranz = Math.max(einstellungen.toleranzEuro, 1);
    const verlauf = [...(d.verlauf ?? [])].sort((x, y) => x.ab.localeCompare(y.ab));
    const quelle = d.verlaufQuelle === "kontoauszug" ? "Ihren Zahlungsbelegen" : d.verlaufQuelle === "vorjahresabrechnung" ? "der Vorjahresabrechnung" : "Ihren Angaben";

    const arten = [
      ["betriebskosten", "Betriebskosten"],
      ["heizkosten", "Heizkosten"],
    ] as const;
    const befunde: Befund[] = [];
    for (const [art, name] of arten) {
      const jahr = d[art];
      if (jahr === undefined) continue;

      // Die Abrechnung belegt die Zahlungen selbst (Buchungsübersicht): direkter Vergleich, sicherer Fehler
      const gezahlt = d.gezahlt?.[art];
      if (gezahlt !== undefined) {
        const differenz = runde(gezahlt - jahr);
        const stelle = d.gezahlt?.seite ? ` (Seite ${d.gezahlt.seite})` : "";
        if (differenz > toleranz) {
          befunde.push({
            status: "abweichung",
            titel: `Vorauszahlungen ${name} unvollständig angerechnet`,
            erklaerung: `Die Zahlungsübersicht der Abrechnung${stelle} belegt ${euro(gezahlt)} Vorauszahlungen für ${name}. Angerechnet wurden nur ${euro(jahr)}. Es fehlen ${euro(differenz)}.`,
            naechsterSchritt: `Fordern Sie die Anrechnung der fehlenden ${euro(differenz)}.`,
            betragZugunstenMieter: differenz,
            textstelle: `Zahlungsübersicht${stelle}: ${euro(gezahlt)}; angerechnet: ${euro(jahr)}`,
            beleg: { art, jahr, summe: gezahlt, differenz, quelle: "dokument", seite: d.gezahlt?.seite },
          });
        } else {
          befunde.push({ status: "ok", titel: `Vorauszahlungen ${name} vollständig angerechnet`, erklaerung: `Belegt und angerechnet: ${euro(jahr)}.`, beleg: { art, jahr, summe: gezahlt, differenz, quelle: "dokument" } });
        }
        continue;
      }

      const belegt = verlauf.some((v) => v[art] !== undefined);
      if (belegt) {
        // Monatsbetrag je Monat: letzter Eintrag, der zu Monatsbeginn gilt; davor der bisherige Monatsbetrag
        let fehlt = false;
        const summe = runde(
          monate.reduce((s, monat) => {
            const gilt = [...verlauf].reverse().find((v) => v.ab <= monat && v[art] !== undefined)?.[art] ?? d.monatlich?.[art] ?? verlauf.find((v) => v[art] !== undefined)?.[art];
            if (gilt === undefined) fehlt = true;
            return s + (gilt ?? 0);
          }, 0),
        );
        if (fehlt) continue;
        const differenz = runde(summe - jahr);
        if (differenz > toleranz) {
          befunde.push({
            status: "abweichung",
            titel: `Vorauszahlungen ${name} zu niedrig angerechnet`,
            erklaerung: `Laut ${quelle} haben Sie im Abrechnungszeitraum ${euro(summe)} gezahlt, angerechnet wurden nur ${euro(jahr)}. Es fehlen ${euro(differenz)}.`,
            naechsterSchritt: `Fordern Sie die Anrechnung der fehlenden ${euro(differenz)} und legen Sie Ihre Zahlungsnachweise bei.`,
            betragZugunstenMieter: differenz,
            beleg: { art, jahr, summe, differenz, verlauf, quelle: d.verlaufQuelle },
          });
        } else {
          befunde.push({
            status: "ok",
            titel: `Vorauszahlungen ${name} korrekt angerechnet`,
            erklaerung: `Laut ${quelle} entsprechen die angerechneten ${euro(jahr)} Ihren Zahlungen (${euro(summe)}).`,
            beleg: { art, jahr, summe, differenz, verlauf, quelle: d.verlaufQuelle },
          });
        }
        continue;
      }

      const monatlich = d.monatlich?.[art];
      if (monatlich === undefined) continue;
      const erwartet = runde(monatlich * monate.length);
      const differenz = runde(erwartet - jahr);
      if (Math.abs(differenz) <= toleranz || differenz < 0) {
        befunde.push({
          status: "ok",
          titel: `Vorauszahlungen ${name} plausibel`,
          erklaerung: `Angerechnet sind ${euro(jahr)} – das entspricht ${monate.length} × ${euro(monatlich)}${differenz < -toleranz ? " oder mehr" : ""}.`,
          beleg: { art, jahr, monatlich, monate: monate.length },
        });
        continue;
      }
      befunde.push({
        status: "pruefbedarf",
        titel: `Vorauszahlungen ${name} prüfen`,
        erklaerung: `Angerechnet sind ${euro(jahr)}. Mit ${euro(monatlich)} im Monat wären es ${euro(erwartet)} – bis zu ${euro(differenz)} mehr. Häufig wurde die Vorauszahlung aber im Lauf des Jahres angepasst. Ob wirklich Geld fehlt, zeigen die Vorjahresabrechnung oder Ihre Kontoauszüge.`,
        naechsterSchritt: "Laden Sie die Abrechnung des Vorjahres hoch.",
        betragZugunstenMieter: differenz,
        beleg: { art, jahr, monatlich, monate: monate.length, erwartet, differenz },
        unterlagen: ["vorjahresabrechnung"],
      });
    }
    const gesamtGezahlt = d.gezahlt?.gesamt;
    if (gesamtGezahlt !== undefined && a.vorauszahlungen !== undefined && !befunde.some((b) => b.beleg?.quelle === "dokument")) {
      const differenz = runde(gesamtGezahlt - a.vorauszahlungen);
      if (differenz > toleranz)
        befunde.push({
          status: "abweichung",
          titel: "Vorauszahlungen unvollständig angerechnet",
          erklaerung: `Die Zahlungsübersicht der Abrechnung belegt ${euro(gesamtGezahlt)} Vorauszahlungen. Angerechnet wurden nur ${euro(a.vorauszahlungen)}. Es fehlen ${euro(differenz)}.`,
          naechsterSchritt: `Fordern Sie die Anrechnung der fehlenden ${euro(differenz)}.`,
          betragZugunstenMieter: differenz,
          beleg: { art: "gesamt", jahr: a.vorauszahlungen, summe: gesamtGezahlt, differenz, quelle: "dokument", seite: d.gezahlt?.seite },
        });
    }
    return befunde;
  },
};

/** Kosten, die mit der Zeit anfallen (nicht nach Verbrauch oder direkt zugeordnet). */
const zeitabhaengig = (p: Abrechnung["kostenpositionen"][number]) => p.umlageschluessel?.typ !== "verbrauch" && p.umlageschluessel?.typ !== "direkt";

/**
 * Ein- oder Auszug im Abrechnungsjahr: Hat das Mietverhältnis laut Mietvertrag erst im Jahr begonnen (oder
 * im Jahr geendet), dürfen zeitabhängige Kosten nur zeitanteilig berechnet werden.
 */
export const R06_EinAuszug: Regel = {
  id: "R-06",
  version: "1.0.0",
  titel: "Zeitanteil bei Ein- oder Auszug",
  bereich: "rechnerisch",
  grundlage: "§ 556a Abs. 1 BGB; § 535 BGB",
  stand: "entwurf",
  pruefe(a) {
    const z = a.meta.abrechnungszeitraum;
    const mv = a.mietvertrag;
    if (!z || (!mv?.mietbeginn && !mv?.mietende)) return [];
    const von = mv.mietbeginn && mv.mietbeginn > z.von ? mv.mietbeginn : z.von;
    const bis = mv.mietende && mv.mietende < z.bis ? mv.mietende : z.bis;
    if (von === z.von && bis === z.bis) return [];
    const n = a.meta.nutzungszeitraum;
    if (n && n.von >= von && n.bis <= bis) {
      return [{ status: "ok", titel: "Ein- oder Auszug berücksichtigt", erklaerung: `Die Abrechnung berücksichtigt Ihre Mietzeit (${datumDE(n.von)} bis ${datumDE(n.bis)}).` }];
    }
    const tageGesamt = tageInklusive(z.von, z.bis);
    const tageMiete = Math.max(0, tageInklusive(von, bis));
    const zeitKosten = runde(a.kostenpositionen.filter(zeitabhaengig).reduce((x, p) => x + p.anteilMieter, 0));
    const zuViel = runde(zeitKosten * (1 - tageMiete / tageGesamt));
    return [
      {
        status: "auffaelligkeit",
        titel: "Ein- oder Auszug nicht berücksichtigt",
        erklaerung: `Laut Mietvertrag haben Sie die Wohnung im Abrechnungszeitraum nur vom ${datumDE(von)} bis ${datumDE(bis)} gemietet (${tageMiete} von ${tageGesamt} Tagen). Die Abrechnung berechnet die Kosten aber für den ganzen Zeitraum. Zeitabhängige Kosten dürfen nur anteilig berechnet werden.`,
        naechsterSchritt: `Fordern Sie eine Abrechnung nur für Ihre Mietzeit. Zeitanteilig sind das bis zu ${euro(zuViel)} weniger.`,
        betragZugunstenMieter: zuViel > 0 ? zuViel : undefined,
        beleg: { von, bis, tageMiete, tageGesamt, zeitKosten, zuViel },
      },
    ];
  },
};

/**
 * Wohnfläche: Die Abrechnung setzt mehr Fläche an als der Mietvertrag. Maßgeblich ist die tatsächliche Fläche
 * (BGH VIII ZR 220/17) – die Abweichung muss geklärt werden; bis dahin Auffälligkeit mit geschätztem Betrag.
 */
export const R07_WohnflaecheMietvertrag: Regel = {
  id: "R-07",
  version: "1.0.0",
  titel: "Wohnfläche passt zum Mietvertrag",
  bereich: "rechnerisch",
  grundlage: "§ 556a Abs. 1 BGB; BGH, Urt. v. 30.05.2018 – VIII ZR 220/17",
  stand: "entwurf",
  pruefe(a) {
    const vertrag = a.mietvertrag?.wohnflaeche;
    const abrechnung = a.flaechen?.wohnflaecheMieter;
    if (!vertrag || !abrechnung) return [];
    const abweichung = (abrechnung - vertrag) / vertrag;
    if (abweichung <= 0.03) {
      return [{ status: "ok", titel: "Wohnfläche passt zum Mietvertrag", erklaerung: `Die Abrechnung setzt ${zahlDE(abrechnung)} m² an, der Mietvertrag nennt ${zahlDE(vertrag)} m².`, beleg: { vertrag, abrechnung } }];
    }
    const flaechenKosten = runde(a.kostenpositionen.filter((p) => p.umlageschluessel?.typ === "wohnflaeche").reduce((x, p) => x + p.anteilMieter, 0));
    const zuViel = runde(flaechenKosten * (1 - vertrag / abrechnung));
    return [
      {
        status: "auffaelligkeit",
        titel: "Mehr Wohnfläche als im Mietvertrag",
        erklaerung: `Die Abrechnung setzt ${zahlDE(abrechnung)} m² an, Ihr Mietvertrag nennt ${zahlDE(vertrag)} m² (${zahlDE(abweichung * 100, 1)} % mehr). Maßgeblich ist die tatsächliche Fläche. Stimmt die Fläche aus dem Mietvertrag, zahlen Sie bei den nach Fläche verteilten Kosten bis zu ${euro(zuViel)} zu viel.`,
        naechsterSchritt: "Fordern Sie eine Begründung für die angesetzte Fläche, zum Beispiel eine Wohnflächenberechnung.",
        betragZugunstenMieter: zuViel > 0 ? zuViel : undefined,
        beleg: { vertrag, abrechnung, flaechenKosten, zuViel },
      },
    ];
  },
};

export const RECHNERISCHE_REGELN = [R01_Positionsanteil, R02_Gesamtsumme, R03_Saldo, R04_Flaechen, R05_Vorauszahlungen, R06_EinAuszug, R07_WohnflaecheMietvertrag];
