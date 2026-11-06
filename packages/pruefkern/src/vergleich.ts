import { runde, tageInklusive } from "./hilfen";
import type { Abrechnung, Kostenkategorie } from "./schema";

/**
 * Kostenvergleich (Benchmarking).
 *
 * Grundlage 1: Betriebskostenspiegel des Deutschen Mieterbunds (bundesweit).
 * Grundlage 2: eigene, anonymisierte BiatiCheck-Fälle derselben PLZ-Region,
 * sobald genug Fälle vorliegen (wird von der App übergeben).
 *
 * Alle Werte in Euro je m² Wohnfläche und Monat.
 */

export type Vergleichsgruppe =
  | "heizung_warmwasser"
  | "grundsteuer"
  | "wasser_abwasser"
  | "aufzug"
  | "muell_strassenreinigung"
  | "gebaeudereinigung"
  | "gartenpflege"
  | "beleuchtung"
  | "schornstein"
  | "versicherung"
  | "hauswart"
  | "antenne_kabel"
  | "sonstige";

export const VERGLEICHSGRUPPEN: Record<Vergleichsgruppe, { name: string; kategorien: Kostenkategorie[] }> = {
  heizung_warmwasser: { name: "Heizung und Warmwasser", kategorien: ["heizung", "warmwasser", "verbundene_anlagen"] },
  grundsteuer: { name: "Grundsteuer", kategorien: ["grundsteuer"] },
  wasser_abwasser: { name: "Wasser und Abwasser", kategorien: ["wasser", "entwaesserung"] },
  aufzug: { name: "Aufzug", kategorien: ["aufzug"] },
  muell_strassenreinigung: { name: "Müll und Straßenreinigung", kategorien: ["strassenreinigung_muell"] },
  gebaeudereinigung: { name: "Gebäudereinigung", kategorien: ["gebaeudereinigung_ungeziefer"] },
  gartenpflege: { name: "Gartenpflege", kategorien: ["gartenpflege"] },
  beleuchtung: { name: "Allgemeinstrom", kategorien: ["beleuchtung"] },
  schornstein: { name: "Schornsteinreinigung", kategorien: ["schornsteinreinigung"] },
  versicherung: { name: "Versicherungen", kategorien: ["versicherung"] },
  hauswart: { name: "Hauswart", kategorien: ["hauswart"] },
  antenne_kabel: { name: "Antenne/Kabel", kategorien: ["antenne_kabel"] },
  sonstige: { name: "Sonstige Betriebskosten", kategorien: ["sonstige", "waeschepflege"] },
};

export interface Referenzwerte {
  /** Anzeigename der Vergleichsgruppe, z. B. "Deutschland" oder "PLZ-Gebiet 80". */
  region: string;
  quelle: string;
  /** Abrechnungsjahr der Daten. */
  jahr: number;
  /** Anzahl der zugrunde liegenden Fälle, falls bekannt (eigene Daten). */
  fallzahl?: number;
  gesamt: { durchschnitt: number; maximum?: number };
  heizungWarmwasser: { durchschnitt: number; minimum?: number; maximum?: number };
  gruppen: Partial<Record<Vergleichsgruppe, number>>;
}

const DMB_QUELLE = "Deutscher Mieterbund, Betriebskostenspiegel für Deutschland";

/**
 * Bundesweite Werte aus dem Betriebskostenspiegel des DMB (mieterbund.de),
 * abgerufen am 06.11.2026. Für 2023 liegen nur Gesamt- und Heizkostenwerte vor.
 */
export const DMB_BETRIEBSKOSTENSPIEGEL: readonly Referenzwerte[] = [
  {
    region: "Deutschland",
    quelle: `${DMB_QUELLE}, Abrechnungsjahr 2024`,
    jahr: 2024,
    gesamt: { durchschnitt: 2.67, maximum: 3.68 },
    heizungWarmwasser: { durchschnitt: 1.32, minimum: 0.46, maximum: 2.18 },
    gruppen: {
      heizung_warmwasser: 1.32,
      grundsteuer: 0.18,
      wasser_abwasser: 0.29,
      aufzug: 0.2,
      // DMB weist Müll (0,16) und Straßenreinigung/Winterdienst (0,04) getrennt aus
      muell_strassenreinigung: 0.2,
      gebaeudereinigung: 0.21,
      gartenpflege: 0.15,
      beleuchtung: 0.06,
      schornstein: 0.04,
      versicherung: 0.31,
      hauswart: 0.37,
      antenne_kabel: 0.07,
      sonstige: 0.07,
    },
  },
  {
    region: "Deutschland",
    quelle: `${DMB_QUELLE}, Abrechnungsjahr 2023`,
    jahr: 2023,
    gesamt: { durchschnitt: 2.51, maximum: 3.15 },
    heizungWarmwasser: { durchschnitt: 1.26, maximum: 2.15 },
    gruppen: {},
  },
];

