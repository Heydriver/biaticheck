# BiatiCheck – Architektur

Stand: 29.10.2026 · Version 0.1

## Grundprinzip

> **Die KI liest aus und erklärt – sie rechnet und entscheidet nicht.**
> Jedes Ergebnis ist auf eine Regel (mit Version), die verwendeten Daten und die Fundstelle im PDF zurückführbar.

## Ablauf eines Falls

```
Upload (PDF/Foto)
  → Auslesen: KI mit Bildverständnis → JSON nach Datenschema (packages/pruefkern/src/schema.ts)
  → Prüfkern: feste Regeln (packages/pruefkern/src/regeln)
  → Freigabe im internen Prüfbereich (anfangs alles, später nur Regeln ohne Auto-Freigabe)
  → Texte: kostenlose Erstauswertung / ausführlicher Bericht nach Bezahlung
  → Rückfragen an den Kunden bei fehlenden Angaben → erneute Prüfung
```

## Technik

| Schicht | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript durchgängig | Ein Code-Stand für Frontend, Backend und Prüfkern – einfacher zu warten |
| Web-App | Next.js (App Router), Tailwind CSS | Responsive (mobil zuerst), Kundenportal und interner Prüfbereich in einer App |
| Prüfkern | `packages/pruefkern` – reines TypeScript, ohne Abhängigkeit zu Web/DB | Isoliert testbar gegen das Golden Set |
| Datenbank | PostgreSQL (Drizzle ORM) | Fälle, ausgelesene Felder, Regelergebnisse, Korrekturen, Audit-Log |
| Hintergrund-Jobs | Postgres-basierte Warteschlange (pg-boss) | Auslesen dauert 10–60 s; keine zusätzliche Infrastruktur |
| Dateien | S3-kompatibler Speicher in der EU | Verschlüsselt, mit Löschfristen |
| Auslesen | Claude API (Vision/PDF) mit strukturierter Ausgabe | Liefert direkt Daten nach Schema; EU-Datenverarbeitung prüfen |
| Bezahlung | Stripe | Standard |
| E-Mail | Transaktionsmail-Anbieter mit EU-Sitz | DSGVO |
| Hosting | Docker auf EU-Server (z. B. Hetzner), Domain biati.de | DSGVO, volle Kontrolle |

## Repository-Struktur

```
biaticheck/
├── apps/web/            Next.js-App (Kundenportal + Prüfbereich)       – folgt
├── packages/pruefkern/  Datenschema, Regeln, Prüf-Engine, Tests         – vorhanden
└── docs/                Architektur, Regelkatalog, Vorlagen
```

## Datenmodell (Kern)

```
Fall ─┬─ Dokument (PDF, Seiten)
      ├─ AusgelesenesFeld (Feld, Wert, Sicherheit, Fundstelle, korrigiert_von)
      ├─ Regelergebnis (Regel-ID, Regelversion, Status, Beleg, freigegeben_von | auto)
      ├─ Rückfrage (Feld, Frage, Antwort)
      ├─ Bericht (kostenlos | bezahlt, Version)
      └─ Audit-Log
Regeldefinition (ID, Version, Stand, Auto-Freigabe, Trefferquote)
```

## Ergebnistypen

| Status | Bedeutung |
|---|---|
| `ok` | geprüft, nichts zu beanstanden |
| `abweichung` | rechnerischer oder eindeutiger Fehler, meist mit Betrag |
| `auffaelligkeit` | ungewöhnlich – Klärung/Belegeinsicht empfohlen |
| `nicht_pruefbar` | mit den Unterlagen nicht prüfbar – ggf. mit Rückfrage an den Kunden |

## Auto-Freigabe (Phase 4)

Eine Regel wird automatisch freigegeben, wenn sie (Vorschlag, vom Team festzulegen):
- den Stand `bestaetigt` hat,
- in mindestens 50 Fällen zu ≥ 95 % mit dem Experten übereinstimmt,
- keinen kritischen Fehler (falsches Ergebnis zulasten des Kunden) hatte.

## Offene Punkte

- [ ] RDG-Einschätzung durch Anwalt (Formulierungen „Nächster Schritt“)
- [ ] Hosting-Anbieter und Datenverarbeitung des KI-Anbieters (AVV) festlegen
- [ ] Schwellenwert P-02 (Kosten pro m²) fachlich festlegen
- [ ] Preise kostenlose Erstauswertung / ausführlicher Bericht
