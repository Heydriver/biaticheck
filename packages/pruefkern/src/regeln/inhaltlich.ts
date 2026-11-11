import { euro, monateZwischen, runde, tageInklusive, vergleiche, zahlDE } from "../hilfen";
import { anteilVon, ausgewieseneTeile, bewerteReparatur, findeAussagen, REPARATUR, texteZu, wasserart } from "../textanalyse";
import type { Befund, Regel } from "../regel";
import { KOSTENKATEGORIEN, NICHT_UMLAGEFAEHIG, type Kostenposition } from "../schema";

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

/**
 * Wartung ohne Reparaturanteil (§ 2 Nr. 7 BetrKV; § 1 Abs. 2 Nr. 2 BetrKV).
 *
 * Umlagefähig sind laut § 2 Nr. 7 BetrKV u. a. Betriebsstrom, Beaufsichtigung, Bedienung, Überwachung und
 * Pflege, regelmäßige Prüfung der Betriebsbereitschaft und -sicherheit einschließlich Einstellung sowie
 * Reinigung. „Betrieb, Wartung und Prüfung“ ist daher kein Anhaltspunkt für Reparaturen.
 *
 * Konkreter Befund nur bei
 * 1. ausdrücklich ausgewiesenem Reparaturbestandteil → Fehler, nur dieser Anteil (geht einer pauschalen
 *    Ausschlusserklärung vor, weil der Beleg konkreter ist),
 * 2. Vollwartungsvertrag ohne Aufschlüsselung → Prüfbedarf ohne Betrag (Höhe des Reparaturanteils unbekannt),
 * 3. Bezeichnung nennt Reparaturen ausdrücklich (nicht verneint) → Prüfbedarf ohne Betrag.
 * Eine ausdrückliche Verneinung im Dokument („enthalten keine Reparaturkosten“) wird als Dokumentaussage
 * vermerkt; ohne widersprechenden Beleg entsteht kein Befund.
 */
