# Regelkatalog v0.5 (Entwurf)

Alle Regeln haben den Stand **Entwurf** und müssen vom Expertenteam bestätigt werden.
Code: `packages/pruefkern/src/regeln/` · Tests: `packages/pruefkern/test/`

| ID | Regel | Grundlage | Ergebnis bei Verstoß | Wenn Daten fehlen |
|---|---|---|---|---|
| F-01 | Abrechnungszeitraum ≤ 12 Monate | § 556 Abs. 3 S. 1 BGB | Abweichung | nicht prüfbar |
| F-02 | Abrechnung innerhalb von 12 Monaten nach Ende des Zeitraums zugegangen | § 556 Abs. 3 S. 2, 3 BGB | verspätet, Zeitraum noch nicht bestätigt: **Prüfbedarf** (Nachzahlung zählt nicht); Zeitraum durch lückenlos anschließende Vorjahresabrechnung bestätigt: Abweichung, Nachzahlung entfällt | Eingangsdatum; Vorjahresabrechnung |
| F-03 | Einwendungsfrist des Mieters | § 556 Abs. 3 S. 5–6 BGB | Auffälligkeit (abgelaufen) | Rückfrage Zugangsdatum |
| F-04 | Gesamtkosten und Umlageschlüssel je Position | § 259 BGB; BGH VIII ZR 93/15 | Auffälligkeit | – |
| F-05 | Keine Abrechnung bei Pauschale | Mietvertrag | Abweichung | – |
| R-01 | Anteil je Position nachrechnen (inkl. Zeitanteil bei Ein-/Auszug) | § 556a BGB | Abweichung mit Betrag | nicht prüfbar |
| R-02 | Gesamtsumme der Positionen | Rechnerisch | Abweichung | – |
| R-03 | Saldo = Kosten − Vorauszahlungen | Rechnerisch | Abweichung | Rückfrage Vorauszahlungen |
| R-04 | Einheitliche Flächen; Flächennenner je Position = Gesamtfläche laut Abrechnung | § 556a BGB; § 7 Abs. 1 HeizkostenV | Kleinerer Nenner ohne Begründung: Fehler mit Betrag, wenn die Abrechnung selbst eine andere (beheizte) Gesamtfläche nennt; sonst Prüfbedarf mit „bis zu“-Betrag. Heizfläche ≠ Wohnfläche: nur Hinweis (beheizte Räume zulässig) | – |
| R-05 | Angerechnete Vorauszahlungen passen zu den tatsächlichen Zahlungen | § 556 Abs. 2 BGB | ohne Beleg: **Prüfbedarf** (Betrag zählt nicht zum Potenzial); mit belegtem Verlauf: Fehler mit Betrag | Vorjahresabrechnung |
| R-06 | Ein- oder Auszug im Abrechnungsjahr berücksichtigt (Mietbeginn/-ende laut Mietvertrag) | § 556a Abs. 1 BGB | Auffälligkeit mit „bis zu“-Betrag: zeitabhängige Kosten × Tage außerhalb der Mietzeit | Mietvertrag |
| R-07 | Wohnfläche der Abrechnung passt zum Mietvertrag (Toleranz 3 %) | § 556a BGB; BGH VIII ZR 220/17 (tatsächliche Fläche maßgeblich) | Auffälligkeit mit „bis zu“-Betrag auf nach Fläche verteilte Kosten | Mietvertrag |
| I-01 | Keine nicht umlagefähigen Kosten (Verwaltung, Instandhaltung, Rücklage, Bank) | § 1 Abs. 2 BetrKV | Abweichung mit Betrag | – |
| I-02 | Sonstige Betriebskosten im Mietvertrag vereinbart | § 2 Nr. 17 BetrKV | Abweichung mit Betrag | Rückfrage Mietvertrag |
| I-03 | Jede Position einer Kostenart zuordenbar | § 2 BetrKV | Auffälligkeit | – |
| I-04 | Heizkosten: Verbrauchsanteil 50–70 %, Verbrauch erfasst (sonst 15 % Kürzung) | §§ 7, 8, 12 HeizkostenV | Abweichung / Auffälligkeit | Rückfrage Heizkostenabrechnung |
| I-05 | Kabel-/SAT-Kosten nur bis 30.06.2024 | § 2 Nr. 15 BetrKV, § 230 Abs. 4 TKG | Abweichung / Auffälligkeit (zeitanteilig) | – |
| I-06 | Aufzugskosten bei EG-Wohnung | BGH VIII ZR 103/06; Mietvertrag | Abweichung bei vertraglicher Ausnahme | Rückfrage Mietvertrag |
| I-07 | Wartung ohne Reparaturanteil | § 2 Nr. 7, § 1 Abs. 2 Nr. 2 BetrKV | Betrieb, Wartung, Prüfung allein: kein Befund. Ausgewiesener Reparaturbestandteil: Fehler nur in dessen Höhe (geht pauschaler Ausschlusserklärung vor). Vollwartung ohne Aufschlüsselung oder ausdrücklich genannte Reparaturen: Prüfbedarf ohne Betrag. Verneinungen („keine Reparaturkosten“) werden erkannt | Rechnungen, Wartungsvertrag |
| I-08 | CO₂-Kosten nach Stufenmodell aufgeteilt | CO2KostAufG | Abweichung | – |
| I-09 | Frisch- und Schmutzwasser nach Verbrauch, wenn der Verbrauch erfasst wird | § 556a Abs. 1 S. 2 BGB; § 2 Nr. 2, 3 BetrKV | Mit Zähler: Prüfbedarf ohne Betrag. Niederschlagswasser ist ausgenommen (Gebühr nach versiegelter Fläche, Verteilung nach Wohnfläche ist Regelfall). Sammelposition „Wasser/Abwasser“: nur Hinweis, Inhalt klären | Rückfrage: eigener Wasserzähler? (offene Frage, nicht bei Niederschlagswasser) |
| I-15 | Niederschlagswasser nicht doppelt berechnet | § 2 Nr. 3 BetrKV | Mehrfach angesetzt: Prüfbedarf ohne Betrag | Gebührenbescheid |
| I-10 | Rauchwarnmelder: nur Wartung, keine Miete | BGH VIII ZR 379/20 | Ausgewiesener Mietanteil: Fehler nur in dessen Höhe; nur Miete: Fehler; gemischt ohne Aufschlüsselung: Prüfbedarf ohne Betrag | Rechnung mit getrennter Miete/Wartung |
| I-11 | Hauswart ohne Reparatur-, Verwaltungs- oder Bereitschaftsanteil | § 2 Nr. 14, § 1 Abs. 2 BetrKV | Genannt (nicht verneint): Prüfbedarf ohne Betrag; nur > 130 % des Bundesdurchschnitts: Vergleichshinweis | Hauswartvertrag, Leistungsverzeichnis |
| I-12 | Vorwegabzug bei Gewerbe im Haus | § 556a BGB; BGH VIII ZR 78/05 | Gewerbe ja, kein Vorwegabzug: Auffälligkeit ohne Betrag | Rückfrage: Gewerbe im Haus? |
| I-13 | Leerstand trägt der Vermieter (gleiche Wohnungsanzahl bei nach Einheiten verteilten Kosten) | § 556a BGB; BGH VIII ZR 159/05 | Auffälligkeit mit „bis zu“-Betrag | – |
| I-14 | Grundsteuer ab 2025: Änderung ≥ 20 % gegenüber Vorjahr belegt | § 2 Nr. 1 BetrKV; GrStG | Auffälligkeit, Grundsteuerbescheid anfordern | Vorjahresabrechnung |
| P-01 | Vorjahresvergleich (> 10 % und > 25 €; neue Kostenarten) | Wirtschaftlichkeitsgebot | Anstieg: Vergleichshinweis; neue Kostenart: Prüfbedarf | Rückfrage Vorjahresabrechnung |
| P-02 | Kalte Nebenkosten pro m² und Monat (Schwelle 2,50 € – **Entwurf**) | Betriebskostenspiegel | Vergleichshinweis (kein Fehler) | Rückfrage Wohnfläche |
| P-03 | Warmwasserkosten pro m³ (Schwelle 20 € – **Entwurf**) | Wirtschaftlichkeitsgebot | Vergleichshinweis (kein Fehler) | – |

