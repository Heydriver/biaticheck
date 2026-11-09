# BiatiCheck

Automatisierte Prüfung von Nebenkostenabrechnungen auf Basis von Expertenwissen.

- [Architektur](docs/ARCHITEKTUR.md)
- [Regelkatalog](docs/REGELKATALOG.md)
- [Vorlage Prüfprotokoll und Regelkarte](docs/REGELKARTE-VORLAGE.md)
- Musterprüfungen: [G-001](docs/musterpruefung/G-001.md)

## Aufbau

| Paket | Aufgabe |
|---|---|
| `packages/pruefkern` | Datenschema, Prüfregeln, Rückfragen, kostenlose Erstauswertung – ohne Abhängigkeit zu Web oder Datenbank |
| `packages/auslesen` | PDF/Foto → Datenschema über die Claude API, mit Selbstkontrolle der ausgelesenen Zahlen |
| `apps/web` | Next.js-App: Upload, Fallseite, Rückfragen, API, Datenbank (PostgreSQL/Drizzle), verschlüsselte Dateiablage |

## Entwicklung

Voraussetzungen: Node.js 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # Werte eintragen
pnpm --filter @biaticheck/web db:migrate
pnpm dev                                        # http://localhost:3000
```

Qualitätskontrolle (läuft auch automatisch bei jedem Push in GitHub Actions):

```bash
pnpm typecheck
pnpm test         # Prüfkern, Auslesen, Web (inkl. Datenbank-Integrationstests)
pnpm test:e2e     # Browser-Tests auf Handy- und Desktop-Größe
```

Auslesen einer echten Abrechnung und Vergleich mit dem Golden Set (benötigt `ANTHROPIC_API_KEY`):

```bash
pnpm auslesen pfad/zur/abrechnung.pdf --golden G-001
```

## Ergebnis für den Kunden

Leitlinie: Der Kunde will keine Details, sondern eine Lösung. Wenig Text, kein Fachjargon, ein Hauptknopf.

| Teil | Inhalt | Zugang |
|---|---|---|
| Ergebnis | eine Kernaussage (z. B. „Bis zu 1.236,44 € könnten falsch abgerechnet sein.“), Anzahl der Punkte, Nachzahlung, Frist für Einspruch, Abweichung vom Durchschnitt (DMB-Betriebskostenspiegel, regional nach PLZ ab 10 Fällen) | kostenlos |
| Lösung | **eine** Empfehlung (`empfehlung`) mit Hauptknopf: Schreiben an die Hausverwaltung oder Experten beauftragen; darunter die beanstandeten Punkte als Einzeiler (`kurz`); Punkte, die nur mit dem Mietvertrag prüfbar sind, eingeklappt | nach Freischaltung |

Die ausführlichen Texte (`befund`, `loesung`, `zusammenfassung`) bleiben im Datenmodell für Experten und den späteren PDF-Bericht, werden dem Kunden aber nicht angezeigt. Tests begrenzen die Länge der Kurztexte und die Textmenge der Seite.

Stufe 2 wird erst nach der Freischaltung an den Browser geschickt. Lösungsvorschläge stehen in den Regeln bzw. zentral in `packages/pruefkern/src/stufen.ts` (`LOESUNGSVORSCHLAEGE`); ein Test stellt sicher, dass jeder Befund einen hat und Kundentexte keine Emojis oder Formatierungszeichen enthalten. Vergleichswerte: `packages/pruefkern/src/vergleich.ts` (Quelle je Wert).

Konfiguration: `ZAHLUNG_MODUS` (`test` = Freischaltung ohne Bezahlung, im Produktivbetrieb nur mit `ERLAUBE_TESTZAHLUNG=true`; Standard dort `aus`), `DEMO_AUSLESEN=true` wertet ohne API-Schlüssel die Musterabrechnung aus (im Produktivbetrieb gesperrt).

## Interner Prüfbereich

Unter `/intern` korrigieren Experten ausgelesene Daten (PDF und Formular nebeneinander), prüfen neu und geben Ergebnisse für Kunden frei. Bei jeder Freigabe wird protokolliert, welche Felder und Regelergebnisse der Experte gegenüber der KI geändert hat – die Datengrundlage für die schrittweise Auto-Freigabe je Regel.

```bash
# Experten-Konto anlegen (Passwort wird verdeckt abgefragt)
DATABASE_URL=... pnpm --filter @biaticheck/web experte:anlegen anna@biati.de "Anna Muster"

# Abgelaufene Fälle löschen (täglich per Cron)
DATABASE_URL=... UPLOAD_DIR=... DATEI_SCHLUESSEL=... pnpm --filter @biaticheck/web aufraeumen
```

## Sicherheitsprinzipien

- Dateien werden am Inhalt erkannt (nicht an der Endung), verschlüsselt abgelegt (AES-256-GCM) und nach 90 Tagen gelöscht.
- Zugang ohne Konto über einen Link; das Token steht hinter `#`, wird nie an den Server übertragen und nur als Hash gespeichert.
- Die KI liest nur aus. Rechnen und Bewerten übernehmen feste, getestete Regeln. Unstimmige Auslesungen gehen an einen Experten.
- Die kostenlose Erstauswertung wird serverseitig gefiltert; Inhalte des bezahlten Berichts erreichen den Browser nicht.
- Fehlkonfiguration (z. B. fehlender Schlüssel im Produktivbetrieb) verhindert den Serverstart.
- Ratenbegrenzung für Uploads schützt vor Missbrauch und unkontrollierten API-Kosten.
- Prüfbereich: Passwörter mit scrypt, begrenzte Anmeldeversuche, HttpOnly/SameSite-strict-Sitzungscookie, Herkunftsprüfung (CSRF) bei allen Änderungen, Protokoll jeder Aktion.

## Stand

| Baustein | Status |
|---|---|
| Prüfkern (Schema, 24 Regeln, Rückfragen, Ergebnisstufen mit Prüfbedarf, Kostenvergleich) | ✅ v0.3 (Regeln im Entwurf) |
| Golden Set | 1 echter Fall (G-001) |
| Auslesen (PDF → Schema, Selbstkontrolle) | ✅ – Live-Test mit API-Schlüssel ausstehend |
| Web-App: Upload, Erstauswertung, Rückfragen (mobil) | ✅ |
| Automatische Qualitätskontrolle (CI) | ✅ |
| Interner Prüfbereich (Korrigieren, Freigeben, Messung für Auto-Freigabe) | ✅ |
| Löschfrist (90 Tage) | ✅ Skript, Cron im Deployment einrichten |
| Design von biati.de (Inter, Markenfarben, 3D-Startseite, Erklärvideo, Hell/Dunkel) | ✅ |
| Ergebnisstufen, Anschreiben, Beratungsanfrage | ✅ (Freischaltung vorerst im Testmodus) |
| Prüfbedarf: Unterlagen nachreichen (Vorjahresabrechnung, Kontoauszüge) mit automatischem Auslesen | ✅ – ohne API-Schlüssel an Fachprüfer |
| Bezahlung (Stripe) | ⏳ wartet auf Stripe-Konto |
| Deployment biati.de | ⏳ Sprint 4 |

Vor dem Livegang: Impressum und Datenschutzerklärung (`apps/web/src/app/impressum`, `.../datenschutz`) ausfüllen und rechtlich prüfen lassen.