export const I07_WartungMitReparatur: Regel = {
  id: "I-07",
  version: "2.0.0",
  titel: "Wartungskosten ohne Reparaturanteil",
  bereich: "inhaltlich",
  grundlage: "§ 2 Nr. 7 BetrKV; § 1 Abs. 2 Nr. 2 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    // Alle Positionen außer Hauswart (eigene Regel I-11) und bereits als Instandhaltung eingeordneten (I-01)
    const kandidaten = a.kostenpositionen.filter((p) => !NICHT_UMLAGEFAEHIG.includes(p.kategorie) && p.kategorie !== "hauswart");
    const befunde: Befund[] = [];
    for (const p of kandidaten) {
      const wartung = WARTUNGSKATEGORIEN.has(p.kategorie) || /wart|prüf|pruef/i.test(p.bezeichnung);
      const r = bewerteReparatur(p, a);
      // Gartenpflege: Erneuerung von Pflanzen ist umlagefähig (§ 2 Nr. 10 BetrKV) – Texte dort nicht als Reparatur werten
      if (p.kategorie === "gartenpflege" && r.bestandteile.every((b) => !/reparatur|instandsetz/i.test(b.bezeichnung))) continue;
      // Leistungsnachweis oder Fußnote der Position beschreibt die Arbeit selbst als Reparatur
      const imNachweis = r.bestandteile.length === 0 ? findeAussagen(p.hinweise ?? [], REPARATUR).find((x) => !x.verneint) : undefined;
      if (imNachweis && !/wart|prüf|pruef/i.test(p.bezeichnung) && (p.kategorie === "sonstige" || p.kategorie === "unbekannt" || /unterhalt|instand|baulich/i.test(p.bezeichnung))) {
        befunde.push({
          status: "abweichung",
          titel: `Reparaturkosten umgelegt: ${p.bezeichnung}`,
          erklaerung: `Laut Leistungsnachweis wurden mit „${p.bezeichnung}“ (${p.gesamtkosten !== undefined ? `${euro(p.gesamtkosten)}, ` : ""}Ihr Anteil ${euro(p.anteilMieter)}) Reparaturen bezahlt: „${imNachweis.text}“ Reparaturen und Instandsetzung sind keine Betriebskosten und dürfen nicht umgelegt werden.`,
          naechsterSchritt: `Fordern Sie die Streichung dieser Position (${euro(p.anteilMieter)}).`,
          betragZugunstenMieter: p.anteilMieter,
          positionId: p.id,
          textstelle: imNachweis.text,
          beleg: { gesamtkosten: p.gesamtkosten, anteilMieter: p.anteilMieter, ganzePosition: true },
        });
        continue;
      }
      if (r.bestandteile.length > 0) {
        const haus = runde(r.bestandteile.reduce((x, b) => x + b.betrag, 0));
        const anteil = anteilVon(p, haus);
        const liste = r.bestandteile.map((b) => `„${b.bezeichnung}“ ${euro(b.betrag)}`).join(", ");
        befunde.push({
          status: anteil !== undefined ? "abweichung" : "auffaelligkeit",
          titel: `Reparaturkosten in ${p.bezeichnung}`,
          erklaerung:
            `In „${p.bezeichnung}“ sind Reparaturkosten ausdrücklich ausgewiesen: ${liste}.` +
            (anteil !== undefined ? ` Auf Ihre Wohnung entfallen davon ${euro(runde(anteil))}.` : "") +
            " Reparaturen und Instandsetzung trägt der Vermieter. Prüfung und Wartung bleiben umlagefähig." +
            (r.ausschluss ? ` Die Abrechnung erklärt zwar „${r.ausschluss.text}“, die Aufstellung weist die Reparatur aber aus.` : ""),
          naechsterSchritt: anteil !== undefined ? `Fordern Sie den Abzug des Reparaturanteils (${euro(runde(anteil))}).` : "Fordern Sie den Abzug des Reparaturanteils.",
          betragZugunstenMieter: anteil !== undefined ? runde(anteil) : undefined,
          positionId: p.id,
          textstelle: liste,
          beleg: { gesamtkosten: p.gesamtkosten, reparaturHaus: haus, anteilMieter: p.anteilMieter, ausschlussImDokument: r.ausschluss?.text },
        });
        continue;
      }
      if (r.vollwartung || r.genannt) {
        const quelle = (r.vollwartung ?? r.genannt)!;
        befunde.push({
          status: "pruefbedarf",
          titel: r.vollwartung ? `Vollwartung ohne Aufschlüsselung: ${p.bezeichnung}` : `Reparaturen genannt: ${p.bezeichnung}`,
          erklaerung:
            (r.vollwartung
              ? `„${quelle.text}“ deutet auf einen Vollwartungsvertrag hin. Darin sind meist auch Reparaturen enthalten, die nicht umgelegt werden dürfen.`
              : `„${quelle.text}“ nennt Reparaturen. Reparaturen dürfen nicht umgelegt werden.`) +
            " Wie hoch der Reparaturanteil ist, steht nicht in der Abrechnung. Ihr Anteil an der Position ist kein Einsparbetrag.",
          naechsterSchritt: "Verlangen Sie Einsicht in den Wartungsvertrag und die Rechnungen. Der Reparaturanteil muss herausgerechnet werden.",
          positionId: p.id,
          betroffen: p.anteilMieter,
          textstelle: quelle.text,
          unterlagen: ["rechnungen"],
          beleg: { gesamtkosten: p.gesamtkosten, anteilMieter: p.anteilMieter, ausschlussImDokument: r.ausschluss?.text },
        });
        continue;
      }
      if (!wartung) continue;
      befunde.push({
        status: "ok",
        titel: `Keine Reparaturen erkennbar: ${p.bezeichnung}`,
        erklaerung: r.ausschluss
          ? `Die Abrechnung erklärt: „${r.ausschluss.text}“ Es gibt keinen gegenteiligen Beleg.`
          : "Betrieb, Wartung und Prüfung sind umlagefähig. Es gibt keinen Hinweis auf Reparaturen.",
        positionId: p.id,
        textstelle: r.ausschluss?.text,
      });
    }
    return befunde;
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

/** Monate im Zeitraum (gerundet). */
const monateIm = monateZwischen;
const HAUSWART_DURCHSCHNITT = 0.37; // € je m² und Monat, DMB-Betriebskostenspiegel 2024 (bundesweit)
/** Kostenarten mit Wartungs- und Prüfleistungen, in denen Reparaturen stecken können. */
const WARTUNGSKATEGORIEN = new Set(["aufzug", "heizung", "warmwasser", "verbundene_anlagen", "antenne_kabel", "sonstige", "waeschepflege", "beleuchtung"]);

/**
 * Wasser nach Verbrauch (§ 556a Abs. 1 Satz 2 BGB; § 2 Nr. 2 und 3 BetrKV).
 *
 * Gilt nur für Frischwasser und Schmutzwasser (dieses wird üblicherweise nach dem Frischwasserverbrauch
 * berechnet). Niederschlagswasser hängt nicht vom Verbrauch ab: die Gemeinde berechnet es nach der
 * angeschlossenen bzw. versiegelten Grundstücksfläche, die Verteilung auf die Mieter nach Wohnfläche ist
 * der gesetzliche Regelfall (§ 556a Abs. 1 Satz 1 BGB). Sammelpositionen („Wasser/Abwasser“) werden
 * nicht automatisch der Verbrauchsregel unterworfen, sondern zuerst ihr Inhalt geklärt.
 */
export const I09_WasserNachVerbrauch: Regel = {
  id: "I-09",
  version: "2.0.0",
  titel: "Wasser nach Verbrauch abgerechnet",
  bereich: "inhaltlich",
  grundlage: "§ 556a Abs. 1 Satz 2 BGB; § 2 Nr. 2, 3 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    const mitSchluessel = a.kostenpositionen.filter((p) => wasserart(p) !== undefined && p.umlageschluessel && !/z[äa]hler/i.test(p.bezeichnung));
    const nichtVerbrauch = (p: (typeof mitSchluessel)[number]) => p.umlageschluessel!.typ !== "verbrauch" && p.umlageschluessel!.typ !== "direkt";
    const verbrauchsabhaengig = mitSchluessel.filter((p) => wasserart(p) === "frischwasser" || wasserart(p) === "schmutzwasser");
    const sammel = mitSchluessel.filter((p) => wasserart(p) === "wasser_abwasser" && nichtVerbrauch(p));
    const befunde: Befund[] = [];
    if (verbrauchsabhaengig.length === 0 && sammel.length === 0) return [];

    const nachFlaeche = verbrauchsabhaengig.filter(nichtVerbrauch);
    const zaehler = a.ausstattung?.wasserzaehler;
    const namen = nachFlaeche.map((p) => `„${p.bezeichnung}“`).join(", ");
    const summe = runde(nachFlaeche.reduce((x, p) => x + p.anteilMieter, 0));
    if (verbrauchsabhaengig.length > 0 && nachFlaeche.length === 0) {
      befunde.push({ status: "ok", titel: "Wasser nach Verbrauch abgerechnet", erklaerung: "Frisch- und Schmutzwasser werden nach Ihrem Verbrauch verteilt." });
    } else if (nachFlaeche.length > 0 && zaehler === false) {
      befunde.push({ status: "ok", titel: "Wasser nach Fläche zulässig", erklaerung: "Ohne erfassten Verbrauch darf Wasser nach Fläche oder Personen verteilt werden." });
    } else if (nachFlaeche.length > 0 && zaehler === true) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Wasser nicht nach Verbrauch abgerechnet",
        erklaerung: `${namen} (${euro(summe)}) werden nicht nach Verbrauch verteilt, obwohl Ihre Wohnung einen Wasserzähler hat. Wird der Verbrauch aller Wohnungen erfasst, muss danach abgerechnet werden.`,
        naechsterSchritt: "Fragen Sie, ob alle Wohnungen Wasserzähler haben. Wenn ja, fordern Sie eine Abrechnung nach Verbrauch und geben Sie Ihre Zählerstände an.",
        betroffen: summe,
        beleg: { positionen: nachFlaeche.map((p) => p.id), summe },
      });
    } else if (nachFlaeche.length > 0) {
      befunde.push({
        status: "nicht_pruefbar",
        titel: "Frischwasser nach Fläche verteilt",
        erklaerung: `${namen} werden nicht nach Verbrauch verteilt. Das ist zulässig, solange der Verbrauch nicht in allen Wohnungen erfasst wird.`,
        naechsterSchritt: "Beantworten Sie die Frage nach dem Wasserzähler.",
        beleg: { positionen: nachFlaeche.map((p) => p.id), summe },
        rueckfrage: { feld: "ausstattung.wasserzaehler", frage: "Hat Ihre Wohnung einen eigenen Wasserzähler (meist im Bad oder unter der Spüle)?" },
      });
    }
    for (const p of sammel) {
      if (zaehler !== true) continue;
      befunde.push({
        status: "hinweis",
        titel: `Inhalt unklar: ${p.bezeichnung}`,
        erklaerung: `„${p.bezeichnung}“ wird nach ${p.umlageschluessel!.typ === "wohnflaeche" ? "Fläche" : "einem festen Schlüssel"} verteilt. Die Position kann Frischwasser, Schmutzwasser und Niederschlagswasser zusammenfassen. Nur verbrauchsabhängige Teile müssten nach Verbrauch verteilt werden.`,
        naechsterSchritt: "Fragen Sie, welche Kosten in der Position enthalten sind.",
        positionId: p.id,
      });
    }
    return befunde;
  },
};