Hinweis F-03: Gerechnet wird vorsichtig „Zugang + 12 Monate“ (taggenau). Ob die Frist erst zum Monatsende abläuft, soll das Expertenteam entscheiden.

## Nächste Regelkandidaten (aus Musterprüfungen ergänzen)

- Gartenpflege/Reinigung: Doppelabrechnung mit Hauswart (G-001)
- Kennwerte je Kostenart, z. B. Müll, Hauswart (G-001)
- Plausibilität der Vorauszahlungsanpassung nach § 560 Abs. 4 BGB (G-001)
- Öffentlich geförderter Wohnraum: Sonderregeln NMV 1970, Umlageausfallwagnis (G-001)
- Versicherung: nur Gebäude-/Haftpflicht, keine Rechtsschutz- oder Mietausfallversicherung
- Zwischenablesung bei Mieterwechsel (Heizkosten)

## Ergebnisstufen und Prüfbedarf

| Stufe | Bedeutung | zählt zum Potenzial |
|---|---|---|
| Fehler (`abweichung`) | eindeutig | ja, sicher |
| Auffällig (`auffaelligkeit`) | wahrscheinlich, Belegeinsicht nötig | ja, „zu klären“ |
| Prüfbedarf (`pruefbedarf`) | möglicher Fehler, aber erst mit weiteren Unterlagen sicher | **nein** – der Kunde wird um die Unterlage gebeten (`unterlagen`), danach wird neu geprüft |
| Nicht prüfbar (`nicht_pruefbar`) | Angaben fehlen | nein |

