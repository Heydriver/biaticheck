import { euro, runde, tageInklusive, vergleiche, zahlDE } from "../hilfen";
import type { Befund, Regel } from "../regel";
import { KOSTENKATEGORIEN, NICHT_UMLAGEFAEHIG } from "../schema";

export const I01_NichtUmlagefaehig: Regel = {
  id: "I-01",
  version: "1.0.0",
  titel: "Keine nicht umlagefähigen Kosten",
  bereich: "inhaltlich",
  grundlage: "§ 556 Abs. 1 BGB, § 1 Abs. 2 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    const treffer = a.kostenpositionen.filter((p) => NICHT_UMLAGEFAEHIG.includes(p.kategorie));
    if (treffer.length === 0) {
      return [
        {
          status: "ok",
          titel: "Keine nicht umlagefähigen Kosten erkannt",
          erklaerung: "Verwaltungs-, Instandhaltungs- und Bankkosten wurden nicht umgelegt.",
        },
      ];
    }
    return treffer.map((p) => ({
      status: "abweichung" as const,
      titel: `Nicht umlagefähig: ${p.bezeichnung}`,
      erklaerung: `„${p.bezeichnung}“ gehört zu den Kosten, die Vermieter nicht auf Mieter umlegen dürfen (${KOSTENKATEGORIEN[p.kategorie]}).`,
      naechsterSchritt: `Fordern Sie die Streichung dieser Position (${euro(p.anteilMieter)}).`,
      betragZugunstenMieter: p.anteilMieter,
      positionId: p.id,
      beleg: { kategorie: p.kategorie, anteilMieter: p.anteilMieter },
    }));
  },
};

function normalisiere(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöüß0-9]/g, "");
}

export const I02_SonstigeKosten: Regel = {
  id: "I-02",
  version: "1.0.0",
  titel: "Sonstige Betriebskosten im Mietvertrag vereinbart",
  bereich: "inhaltlich",
  grundlage: "§ 2 Nr. 17 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    const sonstige = a.kostenpositionen.filter((p) => p.kategorie === "sonstige");
    if (sonstige.length === 0) return [];
    const vereinbart = a.mietvertrag?.vereinbarteSonstigeKosten;

    if (vereinbart === undefined) {
      return sonstige.map((p) => ({
        status: "nicht_pruefbar" as const,
        titel: `Vereinbarung prüfen: ${p.bezeichnung}`,
        erklaerung: `„${p.bezeichnung}“ ist eine sonstige Betriebskostenart. Sie darf nur umgelegt werden, wenn sie im Mietvertrag ausdrücklich genannt ist.`,
        positionId: p.id,
        rueckfrage: {
          feld: "mietvertrag.vereinbarteSonstigeKosten",
          frage: "Welche „sonstigen Betriebskosten“ sind in Ihrem Mietvertrag ausdrücklich aufgeführt? (Am besten laden Sie die Seite mit der Betriebskostenvereinbarung hoch.)",
        },
      }));
    }

    const vereinbartNorm = vereinbart.map(normalisiere);
    return sonstige.map((p): Befund => {
      const name = normalisiere(p.bezeichnung);
      const gefunden = vereinbartNorm.some((v) => v.length > 0 && (name.includes(v) || v.includes(name)));
      return gefunden
        ? {
            status: "ok",
            titel: `Vereinbart: ${p.bezeichnung}`,
            erklaerung: `„${p.bezeichnung}“ ist im Mietvertrag als sonstige Betriebskosten vereinbart.`,
            positionId: p.id,
          }
        : {
            status: "abweichung",
            titel: `Nicht vereinbart: ${p.bezeichnung}`,
            erklaerung: `„${p.bezeichnung}“ ist laut Ihren Angaben nicht im Mietvertrag vereinbart und darf daher nicht umgelegt werden.`,
            naechsterSchritt: `Fordern Sie die Streichung dieser Position (${euro(p.anteilMieter)}).`,
            betragZugunstenMieter: p.anteilMieter,
            positionId: p.id,
            beleg: { vereinbart },
          };
    });
  },
};