/** Wählt die DMB-Werte zum Abrechnungsjahr – sonst das nächstliegende Jahr. */
export function waehleReferenz(jahr: number | undefined, quellen: readonly Referenzwerte[] = DMB_BETRIEBSKOSTENSPIEGEL): Referenzwerte {
  const sortiert = [...quellen].sort((a, b) => b.jahr - a.jahr);
  if (jahr === undefined) return sortiert[0]!;
  return sortiert.reduce((best, r) => (Math.abs(r.jahr - jahr) < Math.abs(best.jahr - jahr) ? r : best), sortiert[0]!);
}

export interface Kennwert {
  ihr: number;
  durchschnitt?: number;
  maximum?: number;
  /** Abweichung vom Durchschnitt in Prozent (positiv = teurer). */
  abweichungProzent?: number;
}

export interface Kostenvergleich {
  region: string;
  quelle: string;
  jahr: number;
  fallzahl?: number;
  /** Die regionale Referenz ist noch nicht verfügbar – Vergleich mit Deutschland. */
  regionalFolgt?: string;
  gesamt: Kennwert;
  heizungWarmwasser: Kennwert;
  kalt: Kennwert;
  gruppen: ({ gruppe: Vergleichsgruppe; name: string } & Kennwert)[];
}

export type KostenvergleichErgebnis = { ok: true; vergleich: Kostenvergleich } | { ok: false; grund: string };

const kennwert = (ihr: number, durchschnitt?: number, maximum?: number): Kennwert => ({
  ihr: runde(ihr),
  durchschnitt,
  maximum,
  abweichungProzent: durchschnitt ? Math.round(((ihr - durchschnitt) / durchschnitt) * 100) : undefined,
});

/** PLZ-Region (Leitregion) aus der Postleitzahl, z. B. "80937" → "80". */
export function plzRegion(plz: string | undefined): string | undefined {
  return plz && /^\d{5}$/.test(plz) ? plz.slice(0, 2) : undefined;
}

/** Kosten der Wohnung je m² und Monat, aufgeteilt nach Vergleichsgruppen. */
export function kostenJeQmMonat(a: Abrechnung): { gesamt: number; heizung: number; gruppen: Partial<Record<Vergleichsgruppe, number>> } | undefined {
  const flaeche = a.flaechen.wohnflaecheMieter;
  const zeitraum = a.meta.nutzungszeitraum ?? a.meta.abrechnungszeitraum;
  if (!flaeche || !zeitraum) return undefined;
  const monate = tageInklusive(zeitraum.von, zeitraum.bis) / (365.25 / 12);
  const jeQm = (euro: number) => euro / flaeche / monate;

  const gruppen: Partial<Record<Vergleichsgruppe, number>> = {};
  const gruppeVon = (k: Kostenkategorie) =>
    (Object.entries(VERGLEICHSGRUPPEN) as [Vergleichsgruppe, (typeof VERGLEICHSGRUPPEN)[Vergleichsgruppe]][]).find(([, g]) => g.kategorien.includes(k))?.[0];

  let gesamt = 0;
  for (const p of a.kostenpositionen) {
    gesamt += p.anteilMieter;
    const g = gruppeVon(p.kategorie);
    if (g) gruppen[g] = (gruppen[g] ?? 0) + jeQm(p.anteilMieter);
  }
  if (a.heizkosten && !a.heizkosten.inKostenpositionenEnthalten) {
    gesamt += a.heizkosten.anteilMieter;
    gruppen.heizung_warmwasser = (gruppen.heizung_warmwasser ?? 0) + jeQm(a.heizkosten.anteilMieter);
  }
  return { gesamt: jeQm(gesamt), heizung: gruppen.heizung_warmwasser ?? 0, gruppen };
}