/**
 * Entwässerung nicht doppelt berechnet (§ 2 Nr. 3 BetrKV): Niederschlagswasser darf nur einmal enthalten sein –
 * entweder als eigene Position oder in der Entwässerung, nicht in beiden.
 */
export const I15_EntwaesserungDoppelt: Regel = {
  id: "I-15",
  version: "1.0.0",
  titel: "Niederschlagswasser nicht doppelt berechnet",
  bereich: "inhaltlich",
  grundlage: "§ 2 Nr. 3 BetrKV; § 556 Abs. 3 BGB",
  stand: "entwurf",
  pruefe(a) {
    const regen = a.kostenpositionen.filter((p) => wasserart(p) === "niederschlagswasser");
    if (regen.length === 0) return [];
    const befunde: Befund[] = [];
    if (regen.length > 1) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Niederschlagswasser mehrfach berechnet?",
        erklaerung: `Niederschlagswasser erscheint in ${regen.length} Positionen (${regen.map((p) => `„${p.bezeichnung}“ ${euro(p.anteilMieter)}`).join(", ")}). Die Gebühr fällt nur einmal an.`,
        naechsterSchritt: "Fragen Sie, ob es sich um unterschiedliche Gebühren handelt, und verlangen Sie den Gebührenbescheid.",
        betroffen: runde(regen.slice(1).reduce((x, p) => x + p.anteilMieter, 0)),
        unterlagen: ["rechnungen"],
        beleg: { positionen: regen.map((p) => p.id) },
      });
    }
    const sammel = a.kostenpositionen.filter((p) => wasserart(p) === "wasser_abwasser" && p.kategorie === "entwaesserung");
    const hinweis = sammel.find((p) => findeAussagen([p.bezeichnung, ...(p.hinweise ?? [])], /niederschlag|regenwasser|oberflächenwasser/i).some((x) => !x.verneint));
    if (hinweis) {
      befunde.push({
        status: "auffaelligkeit",
        titel: "Niederschlagswasser doppelt enthalten?",
        erklaerung: `Neben „${regen[0]!.bezeichnung}“ nennt auch „${hinweis.bezeichnung}“ Niederschlagswasser. Dieselbe Gebühr darf nicht zweimal umgelegt werden.`,
        naechsterSchritt: "Verlangen Sie den Gebührenbescheid der Gemeinde für die Entwässerung.",
        positionId: hinweis.id,
        betroffen: regen[0]!.anteilMieter,
        unterlagen: ["rechnungen"],
      });
    }
    if (befunde.length === 0) {
      befunde.push({
        status: "ok",
        titel: "Niederschlagswasser korrekt behandelt",
        erklaerung: "Niederschlagswasser ist einmal enthalten. Es hängt nicht vom Wasserverbrauch ab und darf nach Fläche verteilt werden.",
        positionId: regen[0]!.id,
      });
    }
    return befunde;
  },
};

/**
 * Rauchwarnmelder: Wartung und Prüfung sind umlagefähig, Miete und Leasing nicht (BGH, Urt. v. 11.05.2022 –
 * VIII ZR 379/20). Ist der Mietanteil ausgewiesen, wird nur dieser beanstandet.
 */