Leitlinie: Ein Betrag erscheint erst dann als mögliche Ersparnis, wenn das Tool sich sicher genug ist. Sonst lieber eine Unterlage nachfordern als ein Schreiben mit einer falschen Forderung empfehlen.

## Einordnung der Ergebnisse (ab v0.5)

| Einordnung | Status | Zählt als Fehler | Zählt zum Potenzial |
|---|---|---|---|
| Belegter Fehler | abweichung | ja | ja (sicher) |
| Begründeter Prüfbedarf | auffaelligkeit, pruefbedarf | nein | nur „bis zu“, nur wenn bezifferbar; sonst „Auswirkung noch nicht bezifferbar“ |
| Hinweis | hinweis | nein | nein |
| Vergleichswert | hinweis (art „vergleich“) | nein | nein |
| Offene Frage | nicht_pruefbar | nein | nein |

Beträge werden getrennt: abgerechneter Anteil (Fakt „Ihr Anteil“), möglicherweise betroffener Betrag (`betroffen`, kein Potenzial) und belegtes Korrekturpotenzial (`betragZugunstenMieter` bei Fehlern). Jeder Befund trägt seine Textstelle (`textstelle`), Zahlen (`fakten`/`beleg`) und Regel (`grundlage`).

Kostenvergleich: ausdrücklich „Vergleich mit dem Bundesdurchschnitt“, solange keine regionalen Daten genutzt werden; Quelle, Jahr und Kostenarten werden angezeigt. Ohne Heizkosten in der Abrechnung wird nur kalt mit kalt verglichen. Regionale Werte erst bei ≥ 10 Abrechnungen desselben Jahres mit Heizkosten und Streuung ≤ 50 %. Monate kalendergenau (ein Kalenderjahr = 12), Rundung erst bei der Ausgabe.

Rechtsgrundlagen geprüft am 09.11.2026 gegen gesetze-im-internet.de: § 1, § 2 BetrKV; § 556, § 556a BGB; § 7 HeizkostenV.

## Zwei Unterschritte der Prüfung (ab v0.6)