/**
 * Vergleicht die Kosten der Wohnung mit Referenzwerten.
 * Regionale Werte werden nur genutzt, wenn sie übergeben werden (genug eigene Fälle);
 * sonst Bundesdurchschnitt laut DMB mit Hinweis, dass der regionale Vergleich folgt.
 */
export function vergleicheKosten(a: Abrechnung, regional?: Referenzwerte): KostenvergleichErgebnis {
  const ihr = kostenJeQmMonat(a);
  if (!ihr) return { ok: false, grund: "Für den Vergleich fehlen Wohnfläche oder Abrechnungszeitraum." };

  const jahr = a.meta.abrechnungszeitraum ? Number(a.meta.abrechnungszeitraum.bis.slice(0, 4)) : undefined;
  const ref = regional ?? waehleReferenz(jahr);
  // Gruppenwerte: regional, sonst die jüngsten DMB-Werte mit Gruppen
  const gruppenRef = Object.keys(ref.gruppen).length > 0 ? ref.gruppen : DMB_BETRIEBSKOSTENSPIEGEL.find((r) => Object.keys(r.gruppen).length > 0)!.gruppen;

  const kaltDurchschnitt = runde(ref.gesamt.durchschnitt - ref.heizungWarmwasser.durchschnitt);
  const region = plzRegion(a.meta.plz);

  return {
    ok: true,
    vergleich: {
      region: ref.region,
      quelle: ref.quelle,
      jahr: ref.jahr,
      fallzahl: ref.fallzahl,
      regionalFolgt: !regional && region ? `PLZ-Gebiet ${region}` : undefined,
      gesamt: kennwert(ihr.gesamt, ref.gesamt.durchschnitt, ref.gesamt.maximum),
      heizungWarmwasser: kennwert(ihr.heizung, ref.heizungWarmwasser.durchschnitt, ref.heizungWarmwasser.maximum),
      kalt: kennwert(ihr.gesamt - ihr.heizung, kaltDurchschnitt),
      gruppen: (Object.keys(ihr.gruppen) as Vergleichsgruppe[])
        .filter((g) => g !== "heizung_warmwasser")
        .map((g) => ({ gruppe: g, name: VERGLEICHSGRUPPEN[g].name, ...kennwert(ihr.gruppen[g]!, gruppenRef[g]) }))
        .sort((x, y) => (y.abweichungProzent ?? -Infinity) - (x.abweichungProzent ?? -Infinity)),
    },
  };
}

/**
 * Bildet regionale Referenzwerte aus eigenen, freigegebenen Fällen.
 * Gibt erst ab einer Mindestzahl an Fällen Werte zurück, damit Einzelfälle
 * nicht als „Durchschnitt“ erscheinen und keine Rückschlüsse möglich sind.
 */
export const MINDESTFAELLE_REGION = 10;

export function regionaleReferenz(region: string, faelle: Abrechnung[], jahr: number): Referenzwerte | undefined {
  const werte = faelle.map(kostenJeQmMonat).filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (werte.length < MINDESTFAELLE_REGION) return undefined;
  const mittel = (xs: number[]) => runde(xs.reduce((s, x) => s + x, 0) / xs.length);
  const gruppen: Partial<Record<Vergleichsgruppe, number>> = {};
  for (const g of Object.keys(VERGLEICHSGRUPPEN) as Vergleichsgruppe[]) {
    const xs = werte.map((w) => w.gruppen[g]).filter((x): x is number => x !== undefined);
    if (xs.length >= MINDESTFAELLE_REGION) gruppen[g] = mittel(xs);
  }
  return {
    region: `PLZ-Gebiet ${region}`,
    quelle: `BiatiCheck: ${werte.length} geprüfte Abrechnungen aus dem PLZ-Gebiet ${region}`,
    jahr,
    fallzahl: werte.length,
    gesamt: { durchschnitt: mittel(werte.map((w) => w.gesamt)) },
    heizungWarmwasser: { durchschnitt: mittel(werte.map((w) => w.heizung)) },
    gruppen,
  };
}