export const I10_Rauchwarnmelder: Regel = {
  id: "I-10",
  version: "2.0.0",
  titel: "Rauchwarnmelder ohne Mietkosten",
  bereich: "inhaltlich",
  grundlage: "BGH VIII ZR 379/20; § 2 Nr. 17 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    const MIETE = /miet|leasing/i;
    return a.kostenpositionen
      .filter((p) => /rauch(warn)?melder|rwm\b/i.test(p.bezeichnung))
      .map((p): Befund => {
        const mietteile = (p.bestandteile ?? []).filter((b) => MIETE.test(b.bezeichnung));
        if (mietteile.length > 0) {
          const haus = runde(mietteile.reduce((x, b) => x + b.betrag, 0));
          const anteil = anteilVon(p, haus);
          const liste = mietteile.map((b) => `„${b.bezeichnung}“ ${euro(b.betrag)}`).join(", ");
          return {
            status: anteil !== undefined ? "abweichung" : "auffaelligkeit",
            titel: `Mietkosten Rauchwarnmelder: ${p.bezeichnung}`,
            erklaerung: `In „${p.bezeichnung}“ (Ihr Anteil ${euro(p.anteilMieter)}) ist Miete für die Geräte ausgewiesen: ${liste}.${anteil !== undefined ? ` Auf Ihre Wohnung entfallen ${euro(runde(anteil))}.` : ""} Die Miete darf nicht umgelegt werden, die Wartung schon.`,
            naechsterSchritt: anteil !== undefined ? `Fordern Sie den Abzug des Mietanteils (${euro(runde(anteil))}).` : "Fordern Sie den Abzug des Mietanteils.",
            betragZugunstenMieter: anteil !== undefined ? runde(anteil) : undefined,
            positionId: p.id,
            textstelle: liste,
            beleg: { gesamtkosten: p.gesamtkosten, mieteHaus: haus, anteilMieter: p.anteilMieter },
          };
        }
        const miete = findeAussagen([p.bezeichnung, ...(p.hinweise ?? [])], MIETE).find((x) => !x.verneint);
        const wartung = /wart|pr[üu]f|service|kontrolle/i.test(p.bezeichnung);
        if (miete && !wartung)
          return {
            status: "abweichung",
            titel: `Mietkosten Rauchwarnmelder: ${p.bezeichnung}`,
            erklaerung: `„${p.bezeichnung}“ (${euro(p.anteilMieter)}) sind Mietkosten für Rauchwarnmelder. Diese dürfen nicht als Betriebskosten umgelegt werden, nur die Wartung.`,
            naechsterSchritt: `Fordern Sie die Streichung dieser Position (${euro(p.anteilMieter)}).`,
            betragZugunstenMieter: p.anteilMieter,
            positionId: p.id,
            textstelle: miete.text,
          };
        if (miete)
          return {
            status: "pruefbedarf",
            titel: `Miete in Rauchwarnmeldern? ${p.bezeichnung}`,
            erklaerung: `„${p.bezeichnung}“ (${euro(p.anteilMieter)}) enthält neben der Wartung auch Miete für die Geräte. Die Miete darf nicht umgelegt werden. Wie hoch sie ist, steht nicht in der Abrechnung.`,
            naechsterSchritt: "Verlangen Sie die Rechnung des Dienstleisters mit Miete und Wartung getrennt. Der Mietanteil ist abzuziehen.",
            positionId: p.id,
            betroffen: p.anteilMieter,
            textstelle: miete.text,
            unterlagen: ["rechnungen"],
          };
        return { status: "ok", titel: `Rauchwarnmelder: ${p.bezeichnung}`, erklaerung: "Wartung und Prüfung der Rauchwarnmelder sind umlagefähig.", positionId: p.id };
      });
  },
};

/**
 * Hauswart ohne Reparatur- und Verwaltungsanteil (§ 2 Nr. 14 BetrKV).
 * Konkreter Anhaltspunkt: Bezeichnung oder Hinweis nennt Reparaturen, Verwaltung oder Bereitschaft (nicht verneint).
 * Hohe Kosten im Vergleich zum Bundesdurchschnitt sind nur ein statistischer Hinweis.
 */
export const I11_Hauswart: Regel = {
  id: "I-11",
  version: "2.0.0",
  titel: "Hauswart ohne Reparatur- und Verwaltungsanteil",
  bereich: "inhaltlich",
  grundlage: "§ 2 Nr. 14 BetrKV; § 1 Abs. 2 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    const zeitraum = a.meta.nutzungszeitraum ?? a.meta.abrechnungszeitraum;
    const flaeche = a.flaechen?.wohnflaecheMieter;
    const NICHT_UMLAGEFAEHIG = /reparatur|instand|verwalt|mietkont|korrespondenz|abrechnungsvorbereitung|abrechnungserstellung|wohnungsabnahme|wohnungsübergabe|vermietung|notdienst|bereitschaft|schönheitsrep/i;
    return a.kostenpositionen
      .filter((p) => p.kategorie === "hauswart")
      .map((p): Befund => {
        const { eigene, erlaeuterungen } = texteZu(p, a);
        const genannt = findeAussagen(eigene, NICHT_UMLAGEFAEHIG).find((x) => !x.verneint);
        const ausschluss = findeAussagen([...eigene, ...erlaeuterungen], NICHT_UMLAGEFAEHIG).find((x) => x.verneint);
        const jeQm = flaeche && zeitraum ? p.anteilMieter / flaeche / monateIm(zeitraum.von, zeitraum.bis) : undefined;
        const teuer = jeQm !== undefined && jeQm > HAUSWART_DURCHSCHNITT * 1.3;
        // Ausdrücklich ausgewiesener Betrag (Aufschlüsselung oder Text wie „enthält 480 € für Mietkonten“): nur dieser Anteil
        const teile = ausgewieseneTeile(p, a, NICHT_UMLAGEFAEHIG);
        if (teile.length > 0) {
          const haus = runde(teile.reduce((x, t) => x + t.betrag, 0));
          const anteil = anteilVon(p, haus);
          const liste = teile.map((t) => (t.bezeichnung.includes("€") || /\d/.test(t.bezeichnung) ? `„${t.bezeichnung}“` : `„${t.bezeichnung}“ ${euro(t.betrag)}`)).join(", ");
          return {
            status: anteil !== undefined ? "abweichung" : "auffaelligkeit",
            titel: `Verwaltung oder Reparaturen im Hauswart: ${p.bezeichnung}`,
            erklaerung:
              `Die Abrechnung weist in „${p.bezeichnung}“ einen Anteil für nicht umlagefähige Arbeiten aus: ${liste}.` +
              (anteil !== undefined ? ` Auf Ihre Wohnung entfallen davon ${euro(runde(anteil))}.` : "") +
              " Verwaltung, Reparaturen und Bereitschaft trägt der Vermieter.",
            naechsterSchritt: anteil !== undefined ? `Fordern Sie den Abzug dieses Anteils (${euro(runde(anteil))}).` : "Fordern Sie den Abzug dieses Anteils.",
            betragZugunstenMieter: anteil !== undefined ? runde(anteil) : undefined,
            positionId: p.id,
            textstelle: teile.map((t) => t.bezeichnung).join("; "),
            beleg: { gesamtkosten: p.gesamtkosten, nichtUmlagefaehigHaus: haus, anteilMieter: p.anteilMieter },
          };
        }
        if (genannt)
          return {
            status: "pruefbedarf",
            titel: `Reparatur- oder Verwaltungsanteil im Hauswart? ${p.bezeichnung}`,
            erklaerung: `„${genannt.text}“ nennt Tätigkeiten, die nicht umlagefähig sind (Reparaturen, Verwaltung oder Bereitschaft). Wie hoch dieser Anteil ist, steht nicht in der Abrechnung.`,
            naechsterSchritt: "Verlangen Sie den Hauswartvertrag und das Leistungsverzeichnis. Anteile für Reparaturen, Verwaltung oder Bereitschaft müssen abgezogen werden.",
            positionId: p.id,
            betroffen: p.anteilMieter,
            textstelle: genannt.text,
            unterlagen: ["rechnungen"],
            beleg: { jeQm: jeQm !== undefined ? runde(jeQm) : undefined },
          };
        if (teuer && !ausschluss)
          return {
            status: "hinweis",
            art: "vergleich",
            titel: `Hauswart teurer als üblich: ${p.bezeichnung}`,
            erklaerung: `„${p.bezeichnung}“ kostet ${zahlDE(runde(jeQm!))} € je m² im Monat, der Bundesdurchschnitt liegt bei etwa ${zahlDE(HAUSWART_DURCHSCHNITT)} €. Das ist kein Fehler, kann aber ein Anlass für die Belegeinsicht sein.`,
            naechsterSchritt: "Bei Interesse: Hauswartvertrag und Leistungsverzeichnis einsehen.",
            positionId: p.id,
            beleg: { jeQm: runde(jeQm!) },
          };
        return {
          status: "ok",
          titel: `Hauswart: ${p.bezeichnung}`,
          erklaerung: ausschluss ? `Die Abrechnung erklärt: „${ausschluss.text}“` : "Kein Hinweis auf nicht umlagefähige Tätigkeiten.",
          positionId: p.id,
          textstelle: ausschluss?.text,
        };
      });
  },
};