1. **Formelprüfung Zeile für Zeile** (`packages/pruefkern/src/zeilenprotokoll.ts`): Jede Kostenposition, die Heizkosten, Summe, Vorauszahlungen, Saldo und Fristen bilden je eine Zeile. Zu jeder Zeile steht, welche Formeln angewendet wurden und mit welchem Ergebnis. Jede Position durchläuft mindestens „Angaben vollständig“, „Anteil nachgerechnet“ und „Kostenart umlagefähig“. Die Vollständigkeitsformel prüft, dass die Summe aller Zeilen die ausgewiesene Gesamtsumme ergibt. Fehlerarten und Formeln: `docs/FORMELKATALOG.md`.
2. **KI-Kontrolle** (`packages/auslesen/src/kontrolle.ts`): Die KI vergleicht das Zeilenprotokoll mit dem Originaldokument: (a) jede Zeile richtig gelesen, (b) keine Zeile des Dokuments fehlt, (c) Auffälligkeiten, die keine Formel erfasst. Feste Regeln für die Auswertung: Eine Zeile gilt nur als bestätigt, wenn die KI sie ausdrücklich bestätigt; Auffälligkeiten ohne wörtliche Textstelle werden verworfen; die KI ändert keine Beträge und entscheidet nichts.

Besteht die KI-Kontrolle nicht (Lesefehler, fehlende Zeile, zusätzliche Auffälligkeit) oder kann sie nicht ausgeführt werden, wird das Ergebnis nicht automatisch freigegeben, sondern geht mit den Meldungen an einen Fachprüfer.

## Einstufung des Fehlerpotenzials (ab v0.7)

| Lage | Einstufung |
|---|---|
| Belegter Fehler, sicherer Betrag ≥ 30 € | hoch |
| Belegter Fehler, sicherer Betrag < 30 € | gering |
| Kein belegter Fehler, aber eine Unterlage fehlt noch | Prüfbedarf |
| Nur Punkte zum Klären, keine Unterlage offen | gering |
| Nichts gefunden | kein Fehler erkannt |

Kontoauszüge und Mietkonto werden nicht mehr angefordert. Für Vorauszahlungen und Abrechnungsfrist genügt die Abrechnung des Vorjahres; alternativ kann der Kunde seine monatlichen Vorauszahlungen selbst eintragen.

## Ergänzungen v0.8 (aus dem Test „Abrechnung 04“)

- **I-11 Hauswart:** Weist die Abrechnung einen Betrag für Verwaltung, Reparaturen oder Bereitschaft aus – in einer Aufschlüsselung oder in einem Satz wie „Das Jahresentgelt enthält 480 € für Mietkonten …“ –, ist genau dieser Anteil ein belegter Fehler (Betrag × Anteil / Gesamtkosten). Dasselbe gilt für Reparaturbeträge in Wartungspositionen (I-07).
- **R-04 Leerstand:** Wird eine Position auf eine kleinere Fläche verteilt und nennt die Abrechnung Leerstand als Grund, ist das ein belegter Fehler (BGH VIII ZR 159/05). Ohne genannten Grund bleibt es Prüfbedarf mit „bis zu“-Betrag. Fehlt die Gesamtfläche, gilt die Fläche, die die Mehrheit der Positionen verwendet.
- **R-05 Vorauszahlungen:** Belegt die Abrechnung selbst in einer Buchungs- oder Zahlungsübersicht höhere Zahlungen als angerechnet, ist die Differenz ein belegter Fehler. Dafür ist keine nachgereichte Unterlage nötig.

## Ergänzungen v0.9 (aus dem Test „Musterabrechnung 05“)

