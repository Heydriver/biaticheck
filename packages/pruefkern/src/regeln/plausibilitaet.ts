import { euro, runde, tageInklusive } from "../hilfen.js";
import type { Befund, Regel } from "../regel.js";
import { KOSTENKATEGORIEN } from "../schema.js";

export const P01_Vorjahresvergleich: Regel = {
  id: "P-01",
  version: "1.0.0",
  titel: "Vergleich mit dem Vorjahr",
  bereich: "plausibilitaet",
  grundlage: "Wirtschaftlichkeitsgebot, § 556 Abs. 3 Satz 1 Hs. 2 BGB",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    if (!a.vorjahr) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Kein Vorjahresvergleich möglich",
          erklaerung: "Mit der Abrechnung des Vorjahres können wir auffällige Kostensteigerungen erkennen.",
          rueckfrage: { feld: "vorjahr", frage: "Laden Sie gern die Nebenkostenabrechnung des Vorjahres hoch." },
        },
      ];
    }

    const vorjahrJeKategorie = new Map<string, number>();
    for (const p of a.vorjahr.kostenpositionen) {
      vorjahrJeKategorie.set(p.kategorie, (vorjahrJeKategorie.get(p.kategorie) ?? 0) + p.anteilMieter);
    }
    const aktuellJeKategorie = new Map<string, number>();
    for (const p of a.kostenpositionen) {
      aktuellJeKategorie.set(p.kategorie, (aktuellJeKategorie.get(p.kategorie) ?? 0) + p.anteilMieter);
    }

    const befunde: Befund[] = [];
    for (const [kategorie, aktuell] of aktuellJeKategorie) {
      const vorher = vorjahrJeKategorie.get(kategorie);
      const name = KOSTENKATEGORIEN[kategorie as keyof typeof KOSTENKATEGORIEN];
      if (vorher === undefined) {
        if (kategorie === "unbekannt") continue;
        befunde.push({
          status: "auffaelligkeit",
          titel: `Neue Kostenart: ${name}`,
          erklaerung: `Diese Kostenart (${euro(aktuell)}) wurde im Vorjahr nicht abgerechnet.`,
          naechsterSchritt: "Fragen Sie nach, warum diese Kosten neu hinzugekommen sind und ob sie vertraglich vereinbart sind.",
          beleg: { kategorie, aktuell },
        });
        continue;
      }
      const steigerung = aktuell - vorher;
      const quote = vorher > 0 ? steigerung / vorher : Infinity;
      if (quote > einstellungen.vorjahrSteigerungSchwelle && steigerung > einstellungen.vorjahrSteigerungMindestEuro) {
        befunde.push({
          status: "auffaelligkeit",
          titel: `Starker Anstieg: ${name}`,
          erklaerung: `Die Kosten sind von ${euro(vorher)} auf ${euro(aktuell)} gestiegen (+${Math.round(quote * 100)} %).`,
          naechsterSchritt: "Verlangen Sie Belegeinsicht für diese Kostenart und eine Erklärung für den Anstieg.",
          beleg: { kategorie, vorher, aktuell, steigerung: runde(steigerung), quote: runde(quote) },
        });
      }
    }

    if (befunde.length > 0) return befunde;
    return [
      {
        status: "ok",
        titel: "Keine auffälligen Steigerungen",
        erklaerung: "Im Vergleich zum Vorjahr sind keine Kostenarten auffällig gestiegen.",
      },
    ];
  },
};