export const I03_NichtZugeordnet: Regel = {
  id: "I-03",
  version: "1.0.0",
  titel: "Alle Positionen einer Kostenart zuordenbar",
  bereich: "inhaltlich",
  grundlage: "§ 2 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    return a.kostenpositionen
      .filter((p) => p.kategorie === "unbekannt")
      .map((p) => ({
        status: "auffaelligkeit" as const,
        titel: `Unklare Position: ${p.bezeichnung}`,
        erklaerung: `„${p.bezeichnung}“ lässt sich keiner zulässigen Betriebskostenart eindeutig zuordnen.`,
        naechsterSchritt: "Bitten Sie den Vermieter um Erläuterung, welche Kosten sich hinter dieser Position verbergen.",
        positionId: p.id,
        beleg: { anteilMieter: p.anteilMieter },
      }));
  },
};

export const I04_Heizkosten: Regel = {
  id: "I-04",
  version: "1.0.0",
  titel: "Heizkosten verbrauchsabhängig abgerechnet",
  bereich: "inhaltlich",
  grundlage: "§§ 7, 8, 12 HeizkostenV",
  stand: "entwurf",
  pruefe(a) {
    const h = a.heizkosten;
    const hatHeizpositionen = a.kostenpositionen.some((p) =>
      ["heizung", "warmwasser", "verbundene_anlagen"].includes(p.kategorie),
    );
    if (!h) {
      if (!hatHeizpositionen) return [];
      return [
        {
          status: "nicht_pruefbar",
          titel: "Heizkostenabrechnung fehlt",
          erklaerung: "Heizkosten werden abgerechnet, aber die Einzelabrechnung (z. B. von Techem, ista, Brunata) liegt nicht vor.",
          rueckfrage: {
            feld: "heizkosten",
            frage: "Bitte laden Sie die separate Heizkostenabrechnung (Abrechnungsdienst) hoch.",
          },
        },
      ];
    }

    const befunde: Befund[] = [];
    if (h.verbrauchErfasst === false) {
      const kuerzung = runde(h.anteilMieter * 0.15);
      befunde.push({
        status: "abweichung",
        titel: "Heizkosten nicht nach Verbrauch abgerechnet",
        erklaerung: "Ihr Verbrauch wurde nicht erfasst. Werden Heizkosten nicht verbrauchsabhängig abgerechnet, dürfen Sie Ihren Anteil um 15 % kürzen.",
        naechsterSchritt: `Kürzen Sie die Heizkosten um 15 % (${euro(kuerzung)}) und teilen Sie dies dem Vermieter schriftlich mit.`,
        betragZugunstenMieter: kuerzung,
        beleg: { anteilMieter: h.anteilMieter, kuerzung },
      });
    }

    const p = h.verbrauchsanteilProzent;
    if (p === undefined) {
      befunde.push({
        status: "nicht_pruefbar",
        titel: "Verteilung der Heizkosten nicht erkennbar",
        erklaerung: "Aus den Unterlagen geht nicht hervor, welcher Anteil der Heizkosten nach Verbrauch verteilt wird.",
      });
    } else if (p < 50 || p > 70) {
      befunde.push({
        status: "auffaelligkeit",
        titel: `Verbrauchsanteil von ${zahlDE(p)} % ungewöhnlich`,
        erklaerung: `Nach der Heizkostenverordnung sind in der Regel 50–70 % der Kosten nach Verbrauch zu verteilen. Hier sind es ${zahlDE(p)} %.`,
        naechsterSchritt: "Fragen Sie beim Vermieter nach, warum dieser Verteilerschlüssel gewählt wurde.",
        beleg: { verbrauchsanteilProzent: p },
      });
    }

    if (befunde.length > 0) return befunde;
    return [
      {
        status: "ok",
        titel: "Heizkosten verbrauchsabhängig verteilt",
        erklaerung: `${zahlDE(p ?? 0)} % der Heizkosten werden nach Verbrauch verteilt – im zulässigen Rahmen.`,
      },
    ];
  },
};

/** Ende der Übergangsfrist für die Umlage von Kabel-/Antennenkosten. */
const KABEL_STICHTAG = "2024-07-01";

