/**
 * Fehlerkatalog: alle Fehlerarten, die der Prüfkern aus den Zahlen und Texten einer Abrechnung
 * rechnerisch erkennt – je Regel, mit Formel.
 *
 * Der Katalog ist die verbindliche Liste. Der Test `test/fehlerkatalog.test.ts` baut jede Fehlerart
 * in vielen Zufallsvarianten in eine korrekte Abrechnung ein und verlangt, dass die genannte Regel sie
 * mit dem genannten Ergebnis und dem exakten Betrag meldet. Eine Fehlerart ohne Test oder eine Regel
 * ohne Fehlerart lässt den Test fehlschlagen.
 *
 * Die KI liest nur die Werte aus dem Dokument. Erkennung und Beträge stammen ausschließlich aus diesen Formeln.
 */

export interface Fehlerart {
  /** Stabile ID, z. B. "R-01.a". */
  id: string;
  regelId: string;
  name: string;
  /** Formel in Worten und Symbolen; Variablen wie im Datenschema. */
  formel: string;
  /** Ergebnis: belegter Fehler, begründeter Prüfbedarf (auffaelligkeit/pruefbedarf) oder Hinweis. */
  ergebnis: "abweichung" | "auffaelligkeit" | "pruefbedarf" | "hinweis";
  /** exakt = belegtes Korrekturpotenzial; bis_zu = Obergrenze; keiner = Auswirkung nicht bezifferbar. */
  betrag: "exakt" | "bis_zu" | "keiner";
  /** Angaben, die für die Erkennung vorliegen müssen. */
  braucht: string;
}

const f = (id: string, name: string, formel: string, ergebnis: Fehlerart["ergebnis"], betrag: Fehlerart["betrag"], braucht: string): Fehlerart => ({
  id,
  regelId: id.split(".")[0]!,
  name,
  formel,
  ergebnis,
  betrag,
  braucht,
});

