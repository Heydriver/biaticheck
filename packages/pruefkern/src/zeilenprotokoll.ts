import { euro, runde, zahlDE } from "./hilfen";
import type { Pruefbericht } from "./pruefung";
import type { Regelergebnis, Status } from "./regel";
import { Abrechnung, NICHT_UMLAGEFAEHIG, type AbrechnungEingabe, type Kostenposition } from "./schema";

/**
 * Zeilenprotokoll – Unterschritt 1 der Prüfung.
 *
 * Jede Zeile der Abrechnung (jede Kostenposition, die Heizkosten, Summe, Vorauszahlungen, Saldo, Fristen)
 * wird einzeln aufgeführt, zusammen mit jeder Formel, die auf sie angewendet wurde, und deren Ergebnis.
 * Damit ist nachweisbar, dass keine Zeile ungeprüft bleibt und jedes Regelergebnis genau einer Zeile gehört.
 *
 * Das Protokoll ist zugleich die Vorlage für Unterschritt 2: Die KI-Kontrolle vergleicht es Zeile für Zeile
 * mit dem Originaldokument (siehe `@biaticheck/auslesen`, kontrolle.ts).
 */

export type Zeilenergebnis = "ok" | "fehler" | "pruefbedarf" | "hinweis" | "offen";

export interface Zeilenpruefung {
  regelId: string;
  /** Was geprüft wurde, z. B. "Anteil nachgerechnet". */
  name: string;
  ergebnis: Zeilenergebnis;
  /** Rechenweg oder Begründung in einem Satz. */
  detail: string;
  betrag?: number;
}

export interface Zeile {
  nr: number;
  art: "position" | "heizkosten" | "summe" | "vorauszahlungen" | "saldo" | "fristen" | "abrechnung";
  positionId?: string;
  bezeichnung: string;
  /** Werte, wie sie ausgelesen wurden – die KI-Kontrolle vergleicht sie mit dem Dokument. */
  gelesen: Record<string, string | number>;
  seite?: number;
  pruefungen: Zeilenpruefung[];
  /** Schlechtestes Ergebnis der Zeile. */
  ergebnis: Zeilenergebnis;
}

export interface Zeilenprotokoll {
  zeilen: Zeile[];
  anzahlPruefungen: number;
  /** Vollständigkeitsformel: Σ Zeilenbeträge = ausgewiesene Summe. Fehlt eine Zeile, geht die Summe nicht auf. */
  vollstaendigkeit: { summeZeilen: number; ausgewiesen?: number; differenz?: number; ok: boolean };
}

const ERGEBNIS: Record<Status, Zeilenergebnis> = { ok: "ok", abweichung: "fehler", auffaelligkeit: "pruefbedarf", pruefbedarf: "pruefbedarf", hinweis: "hinweis", nicht_pruefbar: "offen" };
const RANG: Record<Zeilenergebnis, number> = { ok: 0, hinweis: 1, offen: 2, pruefbedarf: 3, fehler: 4 };
const SCHLUESSEL: Record<string, string> = { wohnflaeche: "Wohnfläche", personen: "Personen", einheiten: "Einheiten", verbrauch: "Verbrauch", miteigentumsanteil: "Miteigentumsanteil", direkt: "direkt", sonstig: "sonstig" };

/** Regeln ohne Positionsbezug → Zeile, zu der sie gehören. */
const ZEILE_DER_REGEL: Record<string, Zeile["art"]> = {
  "F-01": "fristen",
  "F-02": "fristen",
  "F-03": "fristen",
  "R-02": "summe",
  "R-03": "saldo",
  "R-05": "vorauszahlungen",
  "I-04": "heizkosten",
  "I-08": "heizkosten",
  "P-03": "heizkosten",
  "R-08": "heizkosten",
  "R-09": "heizkosten",
};

const ausBericht = (e: Regelergebnis): Zeilenpruefung => ({
  regelId: e.regelId,
  name: e.regelTitel,
  ergebnis: ERGEBNIS[e.status],
  detail: e.status === "ok" ? e.erklaerung : `${e.titel}. ${e.erklaerung}`,
  ...(e.betragZugunstenMieter !== undefined && e.betragZugunstenMieter > 0 ? { betrag: e.betragZugunstenMieter } : {}),
});

