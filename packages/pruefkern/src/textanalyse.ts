import type { Abrechnung, Kostenposition } from "./schema";

/**
 * Textauswertung für Positionsbezeichnungen, Erläuterungen, Fußnoten und Anlagen.
 *
 * Grundsatz: Aussagen des Dokuments („enthalten keine Reparaturkosten“) werden berücksichtigt,
 * aber nicht blind übernommen – ausdrücklich ausgewiesene Beträge (Bestandteile) gehen immer vor.
 */

/** Wörter, die eine Aussage verneinen oder ausschließen. */
const VERNEINUNG = /\b(kein|keine|keinen|keiner|keines|nicht|ohne|ausgenommen|ausgeschlossen|exklusive|abzüglich|herausgerechnet|bereinigt|abgezogen)\b/i;

/** Nicht umlagefähige Arbeiten nach § 1 Abs. 2 BetrKV. */
export const REPARATUR = /reparatur|instandsetz|instandhalt|ersatzteil|störungsbeseitigung|stoerungsbeseitigung|austausch|erneuerung|schadens?behebung/i;
const VOLLWARTUNG = /vollwartung|vollwartungsvertrag|full[- ]?service|wartung\s+(inkl\.?|inklusive|einschl\.?|einschließlich|mit)\s+(reparatur|instandsetzung|ersatzteil)/i;

/** Teilt einen Text in Aussagen (Sätze und durch Semikolon getrennte Teilsätze). */
function aussagen(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface Aussage {
  /** Wörtliche Textstelle. */
  text: string;
  /** true = die Aussage schließt den Begriff aus („keine Reparaturkosten“). */
  verneint: boolean;
}

/** Findet Aussagen zu einem Begriff und erkennt, ob sie verneint sind. */
export function findeAussagen(texte: readonly string[], begriff: RegExp): Aussage[] {
  const treffer: Aussage[] = [];
  for (const t of texte) {
    for (const satz of aussagen(t)) {
      if (!begriff.test(satz)) continue;
      // Verneinung muss im selben Satz vor dem Begriff stehen („keine Reparaturkosten“, „ohne Instandsetzung“)
      const position = satz.search(begriff);
      treffer.push({ text: satz, verneint: VERNEINUNG.test(satz.slice(0, position + 1)) });
    }
  }
  return treffer;
}

const BETRAG = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:€|EUR\b|Euro\b)/g;

/**
 * Beträge, die ein Text ausdrücklich einem Begriff zuordnet, z. B. „Das Jahresentgelt enthält 480 € für
 * Mietkonten und Mieterkorrespondenz.“ → 480. Verneinte Aussagen zählen nicht. Stehen mehrere Beträge im
 * Satz, gilt der Betrag, der dem Begriff am nächsten steht.
 */
export function betraegeZu(texte: readonly string[], begriff: RegExp): { betrag: number; text: string }[] {
  const treffer: { betrag: number; text: string }[] = [];
  for (const a of findeAussagen(texte, begriff)) {
    if (a.verneint) continue;
    const stelle = a.text.search(begriff);
    let bester: { betrag: number; abstand: number } | undefined;
    for (const m of a.text.matchAll(BETRAG)) {
      const betrag = Number(m[1]!.replace(/\./g, "").replace(",", "."));
      const abstand = Math.abs(m.index! - stelle);
      if (Number.isFinite(betrag) && betrag > 0 && (!bester || abstand < bester.abstand)) bester = { betrag, abstand };
    }
    if (bester && !treffer.some((t) => t.text === a.text)) treffer.push({ betrag: bester.betrag, text: a.text });
  }
  return treffer;
}

/** Suchbegriffe, mit denen eine allgemeine Erläuterung einer Kostenart zugeordnet wird. */
const BEZUG: Partial<Record<Kostenposition["kategorie"], RegExp>> = {
  grundsteuer: /grundsteuer/i,
  versicherung: /versicherung/i,
  strassenreinigung_muell: /müll|abfall|straßenreinigung|winterdienst/i,
  beleuchtung: /strom|beleuchtung/i,
  schornsteinreinigung: /schornstein/i,
  antenne_kabel: /kabel|antenne/i,
  aufzug: /aufzug|fahrstuhl|lift/i,
  hauswart: /hauswart|hausmeister/i,
  wasser: /wasser/i,
  entwaesserung: /wasser|entwässerung|kanal/i,
  gebaeudereinigung_ungeziefer: /reinigung|ungeziefer/i,
  gartenpflege: /garten/i,
  heizung: /heiz|wärme/i,
  sonstige: /rauch|wartung/i,
};

/**
 * Alle Texte, die sich auf eine Position beziehen: ihre Bezeichnung, ihre eigenen Hinweise
 * und Erläuterungen der Abrechnung, die ihre Kostenart nennen oder für alle Positionen gelten.
 */