export const FEHLERKATALOG: readonly Fehlerart[] = [
  // ---------- Formell ----------
  f("F-01.a", "Abrechnungszeitraum länger als 12 Monate", "bis ≥ von + 12 Monate", "abweichung", "keiner", "Abrechnungszeitraum"),
  f("F-02.a", "Abrechnung verspätet, Zeitraum bestätigt", "Zugang > Zeitraumende + 12 Monate und Saldo > 0 und Zeitraum bestätigt → Betrag = Saldo", "abweichung", "exakt", "Zeitraum, Zugangsdatum, Saldo, Vorjahresabrechnung"),
  f("F-02.b", "Abrechnung möglicherweise verspätet", "Zugang > Zeitraumende + 12 Monate und Saldo > 0, Zeitraum noch nicht bestätigt → möglicher Betrag = Saldo", "pruefbedarf", "bis_zu", "Zeitraum, Zugangsdatum, Saldo"),
  f("F-02.c", "Abrechnung verspätet bei Guthaben", "Zugang > Zeitraumende + 12 Monate und Saldo ≤ 0", "auffaelligkeit", "keiner", "Zeitraum, Zugangsdatum, Saldo"),
  f("F-03.a", "Einwendungsfrist abgelaufen", "heute > Zugang + 12 Monate", "auffaelligkeit", "keiner", "Zugangsdatum"),
  f("F-04.a", "Gesamtkosten einer Position fehlen", "Position ohne Gesamtkosten (außer direkt zugeordnet)", "auffaelligkeit", "keiner", "Kostenpositionen"),
  f("F-04.b", "Umlageschlüssel einer Position fehlt", "Position ohne Umlageschlüssel", "auffaelligkeit", "keiner", "Kostenpositionen"),
  f("F-05.a", "Abrechnung trotz Pauschale", "Pauschale vereinbart → Betrag = Saldo, falls Saldo > 0", "abweichung", "exakt", "Mietvertrag, Saldo"),

  // ---------- Rechnerisch ----------
  f("R-01.a", "Anteil einer Position falsch berechnet", "Betrag = Anteil − Gesamtkosten × AnteilEinheit / AnteilGesamt × Zeitanteil, falls |Betrag| > 0,05 €", "abweichung", "exakt", "Gesamtkosten, Umlageschlüssel, Anteil"),
  f("R-02.a", "Gesamtsumme falsch addiert", "Betrag = ausgewiesene Summe − (Σ Anteile der Positionen + Heizkostenanteil), falls |Betrag| > 0,05 €", "abweichung", "exakt", "Positionen, ausgewiesene Summe"),
  f("R-03.a", "Saldo falsch berechnet", "Betrag = ausgewiesener Saldo − (Summe − Vorauszahlungen), falls |Betrag| > 0,05 €", "abweichung", "exakt", "Summe, Vorauszahlungen, Saldo"),
  f("R-04.a", "Falscher Flächennenner bei Heizkosten", "Nenner ≠ Gesamtfläche und Abrechnung nennt dieselbe beheizte Gesamtfläche → Betrag = Anteil − Gesamtkosten × AnteilEinheit / Gesamtfläche", "abweichung", "exakt", "Gesamtfläche, beheizte Gesamtfläche, Position"),
  f("R-04.b", "Kleinerer Flächennenner ohne Begründung", "Nenner < Gesamtfläche, keine Begründung in der Abrechnung → möglicher Betrag = Anteil − Gesamtkosten × AnteilEinheit / Gesamtfläche", "auffaelligkeit", "bis_zu", "Gesamtfläche, Position"),
  f("R-04.c", "Unterschiedliche Wohnflächen für dieselbe Wohnung", "Anzahl verschiedener AnteilEinheit (Fläche) > 1", "auffaelligkeit", "keiner", "Positionen nach Fläche"),
  f("R-04.d", "Leerstand aus dem Flächennenner herausgerechnet", "Nenner < Gesamtfläche und Abrechnung nennt Leerstand als Grund → Betrag = Anteil − Gesamtkosten × AnteilEinheit / Gesamtfläche", "abweichung", "exakt", "Gesamtfläche, Hinweis der Abrechnung"),
  f("R-05.a", "Vorauszahlungen zu niedrig angerechnet (belegt)", "Betrag = Σ Monatsbeträge laut Beleg − angerechnete Vorauszahlungen, falls > 1 €", "abweichung", "exakt", "Vorjahresabrechnung oder Kontoauszüge"),
  f("R-05.b", "Vorauszahlungen möglicherweise zu niedrig angerechnet", "möglicher Betrag = Monatsbetrag × Monate − angerechnete Vorauszahlungen, falls > 1 €", "pruefbedarf", "bis_zu", "Monatsbetrag laut Schreiben"),
  f("R-05.c", "Vorauszahlungen laut Zahlungsübersicht unvollständig angerechnet", "Betrag = gezahlte Vorauszahlungen laut Zahlungsübersicht der Abrechnung − angerechnete Vorauszahlungen, falls > 1 €", "abweichung", "exakt", "Zahlungsübersicht in der Abrechnung"),
  f("R-06.a", "Ein- oder Auszug nicht berücksichtigt", "möglicher Betrag = zeitabhängige Kosten × (1 − Miettage / Tage des Zeitraums)", "auffaelligkeit", "bis_zu", "Mietvertrag (Mietbeginn/-ende)"),
  f("R-07.a", "Mehr Wohnfläche als im Mietvertrag", "(Fläche Abrechnung − Fläche Vertrag) / Fläche Vertrag > 3 % → möglicher Betrag = Kosten nach Fläche × (1 − Fläche Vertrag / Fläche Abrechnung)", "auffaelligkeit", "bis_zu", "Mietvertrag (Wohnfläche)"),

  // ---------- Inhaltlich ----------
  f("I-01.a", "Verwaltungskosten umgelegt", "Kategorie = Verwaltung → Betrag = Anteil", "abweichung", "exakt", "Kostenpositionen"),
  f("I-01.b", "Reparaturen/Instandhaltung umgelegt", "Kategorie = Instandhaltung → Betrag = Anteil", "abweichung", "exakt", "Kostenpositionen"),
  f("I-01.c", "Rücklage umgelegt", "Kategorie = Rücklage → Betrag = Anteil", "abweichung", "exakt", "Kostenpositionen"),
  f("I-01.d", "Bank- und Portogebühren umgelegt", "Kategorie = Bank/Porto → Betrag = Anteil", "abweichung", "exakt", "Kostenpositionen"),
  f("I-02.a", "Sonstige Betriebskosten nicht vereinbart", "Kategorie = Sonstige und Bezeichnung nicht im Mietvertrag → Betrag = Anteil", "abweichung", "exakt", "Mietvertrag"),
  f("I-03.a", "Position keiner Kostenart zuordenbar", "Kategorie = unbekannt", "auffaelligkeit", "keiner", "Kostenpositionen"),
  f("I-04.a", "Heizung nicht nach Verbrauch abgerechnet", "Verbrauch nicht erfasst → Betrag = Heizkostenanteil × 15 %", "abweichung", "exakt", "Heizkostenabrechnung"),
  f("I-04.b", "Verbrauchsanteil außerhalb 50–70 %", "Verbrauchsanteil < 50 % oder > 70 %", "auffaelligkeit", "keiner", "Heizkostenabrechnung"),
  f("I-05.a", "Kabelkosten nach dem 30.06.2024", "Zeitraumbeginn ≥ 01.07.2024 → Betrag = Anteil", "abweichung", "exakt", "Zeitraum, Kabelposition"),
  f("I-05.b", "Kabelkosten über den 30.06.2024 hinaus", "möglicher Betrag = Anteil × Tage ab 01.07.2024 / Tage des Zeitraums", "auffaelligkeit", "bis_zu", "Zeitraum, Kabelposition"),
  f("I-06.a", "Aufzug trotz vertraglicher Ausnahme im Erdgeschoss", "Geschoss ≤ 0 und Ausnahme im Mietvertrag → Betrag = Σ Aufzugsanteile", "abweichung", "exakt", "Geschoss, Mietvertrag"),
  f("I-07.a", "Reparatur in Wartungsposition ausgewiesen", "Betrag = Anteil × Σ Reparaturbestandteile / Gesamtkosten", "abweichung", "exakt", "Aufschlüsselung der Position"),
  f("I-07.b", "Vollwartung ohne Aufschlüsselung", "Text nennt Vollwartung, keine Aufschlüsselung", "pruefbedarf", "keiner", "Bezeichnung, Erläuterungen"),
  f("I-07.c", "Reparaturen in der Bezeichnung genannt", "Bezeichnung nennt Reparatur/Instandsetzung, nicht verneint, keine Aufschlüsselung", "pruefbedarf", "keiner", "Bezeichnung, Erläuterungen"),
  f("I-08.a", "CO₂-Kosten falsch aufgeteilt", "|Kosten × Vermieterquote(kg CO₂ je m²) − Vermieteranteil| > 1 €", "abweichung", "keiner", "CO₂-Angaben der Heizkostenabrechnung"),
  f("I-09.a", "Frisch-/Schmutzwasser nicht nach Verbrauch trotz Zähler", "Wasserart ∈ {Frisch, Schmutz} und Schlüssel ≠ Verbrauch und Wasserzähler vorhanden", "auffaelligkeit", "keiner", "Angabe zum Wasserzähler"),
  f("I-10.a", "Miete für Rauchwarnmelder ausgewiesen", "Betrag = Anteil × Σ Mietbestandteile / Gesamtkosten", "abweichung", "exakt", "Aufschlüsselung der Position"),
  f("I-10.b", "Reine Mietposition für Rauchwarnmelder", "Bezeichnung nennt nur Miete → Betrag = Anteil", "abweichung", "exakt", "Bezeichnung"),
  f("I-10.c", "Miete und Wartung der Rauchwarnmelder vermischt", "Bezeichnung nennt Miete und Wartung, keine Aufschlüsselung", "pruefbedarf", "keiner", "Bezeichnung"),
  f("I-11.a", "Hauswart mit Reparatur- oder Verwaltungsarbeiten", "Bezeichnung nennt Reparatur/Verwaltung/Bereitschaft, nicht verneint", "pruefbedarf", "keiner", "Bezeichnung, Erläuterungen"),
  f("I-11.b", "Verwaltungs- oder Reparaturanteil im Hauswart ausgewiesen", "Betrag = Anteil × ausgewiesener nicht umlagefähiger Betrag / Gesamtkosten (aus Aufschlüsselung oder Text mit Betrag)", "abweichung", "exakt", "Aufschlüsselung oder Erläuterung mit Betrag"),
  f("I-12.a", "Gewerbe im Haus ohne Vorwegabzug", "Gewerbe vorhanden und keine Position mit Vorwegabzug", "auffaelligkeit", "keiner", "Angabe zu Gewerbe"),
  f("I-13.a", "Leerstand auf Mieter verteilt", "unterschiedliche Wohnungszahl N → möglicher Betrag = Σ Anteil × (1 − N / N_max)", "auffaelligkeit", "bis_zu", "Positionen nach Einheiten"),
  f("I-14.a", "Grundsteuer ab 2025 stark verändert", "|Grundsteuer − Vorjahr| / Vorjahr ≥ 20 %", "auffaelligkeit", "keiner", "Vorjahresabrechnung"),
  f("I-15.a", "Niederschlagswasser mehrfach berechnet", "Anzahl Positionen mit Wasserart = Niederschlagswasser > 1", "auffaelligkeit", "keiner", "Kostenpositionen"),

  // ---------- Plausibilität (nur Hinweise, außer neue Kostenart) ----------
  f("P-01.a", "Kostenart stark gestiegen", "(Kosten − Vorjahr) / Vorjahr > 10 % und Kosten − Vorjahr > 25 €", "hinweis", "keiner", "Vorjahresabrechnung"),
  f("P-01.b", "Neue Kostenart", "Kostenart im Vorjahr nicht vorhanden", "auffaelligkeit", "keiner", "Vorjahresabrechnung"),
  f("P-02.a", "Kalte Nebenkosten über dem Rahmen", "kalte Kosten / Wohnfläche / Monate > 2,50 €", "hinweis", "keiner", "Wohnfläche, Zeitraum"),
  f("P-03.a", "Warmwasser sehr teuer", "Warmwasserkosten / Warmwasserverbrauch > 20 € je m³", "hinweis", "keiner", "Heizkostenabrechnung"),
];

/**
 * Was sich aus der Abrechnung allein nicht berechnen lässt – dafür braucht es Belege oder einen Fachprüfer.
 * Bewusst dokumentiert, damit „100 %“ nicht mehr verspricht, als Formeln leisten können.
 */
export const NICHT_BERECHENBAR: readonly string[] = [
  "Gesamtkosten stimmen nicht mit den Rechnungen überein (nur durch Belegeinsicht prüfbar)",
  "Leistungen wurden abgerechnet, aber nicht erbracht",
  "Kosten sind unwirtschaftlich hoch (Vergleichswerte sind nur ein Hinweis)",
  "Verteilerschlüssel weicht vom Mietvertrag ab, wenn der Mietvertrag nicht vorliegt",
  "Wohn- oder Gesamtfläche ist tatsächlich falsch vermessen",
  "Zählerstände oder Verbrauchswerte wurden falsch abgelesen",
  "Kosten gehören in ein anderes Abrechnungsjahr",
];