/** Feste Formelprüfungen, die für jede Kostenposition laufen – auch wenn die Regel keinen eigenen Befund meldet. */
function grundpruefungen(p: Kostenposition, zuPosition: Regelergebnis[]): Zeilenpruefung[] {
  const hat = (id: string) => zuPosition.some((e) => e.regelId === id);
  const liste: Zeilenpruefung[] = [];
  const s = p.umlageschluessel;

  if (!hat("F-04")) {
    liste.push({ regelId: "F-04", name: "Angaben vollständig", ergebnis: "ok", detail: s?.typ === "direkt" ? "Direkt zugeordnete Kosten." : "Gesamtkosten und Umlageschlüssel sind angegeben." });
  }
  if (!hat("R-01")) {
    if (p.gesamtkosten !== undefined && s?.anteilEinheit !== undefined && s.anteilGesamt) {
      const erwartet = runde((p.gesamtkosten * s.anteilEinheit) / s.anteilGesamt);
      const passt = Math.abs(p.anteilMieter - erwartet) <= 0.05;
      liste.push({
        regelId: "R-01",
        name: "Anteil nachgerechnet",
        // Abweichungen meldet R-01 selbst (mit Zeitanteil); hier nur die Bestätigung
        ergebnis: passt || s.typ === "verbrauch" || s.typ === "direkt" || s.typ === "sonstig" ? "ok" : "offen",
        detail: `${euro(p.gesamtkosten)} × ${zahlDE(s.anteilEinheit)} / ${zahlDE(s.anteilGesamt)} = ${euro(erwartet)}, abgerechnet ${euro(p.anteilMieter)}.`,
      });
    } else {
      liste.push({ regelId: "R-01", name: "Anteil nachgerechnet", ergebnis: s?.typ === "direkt" ? "ok" : "offen", detail: s?.typ === "direkt" ? "Direkt zugeordnet, keine Verteilung." : "Nicht nachrechenbar: Gesamtkosten oder Schlüsselwerte fehlen." });
    }
  }
  if (!hat("I-01") && !hat("I-03")) {
    liste.push({ regelId: "I-01", name: "Kostenart umlagefähig", ergebnis: NICHT_UMLAGEFAEHIG.includes(p.kategorie) ? "fehler" : "ok", detail: `Kostenart: ${p.kategorie}.` });
  }
  return liste;
}