/**
 * Gewerbe im Haus: Verursacht Gewerbe deutlich höhere Kosten (z. B. Gaststätte, Arztpraxis), müssen diese
 * vorab abgezogen werden (Vorwegabzug). Ohne Angabe nur eine Frage, ohne Betrag.
 */
export const I12_Gewerbe: Regel = {
  id: "I-12",
  version: "1.0.0",
  titel: "Vorwegabzug für Gewerbe im Haus",
  bereich: "inhaltlich",
  grundlage: "§ 556a Abs. 1 BGB; BGH, Urt. v. 08.03.2006 – VIII ZR 78/05",
  stand: "entwurf",
  pruefe(a) {
    const gewerbe = a.ausstattung?.gewerbeImHaus;
    const vorweg = a.kostenpositionen.some((p) => p.gesamtkostenVorVorwegabzug !== undefined);
    if (gewerbe === false) return [];
    if (gewerbe === undefined) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Gewerbe im Haus?",
          erklaerung: "Bei Gewerbe im Haus müssen dessen höhere Kosten vorab abgezogen werden.",
          naechsterSchritt: "Beantworten Sie die Frage, ob es im Haus Gewerbe gibt.",
          rueckfrage: { feld: "ausstattung.gewerbeImHaus", frage: "Gibt es in Ihrem Haus einen Laden, eine Praxis, ein Büro oder eine Gaststätte?" },
        },
      ];
    }
    if (vorweg) return [{ status: "ok", titel: "Vorwegabzug für Gewerbe vorgenommen", erklaerung: "Die Abrechnung zieht Kosten für das Gewerbe vorab ab." }];
    return [
      {
        status: "auffaelligkeit",
        titel: "Kein Vorwegabzug für Gewerbe",
        erklaerung: "In Ihrem Haus gibt es Gewerbe, die Abrechnung zieht dafür aber keine Kosten vorab ab. Verursacht das Gewerbe deutlich höhere Kosten (zum Beispiel Müll, Wasser, Reinigung), zahlen die Mieter sonst mit.",
        naechsterSchritt: "Verlangen Sie eine Aufstellung, wie das Gewerbe bei Müll, Wasser und Reinigung berücksichtigt ist.",
      },
    ];
  },
};

/**
 * Leerstand: Unterschiedliche Anzahl Wohnungen bei nach Einheiten verteilten Kosten deutet darauf hin,
 * dass leere Wohnungen nicht mitgezählt wurden – deren Anteil trägt der Vermieter.
 */
export const I13_Leerstand: Regel = {
  id: "I-13",
  version: "1.0.0",
  titel: "Leerstand trägt der Vermieter",
  bereich: "inhaltlich",
  grundlage: "§ 556a Abs. 1 BGB; BGH, Urt. v. 31.05.2006 – VIII ZR 159/05",
  stand: "entwurf",
  pruefe(a) {
    const einheiten = a.kostenpositionen.filter((p) => p.umlageschluessel?.typ === "einheiten" && p.umlageschluessel.anteilGesamt !== undefined);
    const werte = [...new Set(einheiten.map((p) => p.umlageschluessel!.anteilGesamt!))];
    if (werte.length < 2) return [];
    const hoechst = Math.max(...werte);
    const betroffen = einheiten.filter((p) => p.umlageschluessel!.anteilGesamt! < hoechst);
    const zuViel = runde(betroffen.reduce((x, p) => x + p.anteilMieter * (1 - p.umlageschluessel!.anteilGesamt! / hoechst), 0));
    return [
      {
        status: "auffaelligkeit",
        titel: "Leerstand auf Mieter verteilt?",
        erklaerung: `Die nach Wohnungen verteilten Kosten rechnen mit unterschiedlich vielen Wohnungen (${werte.sort((x, y) => x - y).map((w) => zahlDE(w)).join(" und ")}). Werden leere Wohnungen weggelassen, zahlen die übrigen Mieter deren Anteil mit. Den Anteil leerer Wohnungen trägt der Vermieter.`,
        naechsterSchritt: "Fragen Sie nach, warum unterschiedlich viele Wohnungen angesetzt sind, und verlangen Sie, dass leere Wohnungen mitgezählt werden.",
        betragZugunstenMieter: zuViel > 0 ? zuViel : undefined,
        beleg: { werte, hoechst, positionen: betroffen.map((p) => p.id), zuViel },
      },
    ];
  },
};