export const I05_KabelTV: Regel = {
  id: "I-05",
  version: "1.0.0",
  titel: "Kabel-/SAT-Kosten nur bis 30.06.2024 umlagefähig",
  bereich: "inhaltlich",
  grundlage: "§ 2 Nr. 15 BetrKV i. V. m. § 230 Abs. 4 TKG",
  stand: "entwurf",
  pruefe(a) {
    const z = a.meta.abrechnungszeitraum;
    if (!z || vergleiche(z.bis, KABEL_STICHTAG) < 0) return [];
    return a.kostenpositionen
      .filter((p) => p.kategorie === "antenne_kabel")
      .map((p): Befund => {
        if (vergleiche(z.von, KABEL_STICHTAG) >= 0) {
          return {
            status: "abweichung",
            titel: `Nicht mehr umlagefähig: ${p.bezeichnung}`,
            erklaerung: `Seit dem 01.07.2024 dürfen Kosten für Kabel-TV bzw. Gemeinschaftsantenne nicht mehr über die Nebenkosten abgerechnet werden.`,
            naechsterSchritt: `Fordern Sie die Streichung dieser Position (${euro(p.anteilMieter)}).`,
            betragZugunstenMieter: p.anteilMieter,
            positionId: p.id,
          };
        }
        const tageGesamt = tageInklusive(z.von, z.bis);
        const tageDanach = tageInklusive(KABEL_STICHTAG, z.bis);
        const geschaetzt = runde((p.anteilMieter * tageDanach) / tageGesamt);
        return {
          status: "auffaelligkeit",
          titel: `Zeitraum prüfen: ${p.bezeichnung}`,
          erklaerung: `Kabel-/SAT-Kosten dürfen nur bis zum 30.06.2024 umgelegt werden. Aus der Abrechnung geht nicht eindeutig hervor, dass nur Kosten bis zu diesem Tag enthalten sind. Zeitanteilig entfielen bis zu ${euro(geschaetzt)} auf die Zeit danach.`,
          naechsterSchritt: "Lassen Sie sich per Belegeinsicht zeigen, für welchen Zeitraum diese Kosten angefallen sind.",
          betragZugunstenMieter: geschaetzt,
          positionId: p.id,
          beleg: { tageGesamt, tageDanach, anteilMieter: p.anteilMieter },
        };
      });
  },
};

export const I06_AufzugErdgeschoss: Regel = {
  id: "I-06",
  version: "1.0.0",
  titel: "Aufzugskosten bei Erdgeschosswohnung",
  bereich: "inhaltlich",
  grundlage: "BGH, Urt. v. 20.09.2006 – VIII ZR 103/06; Mietvertrag",
  stand: "entwurf",
  pruefe(a) {
    if (a.meta.geschoss === undefined || a.meta.geschoss > 0) return [];
    const aufzug = a.kostenpositionen.filter((p) => p.kategorie === "aufzug");
    if (aufzug.length === 0) return [];
    const summe = runde(aufzug.reduce((s, p) => s + p.anteilMieter, 0));
    const ausgenommen = a.mietvertrag?.aufzugAusgenommen;
    if (ausgenommen === true) {
      return [
        {
          status: "abweichung",
          titel: "Aufzugskosten trotz Ausnahme im Mietvertrag",
          erklaerung: `Ihr Mietvertrag nimmt Erdgeschosswohnungen von den Aufzugskosten aus. Trotzdem wurden ${euro(summe)} berechnet.`,
          naechsterSchritt: `Fordern Sie die Streichung der Aufzugskosten (${euro(summe)}).`,
          betragZugunstenMieter: summe,
        },
      ];
    }
    if (ausgenommen === false) return [];
    return [
      {
        status: "nicht_pruefbar",
        titel: "Aufzugskosten im Erdgeschoss",
        erklaerung: `Sie wohnen im Erdgeschoss und zahlen ${euro(summe)} Aufzugskosten. Das ist grundsätzlich zulässig, außer Ihr Mietvertrag nimmt Erdgeschosswohnungen ausdrücklich aus oder der Aufzug erschließt Ihre Wohnung gar nicht (z. B. separater Eingang).`,
        rueckfrage: {
          feld: "mietvertrag.aufzugAusgenommen",
          frage: "Enthält Ihr Mietvertrag eine Regelung, nach der Erdgeschosswohnungen keine Aufzugskosten tragen? Erreichen Sie über den Aufzug z. B. Keller oder Tiefgarage?",
        },
        beleg: { summe },
      },
    ];
  },
};