export const P02_KostenProQm: Regel = {
  id: "P-02",
  version: "1.0.0",
  titel: "Kosten pro m² im üblichen Rahmen",
  bereich: "plausibilitaet",
  grundlage: "Vergleich mit Betriebskostenspiegel (Schwellenwert vom Expertenteam festzulegen)",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const flaeche = a.flaechen.wohnflaecheMieter;
    const zeitraum = a.meta.nutzungszeitraum ?? a.meta.abrechnungszeitraum;
    if (!flaeche || !zeitraum) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Kosten pro m² nicht berechenbar",
          erklaerung: "Für den Vergleich mit üblichen Werten fehlen Wohnfläche oder Abrechnungszeitraum.",
          rueckfrage: flaeche ? undefined : { feld: "flaechen.wohnflaecheMieter", frage: "Wie groß ist Ihre Wohnung laut Mietvertrag (in m²)?" },
        },
      ];
    }
    const ohneHeizung = a.kostenpositionen
      .filter((p) => !["heizung", "warmwasser", "verbundene_anlagen"].includes(p.kategorie))
      .reduce((s, p) => s + p.anteilMieter, 0);
    const monate = tageInklusive(zeitraum.von, zeitraum.bis) / (365.25 / 12);
    const proQmMonat = runde(ohneHeizung / flaeche / monate);
    const schwelle = einstellungen.kostenProQmMonatSchwelle;

    if (proQmMonat > schwelle) {
      return [
        {
          status: "auffaelligkeit",
          titel: "Überdurchschnittlich hohe Nebenkosten",
          erklaerung: `Ihre kalten Nebenkosten liegen bei ${euro(proQmMonat)} pro m² und Monat. Das liegt über dem üblichen Rahmen von etwa ${euro(schwelle)}.`,
          naechsterSchritt: "Lassen Sie sich die Belege der größten Kostenpositionen zeigen.",
          beleg: { proQmMonat, schwelle, ohneHeizung: runde(ohneHeizung), flaeche, monate: runde(monate) },
        },
      ];
    }
    return [
      {
        status: "ok",
        titel: "Nebenkosten im üblichen Rahmen",
        erklaerung: `Ihre kalten Nebenkosten liegen bei ${euro(proQmMonat)} pro m² und Monat.`,
        beleg: { proQmMonat, schwelle },
      },
    ];
  },
};

export const P03_Warmwasser: Regel = {
  id: "P-03",
  version: "1.0.0",
  titel: "Warmwasserkosten pro m³ im üblichen Rahmen",
  bereich: "plausibilitaet",
  grundlage: "Wirtschaftlichkeitsgebot; § 9 HeizkostenV (Schwellenwert vom Expertenteam festzulegen)",
  stand: "entwurf",
  pruefe(a, { einstellungen }) {
    const w = a.heizkosten?.warmwasser;
    if (!w?.kostenGesamt || !w.verbrauchGesamtM3) return [];
    const proM3 = runde(w.kostenGesamt / w.verbrauchGesamtM3);
    const kwhProM3 = w.energieKwh ? runde(w.energieKwh / w.verbrauchGesamtM3) : undefined;
    const schwelle = einstellungen.warmwasserProM3Schwelle;
    const beleg = { proM3, kwhProM3, schwelle, kostenGesamt: w.kostenGesamt, verbrauchGesamtM3: w.verbrauchGesamtM3 };
    if (proM3 <= schwelle) {
      return [
        {
          status: "ok",
          titel: "Warmwasserkosten im üblichen Rahmen",
          erklaerung: `Warmwasser kostet im Haus ${euro(proM3)} pro m³.`,
          beleg,
        },
      ];
    }
    return [
      {
        status: "auffaelligkeit",
        titel: "Hohe Warmwasserkosten",
        erklaerung:
          `Warmwasser kostet im Haus ${euro(proM3)} pro m³ – deutlich mehr als üblich (bis etwa ${euro(schwelle)}).` +
          (kwhProM3 ? ` Für jeden m³ Warmwasser werden ${kwhProM3} kWh Wärme aufgewendet; hohe Werte deuten auf Verluste in der Anlage (z. B. Zirkulation) hin.` : ""),
        naechsterSchritt: "Verlangen Sie Belegeinsicht in die Warmwasserkosten (Energie, Entkalkung, Wartung) und fragen Sie nach Maßnahmen gegen Wärmeverluste.",
        beleg,
      },
    ];
  },
};

export const PLAUSIBILITAETS_REGELN = [P01_Vorjahresvergleich, P02_KostenProQm, P03_Warmwasser];