/**
 * Grundsteuer ab 2025: Mit der Reform wird die Grundsteuer neu berechnet. Starke Änderungen gegenüber
 * dem Vorjahr sollten mit dem neuen Grundsteuerbescheid belegt werden.
 */
export const I14_Grundsteuer2025: Regel = {
  id: "I-14",
  version: "1.0.0",
  titel: "Grundsteuer nach der Reform 2025 belegt",
  bereich: "inhaltlich",
  grundlage: "§ 2 Nr. 1 BetrKV; Grundsteuerreform (GrStG ab 2025)",
  stand: "entwurf",
  pruefe(a) {
    const z = a.meta.abrechnungszeitraum;
    if (!z || z.bis < "2025-01-01") return [];
    const jetzt = runde(a.kostenpositionen.filter((p) => p.kategorie === "grundsteuer").reduce((x, p) => x + p.anteilMieter, 0));
    const vorher = runde((a.vorjahr?.kostenpositionen ?? []).filter((p) => p.kategorie === "grundsteuer").reduce((x, p) => x + p.anteilMieter, 0));
    if (!jetzt || !vorher) return [];
    const aenderung = (jetzt - vorher) / vorher;
    if (Math.abs(aenderung) < 0.2) {
      return [{ status: "ok", titel: "Grundsteuer kaum verändert", erklaerung: `Grundsteuer ${euro(jetzt)} (Vorjahr ${euro(vorher)}).`, beleg: { jetzt, vorher } }];
    }
    return [
      {
        status: "auffaelligkeit",
        titel: aenderung > 0 ? "Grundsteuer stark gestiegen" : "Grundsteuer stark verändert",
        erklaerung: `Seit 2025 wird die Grundsteuer neu berechnet. Ihr Anteil hat sich von ${euro(vorher)} auf ${euro(jetzt)} geändert (${aenderung > 0 ? "+" : ""}${zahlDE(aenderung * 100, 0)} %). Umgelegt werden darf nur die Grundsteuer laut aktuellem Bescheid.`,
        naechsterSchritt: "Verlangen Sie Einsicht in den Grundsteuerbescheid für 2025.",
        beleg: { jetzt, vorher, aenderung: runde(aenderung * 100) },
      },
    ];
  },
};

/**
 * Doppelberechnung: Dieselbe Rechnung oder dieselbe Leistung darf nur einmal umgelegt werden.
 * Sicher (Fehler): zwei Positionen nennen dieselbe Rechnungs-/Belegnummer.
 * Prüfbedarf: gleiche Kostenart, identische Gesamtkosten und identischer Anteil unter verschiedenen Namen.
 */
export const I16_Doppelberechnung: Regel = {
  id: "I-16",
  version: "1.0.0",
  titel: "Keine Leistung doppelt berechnet",
  bereich: "inhaltlich",
  grundlage: "§ 556 Abs. 1, 3 BGB; § 1 Abs. 1 BetrKV (nur tatsächlich entstandene Kosten)",
  stand: "entwurf",
  pruefe(a) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const befunde: Befund[] = [];
    const erledigt = new Set<string>();
    const ps = a.kostenpositionen;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const x = ps[i]!, y = ps[j]!;
        if (erledigt.has(y.id)) continue;
        const gleicheRechnung = x.belegnummer && y.belegnummer && norm(x.belegnummer).length >= 3 && norm(x.belegnummer) === norm(y.belegnummer);
        const gleicheBetraege = x.kategorie === y.kategorie && x.kategorie !== "unbekannt" && x.gesamtkosten !== undefined && x.gesamtkosten > 0 && x.gesamtkosten === y.gesamtkosten && x.anteilMieter === y.anteilMieter;
        // Dieselbe Rechnungsnummer mit unterschiedlichen Teilbeträgen ist eine Aufteilung, keine Doppelung
        if (gleicheRechnung && x.gesamtkosten !== undefined && y.gesamtkosten !== undefined && x.gesamtkosten !== y.gesamtkosten) continue;
        if (!gleicheRechnung && !gleicheBetraege) continue;
        erledigt.add(y.id);
        const betrag = Math.min(x.anteilMieter, y.anteilMieter);
        befunde.push({
          status: gleicheRechnung ? "abweichung" : "auffaelligkeit",
          titel: `Doppelt berechnet: ${x.bezeichnung} und ${y.bezeichnung}`,
          erklaerung: gleicheRechnung
            ? `„${x.bezeichnung}“ (${euro(x.anteilMieter)}) und „${y.bezeichnung}“ (${euro(y.anteilMieter)}) beziehen sich auf dieselbe Rechnung (${x.belegnummer}). Dieselbe Leistung darf nur einmal umgelegt werden.`
            : `„${x.bezeichnung}“ und „${y.bezeichnung}“ gehören zur selben Kostenart und haben genau dieselben Gesamtkosten (${euro(x.gesamtkosten!)}) und denselben Anteil (${euro(x.anteilMieter)}). Das deutet auf eine doppelt abgerechnete Leistung hin.`,
          naechsterSchritt: gleicheRechnung ? `Fordern Sie die Streichung einer der beiden Positionen (${euro(betrag)}).` : "Verlangen Sie die Rechnungen zu beiden Positionen.",
          betragZugunstenMieter: betrag,
          positionId: y.id,
          textstelle: gleicheRechnung ? `Rechnung ${x.belegnummer} bei „${x.bezeichnung}“ und „${y.bezeichnung}“` : undefined,
          unterlagen: undefined,
          beleg: { positionen: [x.id, y.id], belegnummer: gleicheRechnung ? x.belegnummer : undefined, gesamtkosten: x.gesamtkosten },
        });
      }
    }
    return befunde;
  },
};

/**
 * Versicherungen: Umlagefähig sind nur Sach- und Haftpflichtversicherungen für das Gebäude (§ 2 Nr. 13 BetrKV:
 * Feuer, Sturm, Wasser, Elementar, Glas, Haftpflicht für Gebäude, Öltank, Aufzug). Rechtsschutz, Mietausfall,
 * Hausrat und ähnliche Versicherungen des Vermieters sind keine Betriebskosten.
 */