export function erstelleZeilenprotokoll(bericht: Pruefbericht, eingabe: AbrechnungEingabe): Zeilenprotokoll {
  const a = Abrechnung.parse(eingabe);
  const zeilen: Zeile[] = [];
  const vergeben = new Set<Regelergebnis>();
  const nimm = (filter: (e: Regelergebnis) => boolean) => {
    const treffer = bericht.ergebnisse.filter((e) => !vergeben.has(e) && filter(e));
    treffer.forEach((e) => vergeben.add(e));
    return treffer;
  };
  const zeile = (z: Omit<Zeile, "nr" | "ergebnis">) => {
    const ergebnis = z.pruefungen.reduce<Zeilenergebnis>((s, p) => (RANG[p.ergebnis] > RANG[s] ? p.ergebnis : s), "ok");
    zeilen.push({ nr: zeilen.length + 1, ...z, ergebnis });
  };

  // 1. Jede Kostenposition
  for (const p of a.kostenpositionen) {
    const direkt = nimm((e) => e.positionId === p.id);
    // Regeln, die mehrere Positionen gemeinsam betreffen (z. B. Wasser, Niederschlagswasser)
    const gemeinsam = bericht.ergebnisse.filter((e) => !e.positionId && Array.isArray(e.beleg?.positionen) && (e.beleg!.positionen as string[]).includes(p.id));
    gemeinsam.forEach((e) => vergeben.add(e));
    const s = p.umlageschluessel;
    zeile({
      art: "position",
      positionId: p.id,
      bezeichnung: p.bezeichnung,
      gelesen: {
        ...(p.gesamtkosten !== undefined ? { gesamtkosten: p.gesamtkosten } : {}),
        ...(s ? { schluessel: SCHLUESSEL[s.typ] ?? s.typ } : {}),
        ...(s?.anteilEinheit !== undefined ? { anteilEinheit: s.anteilEinheit } : {}),
        ...(s?.anteilGesamt !== undefined ? { anteilGesamt: s.anteilGesamt } : {}),
        anteilMieter: p.anteilMieter,
      },
      seite: p.fundstelle?.seite,
      pruefungen: [...grundpruefungen(p, direkt), ...direkt.map(ausBericht), ...gemeinsam.map(ausBericht)],
    });
  }

  // 2. Heizkosten, Summe, Vorauszahlungen, Saldo, Fristen
  const fuer = (art: Zeile["art"]) => nimm((e) => !e.positionId && ZEILE_DER_REGEL[e.regelId] === art).map(ausBericht);
  if (a.heizkosten) {
    const h = a.heizkosten;
    zeile({
      art: "heizkosten",
      bezeichnung: "Heiz- und Warmwasserkosten",
      gelesen: { anteilMieter: h.anteilMieter, ...(h.gesamtkosten !== undefined ? { gesamtkosten: h.gesamtkosten } : {}), ...(h.verbrauchsanteilProzent !== undefined ? { verbrauchsanteilProzent: h.verbrauchsanteilProzent } : {}) },
      pruefungen: fuer("heizkosten"),
    });
  }
  const summeZeilen = runde(a.kostenpositionen.reduce((s, p) => s + p.anteilMieter, 0) + (a.heizkosten && !a.heizkosten.inKostenpositionenEnthalten ? a.heizkosten.anteilMieter : 0));
  const ausgewiesen = a.ausgewiesen.summeKostenMieter;
  const differenz = ausgewiesen !== undefined ? runde(ausgewiesen - summeZeilen) : undefined;
  zeile({
    art: "summe",
    bezeichnung: "Summe der Kosten",
    gelesen: { summeZeilen, ...(ausgewiesen !== undefined ? { ausgewiesen } : {}) },
    pruefungen: [
      ...fuer("summe"),
      ...(ausgewiesen === undefined ? [{ regelId: "R-02", name: "Gesamtsumme nachgerechnet", ergebnis: "offen" as const, detail: "Die Abrechnung weist keine Gesamtsumme aus." }] : []),
    ],
  });
  zeile({
    art: "vorauszahlungen",
    bezeichnung: "Vorauszahlungen",
    gelesen: { ...(a.vorauszahlungen !== undefined ? { gesamt: a.vorauszahlungen } : {}), ...(a.vorauszahlungenDetail?.betriebskosten !== undefined ? { betriebskosten: a.vorauszahlungenDetail.betriebskosten } : {}), ...(a.vorauszahlungenDetail?.heizkosten !== undefined ? { heizkosten: a.vorauszahlungenDetail.heizkosten } : {}) },
    pruefungen: fuer("vorauszahlungen"),
  });
  zeile({ art: "saldo", bezeichnung: "Abrechnungsergebnis", gelesen: a.ausgewiesen.saldo !== undefined ? { saldo: a.ausgewiesen.saldo } : {}, pruefungen: fuer("saldo") });
  const z = a.meta.abrechnungszeitraum;
  zeile({
    art: "fristen",
    bezeichnung: "Zeitraum und Fristen",
    gelesen: { ...(z ? { von: z.von, bis: z.bis } : {}), ...(a.meta.erstelltAm ? { erstelltAm: a.meta.erstelltAm } : {}) },
    pruefungen: fuer("fristen"),
  });

  // 3. Alles Übrige betrifft die Abrechnung als Ganzes (Flächen, Mietvertrag, Vergleiche)
  zeile({
    art: "abrechnung",
    bezeichnung: "Abrechnung insgesamt",
    gelesen: { ...(a.flaechen.wohnflaecheMieter !== undefined ? { wohnflaeche: a.flaechen.wohnflaecheMieter } : {}), ...(a.flaechen.gesamtflaeche !== undefined ? { gesamtflaeche: a.flaechen.gesamtflaeche } : {}) },
    pruefungen: nimm(() => true).map(ausBericht),
  });

  return {
    zeilen,
    anzahlPruefungen: zeilen.reduce((s, x) => s + x.pruefungen.length, 0),
    vollstaendigkeit: { summeZeilen, ausgewiesen, differenz, ok: differenz !== undefined && Math.abs(differenz) <= 0.05 },
  };
}
