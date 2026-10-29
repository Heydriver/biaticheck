import type { Kostenkategorie } from "./schema";

/**
 * Regelbasierte Zuordnung von Positionsbezeichnungen zu Kostenkategorien.
 * Dient als Vorschlag und Gegenprobe zur KI-Zuordnung beim Auslesen.
 * Reihenfolge ist wichtig: spezifische Begriffe (nicht umlagefähig) zuerst.
 */
const MUSTER: [Kostenkategorie, RegExp][] = [
  ["ruecklage", /rücklage|ruecklage/],
  ["verwaltung", /verwaltung|hausverwalt/],
  ["instandhaltung", /reparatur|instandhaltung|instandsetzung|wartung.*reparatur|erneuerung/],
  ["bank_porto", /bankgebühr|kontoführung|porto|bankspesen/],
  ["grundsteuer", /grundsteuer|grundbesitzabgabe/],
  ["entwaesserung", /abwasser|entwässerung|kanal|schmutzwasser|niederschlag|regenwasser/],
  ["warmwasser", /warmwasser/],
  ["wasser", /wasser|kaltwasser|frischwasser/],
  ["heizung", /heiz|wärme|fernwärme|brennstoff|heizöl/],
  ["aufzug", /aufzug|fahrstuhl|lift/],
  ["strassenreinigung_muell", /müll|abfall|straßenreinigung|strassenreinigung|winterdienst|biotonne/],
  ["gebaeudereinigung_ungeziefer", /hausreinigung|treppenhaus|gebäudereinigung|ungeziefer|schädling/],
  ["gartenpflege", /garten|grünanlage|grünpflege|spielplatz/],
  ["beleuchtung", /allgemeinstrom|beleuchtung|hausstrom|strom allgemein/],
  ["schornsteinreinigung", /schornstein|kaminkehrer|immissionsmessung/],
  ["versicherung", /versicherung/],
  ["hauswart", /hauswart|hausmeister/],
  ["antenne_kabel", /antenne|kabel|breitband|kabelanschluss/],
  ["waeschepflege", /wasch|trockner|wäsche/],
];

export function ordneKategorieZu(bezeichnung: string): Kostenkategorie {
  const text = bezeichnung.toLowerCase();
  for (const [kategorie, muster] of MUSTER) {
    if (muster.test(text)) return kategorie;
  }
  return "unbekannt";
}