const VERSICHERUNG_NICHT_UMLAGEFAEHIG = /rechtsschutz|mietausfall|mietverlust|mietnomaden|hausrat|vermögensschaden|vermoegensschaden|privathaftpflicht|private haftpflicht|reparaturversicherung|reparaturkostenversicherung|d&o/i;

export const I17_Versicherungen: Regel = {
  id: "I-17",
  version: "1.0.0",
  titel: "Nur Sach- und Haftpflichtversicherungen umgelegt",
  bereich: "inhaltlich",
  grundlage: "§ 2 Nr. 13 BetrKV",
  stand: "entwurf",
  pruefe(a) {
    const versicherungen = a.kostenpositionen.filter((p) => p.kategorie === "versicherung" || /versicherung|rechtsschutz/i.test(p.bezeichnung));
    if (versicherungen.length === 0) return [];
    // Erläuterungen, die eine nicht umlagefähige Versicherung nennen, aber keiner Position zugeordnet sind → größte Versicherungsposition
    const zugeordnet = new Set(versicherungen.flatMap((p) => texteZu(p, a).erlaeuterungen));
    const frei = a.erlaeuterungen.map((e) => e.text).filter((t) => VERSICHERUNG_NICHT_UMLAGEFAEHIG.test(t) && !zugeordnet.has(t));
    const groesste = [...versicherungen].sort((x, y) => y.anteilMieter - x.anteilMieter)[0]!;
    return versicherungen.map((p): Befund => {
      const name = findeAussagen([p.bezeichnung], VERSICHERUNG_NICHT_UMLAGEFAEHIG).find((x) => !x.verneint);
      // Ganze Position ist eine nicht umlagefähige Versicherung (kein Paket mit anderen Bestandteilen)
      if (name && !(p.bestandteile?.length) && !/paket|und |sowie|\+|, /i.test(p.bezeichnung)) {
        return {
          status: "abweichung",
          titel: `Versicherung nicht umlagefähig: ${p.bezeichnung}`,
          erklaerung: `„${p.bezeichnung}“ (${euro(p.anteilMieter)}) ist keine Sach- oder Haftpflichtversicherung für das Gebäude. Solche Versicherungen des Vermieters dürfen nicht umgelegt werden.`,
          naechsterSchritt: `Fordern Sie die Streichung dieser Position (${euro(p.anteilMieter)}).`,
          betragZugunstenMieter: p.anteilMieter,
          positionId: p.id,
          textstelle: p.bezeichnung,
          beleg: { gesamtkosten: p.gesamtkosten, anteilMieter: p.anteilMieter, ganzePosition: true },
        };
      }
      const zusatz: Kostenposition = p === groesste && frei.length ? { ...p, hinweise: [...(p.hinweise ?? []), ...frei] } : p;
      const teile = ausgewieseneTeile(zusatz, a, VERSICHERUNG_NICHT_UMLAGEFAEHIG);
      if (teile.length > 0) {
        const haus = runde(teile.reduce((x, t) => x + t.betrag, 0));
        const anteil = anteilVon(p, haus);
        const liste = teile.map((t) => (/\d/.test(t.bezeichnung) ? `„${t.bezeichnung}“` : `„${t.bezeichnung}“ ${euro(t.betrag)}`)).join(", ");
        return {
          status: anteil !== undefined ? "abweichung" : "auffaelligkeit",
          titel: `Nicht umlagefähige Versicherung enthalten: ${p.bezeichnung}`,
          erklaerung:
            `In „${p.bezeichnung}“ ist eine Versicherung enthalten, die nicht umgelegt werden darf: ${liste}.` +
            (anteil !== undefined ? ` Auf Ihre Wohnung entfallen davon ${euro(runde(anteil))}.` : "") +
            " Umlagefähig sind nur Sach- und Haftpflichtversicherungen für das Gebäude.",
          naechsterSchritt: anteil !== undefined ? `Fordern Sie den Abzug dieses Anteils (${euro(runde(anteil))}).` : "Fordern Sie den Abzug dieses Anteils.",
          betragZugunstenMieter: anteil !== undefined ? runde(anteil) : undefined,
          positionId: p.id,
          textstelle: teile.map((t) => t.bezeichnung).join("; "),
          beleg: { gesamtkosten: p.gesamtkosten, nichtUmlagefaehigHaus: haus, anteilMieter: p.anteilMieter },
        };
      }
      const texte = texteZu(zusatz, a);
      const genannt = findeAussagen([...texte.eigene, ...texte.erlaeuterungen], VERSICHERUNG_NICHT_UMLAGEFAEHIG).find((x) => !x.verneint);
      if (genannt) {
        return {
          status: "pruefbedarf",
          titel: `Nicht umlagefähige Versicherung enthalten? ${p.bezeichnung}`,
          erklaerung: `„${genannt.text}“ nennt eine Versicherung, die nicht umgelegt werden darf. Wie hoch ihr Anteil an „${p.bezeichnung}“ ist, steht nicht in der Abrechnung.`,
          naechsterSchritt: "Verlangen Sie die Versicherungsscheine und Beitragsrechnungen. Der Anteil für Rechtsschutz, Mietausfall oder Hausrat ist abzuziehen.",
          positionId: p.id,
          betroffen: p.anteilMieter,
          textstelle: genannt.text,
          unterlagen: ["rechnungen"],
        };
      }
      return { status: "ok", titel: `Versicherung umlagefähig: ${p.bezeichnung}`, erklaerung: "Kein Hinweis auf nicht umlagefähige Versicherungen.", positionId: p.id };
    });
  },
};

/**
 * Sondernutzung: Kosten für Flächen, die ein einzelner Mieter (oder der Vermieter) allein nutzt – etwa ein
 * Privatgarten –, dürfen nicht auf alle Mieter verteilt werden (BGH, Urt. v. 26.05.2004 – VIII ZR 135/03:
 * Gartenpflege ist nur umlagefähig, wenn die Fläche nicht einzelnen zur alleinigen Nutzung überlassen ist).
 * Eigene, direkt berechnete Sonderleistungen brauchen eine Vereinbarung; fehlt die Vertragsanlage: Prüfbedarf.
 */