export function texteZu(p: Kostenposition, a: Abrechnung): { eigene: string[]; erlaeuterungen: string[] } {
  const bezug = BEZUG[p.kategorie];
  const erste = p.bezeichnung.split(/[\s:,/(]+/)[0]?.toLowerCase();
  const erlaeuterungen = a.erlaeuterungen
    .map((e) => e.text)
    .filter((t) => (bezug && bezug.test(t)) || (erste && erste.length >= 4 && t.toLowerCase().includes(erste)) || /alle(n)? (kosten)?positionen|sämtliche (kosten|positionen)/i.test(t));
  return { eigene: [p.bezeichnung, ...(p.hinweise ?? [])], erlaeuterungen };
}

/**
 * Ausdrücklich ausgewiesene Teilbeträge einer Position, die zu einem Begriff gehören (Hausbeträge):
 * zuerst aus der Aufschlüsselung, sonst aus Hinweisen und Erläuterungen mit Betrag.
 */
export function ausgewieseneTeile(p: Kostenposition, a: Abrechnung, begriff: RegExp): { bezeichnung: string; betrag: number }[] {
  const ausListe = (p.bestandteile ?? []).filter((b) => begriff.test(b.bezeichnung) && !findeAussagen([b.bezeichnung], begriff)[0]?.verneint);
  if (ausListe.length > 0) return ausListe.map((b) => ({ bezeichnung: b.bezeichnung, betrag: b.betrag }));
  const { eigene, erlaeuterungen } = texteZu(p, a);
  return betraegeZu([...eigene, ...erlaeuterungen], begriff)
    .filter((t) => p.gesamtkosten === undefined || t.betrag < p.gesamtkosten)
    .map((t) => ({ bezeichnung: t.text, betrag: t.betrag }));
}

export interface Reparaturbewertung {
  /** Ausdrücklich ausgewiesene Reparaturbestandteile (Hausbeträge). */
  bestandteile: { bezeichnung: string; betrag: number }[];
  /** Bezeichnung oder Hinweis nennt Reparaturen ausdrücklich (nicht verneint). */
  genannt?: Aussage;
  /** Vollwartungsvertrag ohne Aufschlüsselung. */
  vollwartung?: Aussage;
  /** Das Dokument schließt Reparaturen für diese Position ausdrücklich aus. */
  ausschluss?: Aussage;
}

/** Bewertet, ob eine Position Reparatur- oder Instandsetzungskosten enthält. */
export function bewerteReparatur(p: Kostenposition, a: Abrechnung): Reparaturbewertung {
  const { eigene, erlaeuterungen } = texteZu(p, a);
  const bestandteile = ausgewieseneTeile(p, a, REPARATUR);
  const eigeneAussagen = findeAussagen(eigene, REPARATUR);
  const genannt = eigeneAussagen.find((x) => !x.verneint);
  const vollwartung = findeAussagen([...eigene, ...erlaeuterungen], VOLLWARTUNG).find((x) => !x.verneint);
  const ausschluss = [...eigeneAussagen, ...findeAussagen(erlaeuterungen, REPARATUR)].find((x) => x.verneint);
  return { bestandteile, genannt, vollwartung, ausschluss };
}

export type Wasserart = "frischwasser" | "schmutzwasser" | "niederschlagswasser" | "wasser_abwasser";

/**
 * Ordnet Wasser- und Entwässerungspositionen fachlich zu (§ 2 Nr. 2 und 3 BetrKV).
 * Niederschlagswasser wird von der Gemeinde nach angeschlossener bzw. versiegelter Grundstücksfläche
 * berechnet – ein Wohnungswasserzähler misst es nicht.
 */
export function wasserart(p: Kostenposition): Wasserart | undefined {
  if (p.unterart) return p.unterart;
  if (p.kategorie !== "wasser" && p.kategorie !== "entwaesserung") return undefined;
  const t = p.bezeichnung.toLowerCase();
  if (/niederschlag|regenwasser|oberflächenwasser|oberflaechenwasser|versiegelte?\s+fläche|dachfläche|regenentwässerung/.test(t)) return "niederschlagswasser";
  const frisch = /frischwasser|kaltwasser|trinkwasser|wasserversorgung|wasserverbrauch|wassergeld/.test(t);
  const schmutz = /schmutzwasser|abwasser|kanal|sielgebühr/.test(t);
  if (/wasser\s*\/\s*abwasser|wasser und abwasser|be- und entwässerung/.test(t) || (frisch && schmutz)) return "wasser_abwasser";
  if (frisch) return "frischwasser";
  if (schmutz) return "schmutzwasser";
  // „Entwässerung“ ohne nähere Angabe kann Schmutz- und Niederschlagswasser enthalten
  return p.kategorie === "wasser" ? "frischwasser" : "wasser_abwasser";
}

/** Anteil eines Hausbetrags an der Position, umgerechnet auf die Wohnung. */
export function anteilVon(p: Kostenposition, hausbetrag: number): number | undefined {
  if (p.gesamtkosten && p.gesamtkosten > 0) return (p.anteilMieter * hausbetrag) / p.gesamtkosten;
  const u = p.umlageschluessel;
  if (u?.anteilEinheit !== undefined && u.anteilGesamt) return (hausbetrag * u.anteilEinheit) / u.anteilGesamt;
  return undefined;
}
