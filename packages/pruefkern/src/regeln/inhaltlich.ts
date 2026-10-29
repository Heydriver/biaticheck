import { euro, runde } from "../hilfen.js";
import type { Befund, Regel } from "../regel.js";
import { KOSTENKATEGORIEN, NICHT_UMLAGEFAEHIG } from "../schema.js";

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
        titel: `Verbrauchsanteil von ${p} % ungewöhnlich`,
        erklaerung: `Nach der Heizkostenverordnung sind in der Regel 50–70 % der Kosten nach Verbrauch zu verteilen. Hier sind es ${p} %.`,
        naechsterSchritt: "Fragen Sie beim Vermieter nach, warum dieser Verteilerschlüssel gewählt wurde.",
        beleg: { verbrauchsanteilProzent: p },
      });
    }

    if (befunde.length > 0) return befunde;
    return [
      {
        status: "ok",
        titel: "Heizkosten verbrauchsabhängig verteilt",
        erklaerung: `${p} % der Heizkosten werden nach Verbrauch verteilt – im zulässigen Rahmen.`,
      },
    ];
  },
};

export const INHALTLICHE_REGELN = [I01_NichtUmlagefaehig, I02_SonstigeKosten, I03_NichtZugeordnet, I04_Heizkosten];
