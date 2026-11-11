# Formelkatalog

Automatisch erzeugt aus `packages/pruefkern/src/fehlerkatalog.ts`. Nicht von Hand ändern:
`UPDATE_FORMELKATALOG=1 pnpm --filter @biaticheck/pruefkern test`.

Der Prüfkern erkennt 46 Fehlerarten in 30 Regeln allein durch Formeln. Die KI liest nur die Werte aus dem Dokument.
Nachweis: `packages/pruefkern/test/fehlerkatalog.test.ts` baut jede Fehlerart in 25 Zufallsvarianten ein (1150 Fälle) und prüft 300 korrekte Abrechnungen auf Fehlalarme.

| ID | Fehlerart | Formel | Ergebnis | Betrag | Braucht |
|---|---|---|---|---|---|
| F-01.a | Abrechnungszeitraum länger als 12 Monate | bis ≥ von + 12 Monate | Belegter Fehler | nicht bezifferbar | Abrechnungszeitraum |
| F-02.a | Abrechnung verspätet, Zeitraum bestätigt | Zugang > Zeitraumende + 12 Monate und Saldo > 0 und Zeitraum bestätigt → Betrag = Saldo | Belegter Fehler | exakt | Zeitraum, Zugangsdatum, Saldo, Vorjahresabrechnung |
| F-02.b | Abrechnung möglicherweise verspätet | Zugang > Zeitraumende + 12 Monate und Saldo > 0, Zeitraum noch nicht bestätigt → möglicher Betrag = Saldo | Prüfbedarf (Unterlage nötig) | bis zu | Zeitraum, Zugangsdatum, Saldo |
| F-02.c | Abrechnung verspätet bei Guthaben | Zugang > Zeitraumende + 12 Monate und Saldo ≤ 0 | Begründeter Prüfbedarf | nicht bezifferbar | Zeitraum, Zugangsdatum, Saldo |
| F-03.a | Einwendungsfrist abgelaufen | heute > Zugang + 12 Monate | Begründeter Prüfbedarf | nicht bezifferbar | Zugangsdatum |
| F-04.a | Gesamtkosten einer Position fehlen | Position ohne Gesamtkosten (außer direkt zugeordnet) | Begründeter Prüfbedarf | nicht bezifferbar | Kostenpositionen |
| F-04.b | Umlageschlüssel einer Position fehlt | Position ohne Umlageschlüssel | Begründeter Prüfbedarf | nicht bezifferbar | Kostenpositionen |
| F-05.a | Abrechnung trotz Pauschale | Pauschale vereinbart → Betrag = Saldo, falls Saldo > 0 | Belegter Fehler | exakt | Mietvertrag, Saldo |
| R-01.a | Anteil einer Position falsch berechnet | Betrag = Anteil − Gesamtkosten × AnteilEinheit / AnteilGesamt × Zeitanteil, falls \|Betrag\| > 0,05 € | Belegter Fehler | exakt | Gesamtkosten, Umlageschlüssel, Anteil |
| R-02.a | Gesamtsumme falsch addiert | Betrag = ausgewiesene Summe − (Σ Anteile der Positionen + Heizkostenanteil), falls \|Betrag\| > 0,05 € | Belegter Fehler | exakt | Positionen, ausgewiesene Summe |
| R-03.a | Saldo falsch berechnet | Betrag = ausgewiesener Saldo − (Summe − Vorauszahlungen), falls \|Betrag\| > 0,05 € | Belegter Fehler | exakt | Summe, Vorauszahlungen, Saldo |
| R-04.a | Falscher Flächennenner bei Heizkosten | Nenner ≠ Gesamtfläche und Abrechnung nennt dieselbe beheizte Gesamtfläche → Betrag = Anteil − Gesamtkosten × AnteilEinheit / Gesamtfläche | Belegter Fehler | exakt | Gesamtfläche, beheizte Gesamtfläche, Position |
| R-04.b | Kleinerer Flächennenner ohne Begründung | Nenner < Gesamtfläche, keine Begründung in der Abrechnung → möglicher Betrag = Anteil − Gesamtkosten × AnteilEinheit / Gesamtfläche | Begründeter Prüfbedarf | bis zu | Gesamtfläche, Position |
| R-04.c | Unterschiedliche Wohnflächen für dieselbe Wohnung | Anzahl verschiedener AnteilEinheit (Fläche) > 1 | Begründeter Prüfbedarf | nicht bezifferbar | Positionen nach Fläche |
| R-05.a | Vorauszahlungen zu niedrig angerechnet (belegt) | Betrag = Σ Monatsbeträge laut Beleg − angerechnete Vorauszahlungen, falls > 1 € | Belegter Fehler | exakt | Vorjahresabrechnung oder Kontoauszüge |
| R-05.b | Vorauszahlungen möglicherweise zu niedrig angerechnet | möglicher Betrag = Monatsbetrag × Monate − angerechnete Vorauszahlungen, falls > 1 € | Prüfbedarf (Unterlage nötig) | bis zu | Monatsbetrag laut Schreiben |
| R-06.a | Ein- oder Auszug nicht berücksichtigt | möglicher Betrag = zeitabhängige Kosten × (1 − Miettage / Tage des Zeitraums) | Begründeter Prüfbedarf | bis zu | Mietvertrag (Mietbeginn/-ende) |
| R-07.a | Mehr Wohnfläche als im Mietvertrag | (Fläche Abrechnung − Fläche Vertrag) / Fläche Vertrag > 3 % → möglicher Betrag = Kosten nach Fläche × (1 − Fläche Vertrag / Fläche Abrechnung) | Begründeter Prüfbedarf | bis zu | Mietvertrag (Wohnfläche) |
| I-01.a | Verwaltungskosten umgelegt | Kategorie = Verwaltung → Betrag = Anteil | Belegter Fehler | exakt | Kostenpositionen |
| I-01.b | Reparaturen/Instandhaltung umgelegt | Kategorie = Instandhaltung → Betrag = Anteil | Belegter Fehler | exakt | Kostenpositionen |
| I-01.c | Rücklage umgelegt | Kategorie = Rücklage → Betrag = Anteil | Belegter Fehler | exakt | Kostenpositionen |
| I-01.d | Bank- und Portogebühren umgelegt | Kategorie = Bank/Porto → Betrag = Anteil | Belegter Fehler | exakt | Kostenpositionen |
| I-02.a | Sonstige Betriebskosten nicht vereinbart | Kategorie = Sonstige und Bezeichnung nicht im Mietvertrag → Betrag = Anteil | Belegter Fehler | exakt | Mietvertrag |
| I-03.a | Position keiner Kostenart zuordenbar | Kategorie = unbekannt | Begründeter Prüfbedarf | nicht bezifferbar | Kostenpositionen |
| I-04.a | Heizung nicht nach Verbrauch abgerechnet | Verbrauch nicht erfasst → Betrag = Heizkostenanteil × 15 % | Belegter Fehler | exakt | Heizkostenabrechnung |
| I-04.b | Verbrauchsanteil außerhalb 50–70 % | Verbrauchsanteil < 50 % oder > 70 % | Begründeter Prüfbedarf | nicht bezifferbar | Heizkostenabrechnung |
| I-05.a | Kabelkosten nach dem 30.06.2024 | Zeitraumbeginn ≥ 01.07.2024 → Betrag = Anteil | Belegter Fehler | exakt | Zeitraum, Kabelposition |
| I-05.b | Kabelkosten über den 30.06.2024 hinaus | möglicher Betrag = Anteil × Tage ab 01.07.2024 / Tage des Zeitraums | Begründeter Prüfbedarf | bis zu | Zeitraum, Kabelposition |
| I-06.a | Aufzug trotz vertraglicher Ausnahme im Erdgeschoss | Geschoss ≤ 0 und Ausnahme im Mietvertrag → Betrag = Σ Aufzugsanteile | Belegter Fehler | exakt | Geschoss, Mietvertrag |
| I-07.a | Reparatur in Wartungsposition ausgewiesen | Betrag = Anteil × Σ Reparaturbestandteile / Gesamtkosten | Belegter Fehler | exakt | Aufschlüsselung der Position |
| I-07.b | Vollwartung ohne Aufschlüsselung | Text nennt Vollwartung, keine Aufschlüsselung | Prüfbedarf (Unterlage nötig) | nicht bezifferbar | Bezeichnung, Erläuterungen |
| I-07.c | Reparaturen in der Bezeichnung genannt | Bezeichnung nennt Reparatur/Instandsetzung, nicht verneint, keine Aufschlüsselung | Prüfbedarf (Unterlage nötig) | nicht bezifferbar | Bezeichnung, Erläuterungen |
| I-08.a | CO₂-Kosten falsch aufgeteilt | \|Kosten × Vermieterquote(kg CO₂ je m²) − Vermieteranteil\| > 1 € | Belegter Fehler | nicht bezifferbar | CO₂-Angaben der Heizkostenabrechnung |
| I-09.a | Frisch-/Schmutzwasser nicht nach Verbrauch trotz Zähler | Wasserart ∈ {Frisch, Schmutz} und Schlüssel ≠ Verbrauch und Wasserzähler vorhanden | Begründeter Prüfbedarf | nicht bezifferbar | Angabe zum Wasserzähler |
| I-10.a | Miete für Rauchwarnmelder ausgewiesen | Betrag = Anteil × Σ Mietbestandteile / Gesamtkosten | Belegter Fehler | exakt | Aufschlüsselung der Position |
| I-10.b | Reine Mietposition für Rauchwarnmelder | Bezeichnung nennt nur Miete → Betrag = Anteil | Belegter Fehler | exakt | Bezeichnung |
| I-10.c | Miete und Wartung der Rauchwarnmelder vermischt | Bezeichnung nennt Miete und Wartung, keine Aufschlüsselung | Prüfbedarf (Unterlage nötig) | nicht bezifferbar | Bezeichnung |
| I-11.a | Hauswart mit Reparatur- oder Verwaltungsarbeiten | Bezeichnung nennt Reparatur/Verwaltung/Bereitschaft, nicht verneint | Prüfbedarf (Unterlage nötig) | nicht bezifferbar | Bezeichnung, Erläuterungen |
| I-12.a | Gewerbe im Haus ohne Vorwegabzug | Gewerbe vorhanden und keine Position mit Vorwegabzug | Begründeter Prüfbedarf | nicht bezifferbar | Angabe zu Gewerbe |
| I-13.a | Leerstand auf Mieter verteilt | unterschiedliche Wohnungszahl N → möglicher Betrag = Σ Anteil × (1 − N / N_max) | Begründeter Prüfbedarf | bis zu | Positionen nach Einheiten |
| I-14.a | Grundsteuer ab 2025 stark verändert | \|Grundsteuer − Vorjahr\| / Vorjahr ≥ 20 % | Begründeter Prüfbedarf | nicht bezifferbar | Vorjahresabrechnung |
| I-15.a | Niederschlagswasser mehrfach berechnet | Anzahl Positionen mit Wasserart = Niederschlagswasser > 1 | Begründeter Prüfbedarf | nicht bezifferbar | Kostenpositionen |
| P-01.a | Kostenart stark gestiegen | (Kosten − Vorjahr) / Vorjahr > 10 % und Kosten − Vorjahr > 25 € | Hinweis | nicht bezifferbar | Vorjahresabrechnung |
| P-01.b | Neue Kostenart | Kostenart im Vorjahr nicht vorhanden | Begründeter Prüfbedarf | nicht bezifferbar | Vorjahresabrechnung |
| P-02.a | Kalte Nebenkosten über dem Rahmen | kalte Kosten / Wohnfläche / Monate > 2,50 € | Hinweis | nicht bezifferbar | Wohnfläche, Zeitraum |
| P-03.a | Warmwasser sehr teuer | Warmwasserkosten / Warmwasserverbrauch > 20 € je m³ | Hinweis | nicht bezifferbar | Heizkostenabrechnung |

## Nicht aus der Abrechnung berechenbar

Diese Fehler stehen nicht in den Zahlen der Abrechnung. Sie brauchen Belege oder einen Fachprüfer:

- Gesamtkosten stimmen nicht mit den Rechnungen überein (nur durch Belegeinsicht prüfbar)
- Leistungen wurden abgerechnet, aber nicht erbracht
- Kosten sind unwirtschaftlich hoch (Vergleichswerte sind nur ein Hinweis)
- Verteilerschlüssel weicht vom Mietvertrag ab, wenn der Mietvertrag nicht vorliegt
- Wohn- oder Gesamtfläche ist tatsächlich falsch vermessen
- Zählerstände oder Verbrauchswerte wurden falsch abgelesen
- Kosten gehören in ein anderes Abrechnungsjahr