export const I07_WartungMitReparatur: Regel = {
  id: "I-07",
  version: "1.0.0",
  titel: "Wartungskosten ohne Reparaturanteil",
  bereich: "inhaltlich",
  grundlage: "§ 1 Abs. 2 Nr. 2 BetrKV; § 2 Nr. 7 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    return a.kostenpositionen
      .filter(
        (p) =>
          p.kategorie !== "instandhaltung" &&
          (p.steuerlich35a === "handwerker" || (p.kategorie === "aufzug" && /wart/i.test(p.bezeichnung))),
      )
      .map((p) => ({
        status: "auffaelligkeit" as const,
        titel: `Reparaturanteil prüfen: ${p.bezeichnung}`,
        erklaerung:
          `In „${p.bezeichnung}“ (Gesamtkosten ${p.gesamtkosten !== undefined ? euro(p.gesamtkosten) : "unbekannt"}, Ihr Anteil ${euro(p.anteilMieter)}) können Reparaturen enthalten sein` +
          (p.steuerlich35a === "handwerker" ? " – die Position ist als Handwerkerleistung gekennzeichnet." : ".") +
          " Umlagefähig sind nur Prüfung und Wartung. Bei Vollwartungsverträgen muss der Reparaturanteil herausgerechnet werden.",
        naechsterSchritt: "Verlangen Sie Einsicht in den Wartungsvertrag und die Rechnungen. Enthält der Vertrag Reparaturen, muss der Anteil abgezogen werden.",
        positionId: p.id,
        beleg: { gesamtkosten: p.gesamtkosten, steuerlich35a: p.steuerlich35a },
      }));
  },
};

/** Stufenmodell nach Anlage zum CO2KostAufG: [ab kg CO₂/m²/Jahr, Vermieteranteil]. */
const CO2_STUFEN: [number, number][] = [
  [52, 0.95],
  [47, 0.8],
  [42, 0.7],
  [37, 0.6],
  [32, 0.5],
  [27, 0.4],
  [22, 0.3],
  [17, 0.2],
  [12, 0.1],
  [0, 0],
];

export function co2Vermieterquote(kgProQmJahr: number): number {
  return CO2_STUFEN.find(([ab]) => kgProQmJahr >= ab)?.[1] ?? 0;
}

export const I08_CO2Aufteilung: Regel = {
  id: "I-08",
  version: "1.0.0",
  titel: "CO₂-Kosten korrekt aufgeteilt",
  bereich: "inhaltlich",
  grundlage: "§§ 5, 6 CO2KostAufG mit Anlage",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const c = a.heizkosten?.co2;
    if (!c) return [];
    const kgProQm = c.emissionKg / c.flaecheM2;
    const quote = co2Vermieterquote(kgProQm);
    const erwartet = runde(c.kostenGesamt * quote);
    const differenz = runde(erwartet - c.vermieteranteil);
    const beleg = { kgProQm: runde(kgProQm), vermieterquote: quote, erwartet, abgerechnet: c.vermieteranteil };
    if (Math.abs(differenz) <= Math.max(einstellungen.toleranzEuro, 1)) {
      return [
        {
          status: "ok",
          titel: "CO₂-Kosten korrekt aufgeteilt",
          erklaerung: `Bei ${zahlDE(kgProQm)} kg CO₂ pro m² trägt der Vermieter ${Math.round(quote * 100)} % der CO₂-Kosten (${euro(erwartet)}) – das ist berücksichtigt.`,
          beleg,
        },
      ];
    }
    return [
      {
        status: "abweichung",
        titel: "CO₂-Kosten falsch aufgeteilt",
        erklaerung: `Bei ${zahlDE(kgProQm)} kg CO₂ pro m² müsste der Vermieter ${Math.round(quote * 100)} % der CO₂-Kosten tragen, also ${euro(erwartet)} für das Haus. Berücksichtigt sind ${euro(c.vermieteranteil)}.`,
        naechsterSchritt: "Fordern Sie eine Korrektur der CO₂-Kostenaufteilung.",
        beleg: { ...beleg, differenzHaus: differenz },
      },
    ];
  },
};

export const INHALTLICHE_REGELN = [
  I01_NichtUmlagefaehig,
  I02_SonstigeKosten,
  I03_NichtZugeordnet,
  I04_Heizkosten,
  I05_KabelTV,
  I06_AufzugErdgeschoss,
  I07_WartungMitReparatur,
  I08_CO2Aufteilung,
];
