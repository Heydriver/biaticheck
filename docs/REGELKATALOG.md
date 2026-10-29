# Regelkatalog v0.1 (Entwurf)

Alle Regeln haben den Stand **Entwurf** und müssen vom Expertenteam bestätigt werden.
Code: `packages/pruefkern/src/regeln/` · Tests: `packages/pruefkern/test/`

| ID | Regel | Grundlage | Ergebnis bei Verstoß | Wenn Daten fehlen |
|---|---|---|---|---|
| F-01 | Abrechnungszeitraum ≤ 12 Monate | § 556 Abs. 3 S. 1 BGB | Abweichung | nicht prüfbar |
| F-02 | Abrechnungsfrist (12 Monate nach Ende des Zeitraums) | § 556 Abs. 3 S. 2–3 BGB | Abweichung: Nachzahlung entfällt | Rückfrage Zugangsdatum |
| F-03 | Einwendungsfrist des Mieters | § 556 Abs. 3 S. 5–6 BGB | Auffälligkeit (abgelaufen) | Rückfrage Zugangsdatum |
| F-04 | Gesamtkosten und Umlageschlüssel je Position | § 259 BGB; BGH VIII ZR 93/15 | Auffälligkeit | – |
| F-05 | Keine Abrechnung bei Pauschale | Mietvertrag | Abweichung | – |
| R-01 | Anteil je Position nachrechnen (inkl. Zeitanteil bei Ein-/Auszug) | § 556a BGB | Abweichung mit Betrag | nicht prüfbar |
| R-02 | Gesamtsumme der Positionen | Rechnerisch | Abweichung | – |
| R-03 | Saldo = Kosten − Vorauszahlungen | Rechnerisch | Abweichung | Rückfrage Vorauszahlungen |
| R-04 | Einheitliche Wohn- und Gesamtflächen | § 556a BGB | Auffälligkeit | – |
| I-01 | Keine nicht umlagefähigen Kosten (Verwaltung, Instandhaltung, Rücklage, Bank) | § 1 Abs. 2 BetrKV | Abweichung mit Betrag | – |
| I-02 | Sonstige Betriebskosten im Mietvertrag vereinbart | § 2 Nr. 17 BetrKV | Abweichung mit Betrag | Rückfrage Mietvertrag |
| I-03 | Jede Position einer Kostenart zuordenbar | § 2 BetrKV | Auffälligkeit | – |
| I-04 | Heizkosten: Verbrauchsanteil 50–70 %, Verbrauch erfasst (sonst 15 % Kürzung) | §§ 7, 8, 12 HeizkostenV | Abweichung / Auffälligkeit | Rückfrage Heizkostenabrechnung |
| P-01 | Vorjahresvergleich (> 10 % und > 25 €; neue Kostenarten) | Wirtschaftlichkeitsgebot | Auffälligkeit | Rückfrage Vorjahresabrechnung |
| P-02 | Kalte Nebenkosten pro m² und Monat (Schwelle 2,50 € – **Entwurf**) | Betriebskostenspiegel | Auffälligkeit | Rückfrage Wohnfläche |

## Nächste Regelkandidaten (aus Musterprüfungen ergänzen)

- Vorauszahlungen mit Mietvertrag/Kontoauszügen abgleichen
- Leerstand: Kosten für leere Wohnungen trägt der Vermieter
- Gewerbeanteil: Vorwegabzug bei gemischt genutzten Gebäuden
- Hauswart: Anteil für Verwaltung/Reparaturen herausgerechnet?
- Gartenpflege/Reinigung: Doppelabrechnung mit Hauswart
- Versicherung: nur Gebäude-/Haftpflicht, keine Rechtsschutz- oder Mietausfallversicherung
- Grundsteuer: Plausibilität nach Grundsteuerreform 2025
- CO₂-Kosten-Aufteilung nach CO2KostAufG
- Zwischenablesung bei Mieterwechsel (Heizkosten)
- Rauchwarnmelder: Wartung umlagefähig, Miete/Kauf nicht