const SONDERNUTZUNG = /privatgarten|privatgärten|privatgaerten|mietergarten|sondernutzung|alleinige[nr]? nutzung|zur alleinigen|ausschlie[ßs]+lich(en)? (ge)?nutz|privat(e[nr]?)? (garten|terrasse|stellplatz)|garten (der|von) wohnung/i;
const EIGEN = /\b(ihr|ihre[nmrs]?|eigene[nmrs]?|des mieters|der mieterin)\b/i;
const VEREINBARUNG_FEHLT = /(anlage|vereinbarung|zusatzvereinbarung|nachtrag|vertrag)[^.;]*(fehlt|liegt nicht (bei|vor)|nicht beigefügt|nicht vorgelegt|nicht vorhanden|steht aus)/i;

export const I18_Sondernutzung: Regel = {
  id: "I-18",
  version: "1.0.0",
  titel: "Kosten für allein genutzte Flächen und direkt berechnete Sonderleistungen",
  bereich: "inhaltlich",
  grundlage: "§ 556a Abs. 1 BGB; BGH VIII ZR 135/03; § 556 Abs. 1 BGB (Vereinbarung)",
  stand: "entwurf",
  pruefe(a) {
    const befunde: Befund[] = [];
    for (const p of a.kostenpositionen) {
      const direkt = p.umlageschluessel?.typ === "direkt";
      if (!direkt) {
        // Allgemein verteilte Position enthält Kosten einer fremden, allein genutzten Fläche
        const teile = ausgewieseneTeile(p, a, SONDERNUTZUNG).filter((t) => !EIGEN.test(t.bezeichnung));
        if (teile.length === 0) continue;
        const haus = runde(teile.reduce((x, t) => x + t.betrag, 0));
        const anteil = anteilVon(p, haus);
        const liste = teile.map((t) => (/\d/.test(t.bezeichnung) ? `„${t.bezeichnung}“` : `„${t.bezeichnung}“ ${euro(t.betrag)}`)).join(", ");
        befunde.push({
          status: anteil !== undefined ? "abweichung" : "auffaelligkeit",
          titel: `Kosten einer fremden Privatfläche mitverteilt: ${p.bezeichnung}`,
          erklaerung:
            `In „${p.bezeichnung}“ sind Kosten für eine Fläche enthalten, die ein anderer allein nutzt: ${liste}.` +
            (anteil !== undefined ? ` Auf Ihre Wohnung entfallen davon ${euro(runde(anteil))}.` : "") +
            " Solche Kosten dürfen nicht auf alle Mieter verteilt werden. Die Kosten der gemeinsam genutzten Fläche bleiben umlagefähig.",
          naechsterSchritt: anteil !== undefined ? `Fordern Sie den Abzug dieses Anteils (${euro(runde(anteil))}).` : "Fordern Sie den Abzug dieses Anteils.",
          betragZugunstenMieter: anteil !== undefined ? runde(anteil) : undefined,
          positionId: p.id,
          textstelle: teile.map((t) => t.bezeichnung).join("; "),
          beleg: { gesamtkosten: p.gesamtkosten, nichtUmlagefaehigHaus: haus, anteilMieter: p.anteilMieter },
        });
        continue;
      }
      // Direkt berechnete Sonderleistung: braucht eine Vereinbarung. Fehlt die Vertragsanlage → Prüfbedarf.
      if (["heizung", "warmwasser", "verbundene_anlagen", "wasser", "entwaesserung"].includes(p.kategorie)) continue;
      const texte = texteZu(p, a);
      const fehlt = findeAussagen([...texte.eigene, ...texte.erlaeuterungen], VEREINBARUNG_FEHLT).find((x) => !/\bkein|\bkeine/i.test(x.text.slice(0, x.text.search(VEREINBARUNG_FEHLT))));
      const sonder = SONDERNUTZUNG.test(p.bezeichnung) || /sonderleistung|zusatzleistung|service/i.test(p.bezeichnung);
      if (!fehlt && !sonder) continue;
      if (!fehlt && a.mietvertrag?.vereinbarteSonstigeKosten?.some((v) => v.length > 0 && p.bezeichnung.toLowerCase().includes(v.toLowerCase()))) continue;
      const anlage = fehlt?.text.match(/\b(Anlage|Nachtrag)\s+([A-Z0-9]{1,3})\b/)?.[0];
      befunde.push({
        status: "pruefbedarf",
        titel: `Vereinbarung fehlt: ${p.bezeichnung}`,
        erklaerung:
          `„${p.bezeichnung}“ (${euro(p.anteilMieter)}) wird Ihnen direkt berechnet. Das ist nur zulässig, wenn es vereinbart ist.` +
          (fehlt ? ` Die Abrechnung verweist auf eine Unterlage, die nicht vorliegt: „${fehlt.text}“` : " Eine Vereinbarung dazu liegt uns nicht vor.") +
          " Ob der Betrag berechtigt ist, lässt sich erst mit dieser Vereinbarung prüfen.",
        naechsterSchritt: `Fordern Sie ${anlage ? `die ${anlage.replace(/^Anlage/, "Vertragsanlage")}` : "die Vereinbarung zu dieser Leistung"} an oder laden Sie sie hoch.`,
        positionId: p.id,
        betroffen: p.anteilMieter,
        textstelle: fehlt?.text,
        unterlagen: ["vertragsanlage"],
        beleg: { anlage, anteilMieter: p.anteilMieter },
      });
    }
    return befunde;
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
  I09_WasserNachVerbrauch,
  I15_EntwaesserungDoppelt,
  I10_Rauchwarnmelder,
  I11_Hauswart,
  I12_Gewerbe,
  I13_Leerstand,
  I14_Grundsteuer2025,
  I16_Doppelberechnung,
  I17_Versicherungen,
  I18_Sondernutzung,
];
