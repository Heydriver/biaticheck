# Regelkatalog v0.2 (Entwurf)

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
| R-04 | Einheitliche Wohn-, Gesamt- und Heizflächen | § 556a BGB | Auffälligkeit | – |
| R-05 | Angerechnete Vorauszahlungen passen zur Monatsrate | § 556 Abs. 2 BGB | Auffälligkeit mit Betrag | Rückfrage Zahlungen |
| I-01 | Keine nicht umlagefähigen Kosten (Verwaltung, Instandhaltung, Rücklage, Bank) | § 1 Abs. 2 BetrKV | Abweichung mit Betrag | – |
| I-02 | Sonstige Betriebskosten im Mietvertrag vereinbart | § 2 Nr. 17 BetrKV | Abweichung mit Betrag | Rückfrage Mietvertrag |
| I-03 | Jede Position einer Kostenart zuordenbar | § 2 BetrKV | Auffälligkeit | – |
| I-04 | Heizkosten: Verbrauchsanteil 50–70 %, Verbrauch erfasst (sonst 15 % Kürzung) | §§ 7, 8, 12 HeizkostenV | Abweichung / Auffälligkeit | Rückfrage Heizkostenabrechnung |
| I-05 | Kabel-/SAT-Kosten nur bis 30.06.2024 | § 2 Nr. 15 BetrKV, § 230 Abs. 4 TKG | Abweichung / Auffälligkeit (zeitanteilig) | – |
| I-06 | Aufzugskosten bei EG-Wohnung | BGH VIII ZR 103/06; Mietvertrag | Abweichung bei vertraglicher Ausnahme | Rückfrage Mietvertrag |
| I-07 | Wartung ohne Reparaturanteil (Vollwartung, Handwerkerleistung) | § 1 Abs. 2 BetrKV | Auffälligkeit | – |
| I-08 | CO₂-Kosten nach Stufenmodell aufgeteilt | CO2KostAufG | Abweichung | – |
| P-01 | Vorjahresvergleich (> 10 % und > 25 €; neue Kostenarten) | Wirtschaftlichkeitsgebot | Auffälligkeit | Rückfrage Vorjahresabrechnung |
| P-02 | Kalte Nebenkosten pro m² und Monat (Schwelle 2,50 € – **Entwurf**) | Betriebskostenspiegel | Auffälligkeit | Rückfrage Wohnfläche |
| P-03 | Warmwasserkosten pro m³ (Schwelle 20 € – **Entwurf**) | Wirtschaftlichkeitsgebot | Auffälligkeit | – |

Hinweis F-03: Gerechnet wird vorsichtig „Zugang + 12 Monate“ (taggenau). Ob die Frist erst zum Monatsende abläuft, soll das Expertenteam entscheiden.

## Nächste Regelkandidaten (aus Musterprüfungen ergänzen)

- Vorauszahlungen mit Mietvertrag/Kontoauszügen abgleichen
- Leerstand: Kosten für leere Wohnungen trägt der Vermieter
- Gewerbeanteil: Vorwegabzug bei gemischt genutzten Gebäuden
- Hauswart: Anteil für Verwaltung/Reparaturen herausgerechnet? (G-001)
- Gartenpflege/Reinigung: Doppelabrechnung mit Hauswart (G-001)
- Kennwerte je Kostenart, z. B. Müll, Hauswart (G-001)
- Plausibilität der Vorauszahlungsanpassung nach § 560 Abs. 4 BGB (G-001)
- Öffentlich geförderter Wohnraum: Sonderregeln NMV 1970, Umlageausfallwagnis (G-001)
- Versicherung: nur Gebäude-/Haftpflicht, keine Rechtsschutz- oder Mietausfallversicherung
- Grundsteuer: Plausibilität nach Grundsteuerreform 2025
- Zwischenablesung bei Mieterwechsel (Heizkosten)
- Rauchwarnmelder: Wartung umlagefähig, Miete/Kauf nicht