- **I-07 Reparatur laut Leistungsnachweis:** Beschreibt der Leistungsnachweis einer Position die Arbeit als Reparatur oder Instandsetzung (z. B. „schadhafte Putzflächen repariert“) und ist die Position keine Wartung, ist die ganze Position ein belegter Fehler. Bezeichnungen wie „Gebäudeunterhaltung“ gelten in der Stichwortzuordnung als Instandhaltung. Gartenpflege ist ausgenommen (Erneuerung von Pflanzen ist umlagefähig, § 2 Nr. 10 BetrKV).
- **I-16 Doppelberechnung (neu):** Zwei Positionen mit derselben Rechnungs-/Belegnummer und nicht erkennbar aufgeteilten Beträgen → belegter Fehler in Höhe des kleineren Anteils. Gleiche Kostenart mit identischen Gesamtkosten und identischem Anteil ohne Rechnungsnummer → Prüfbedarf „bis zu“.
- **R-08 Zählerstände (neu):** Verbrauch laut Zähler = Endstand − Anfangsstand. Weicht der abgerechnete Verbrauch ab, ist jede danach verteilte Wasserposition anteilig falsch: Anteil × Mehrverbrauch / abgerechneter Verbrauch.
- **Keine Doppelzählung:** Beanstanden mehrere Regeln dieselbe Position, zählt für das Einsparpotenzial nur der höchste Betrag.
- **I-17 Versicherungen (neu, aus „Abrechnung 06“):** Umlagefähig sind nur Sach- und Haftpflichtversicherungen für das Gebäude (§ 2 Nr. 13 BetrKV). Nennt die Abrechnung – auch nur in einer Erläuterung – einen Betrag für Rechtsschutz, Mietausfall, Hausrat oder Ähnliches, ist genau dieser Anteil ein belegter Fehler. Reine Positionen dieser Art sind ganz zu streichen. Ohne Betrag: Prüfbedarf. Erläuterungen werden jetzt über alle Kennwörter der Bezeichnung zugeordnet (z. B. „Hauspaket“).

## Belegabgleich (v0.10, aus dem Test „Familie Yilmaz“)

Beigefügte Rechnungen, Gutschriften und Geräteprotokolle werden ausgelesen und mit der Abrechnung abgeglichen. Betrag für die Wohnung = Hausbetrag × Anteil / Gesamtkosten der Position.

- **R-09 Belegabgleich (neu):**
  - Beleg betrifft ein anderes Haus → ganzer Beleg nicht umlagefähig.
  - Übernommener Betrag größer als der Betrag laut Beleg → Differenz ist ein belegter Fehler. Entspricht die Differenz 19 % oder 7 % des Belegs, wird sie als doppelt aufgeschlagene Umsatzsteuer benannt.
  - Gutschrift nicht abgezogen: belegt, wenn die Rechnungen ohne Gutschrift genau die abgerechneten Gesamtkosten ergeben oder die Abrechnung sie erkennbar übergeht; sonst Prüfbedarf.
- **R-08 Wärmezähler:** gemessener Verbrauch = (Endstand − Anfangsstand) × Faktor laut Geräteprotokoll. Rechnet die Abrechnung mit einem anderen Faktor oder Verbrauch: Verbrauchskosten × Mehrverbrauch / abgerechneter Verbrauch.
- **Mehrere Fehler an einer Position:** Teilbeträge werden addiert, zusammen nie mehr als der Anteil der Position.

## Anklickbare Werte (v0.11)

Jeder berechnete Wert ist anklickbar und zeigt eine kurze Erklärung mit den Zahlen, aus denen er entsteht: Gesamtbetrag, Einstufung des Fehlerpotenzials, Nachzahlung oder Guthaben, korrigiertes Ergebnis, Einspruchsfrist, Kostenvergleich und der Betrag jedes Befunds. Die Texte entstehen im Prüfkern (`Stufe1.erklaerungen`). In der kostenlosen Ansicht der Web-App zeigt der Befundbetrag nur den Rechenweg aus den sichtbaren Zahlen; die ausführliche Erklärung gehört zum Erledigen-Paket.

## KI-Funde bei den gefundenen Punkten (v0.12)

Auffälligkeiten, die nur die KI-Kontrolle im Dokument findet, werden als Regel **K-01** in die Prüfung übernommen (`kontrollbefunde`). Sie erscheinen bei „Das haben wir gefunden“ als begründeter Prüfbedarf mit wörtlicher Textstelle und ohne Betrag, zählen zur Einstufung, aber nie als belegter Fehler. Ins Schreiben an die Hausverwaltung kommt nur das Zitat aus der Abrechnung mit der Bitte um Erläuterung, nicht die Deutung der KI. In der Web-App geht ein Fall mit KI-Fund weiterhin zuerst an den Fachprüfer.
