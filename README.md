# BiatiCheck

Automatisierte Prüfung von Nebenkostenabrechnungen auf Basis von Expertenwissen.

- [Architektur](docs/ARCHITEKTUR.md)
- [Regelkatalog](docs/REGELKATALOG.md)
- [Vorlage Prüfprotokoll und Regelkarte](docs/REGELKARTE-VORLAGE.md)
- Musterprüfungen: [G-001](docs/musterpruefung/G-001.md)

## Entwicklung

Voraussetzungen: Node.js 22, pnpm 10.

```bash
pnpm install
pnpm test        # Prüfkern gegen die Musterfälle testen
pnpm typecheck
```

## Stand

| Baustein | Status |
|---|---|
| Prüfkern (Schema, 20 Regeln, Engine, Tests) | ✅ v0.2 (Regeln im Entwurf) |
| Golden Set | 1 echter Fall (G-001) |
| Auslesen (PDF → Schema) | ⏳ |
| Web-App: Upload, Erstauswertung, Bericht | ⏳ |
| Interner Prüfbereich | ⏳ |
| Bezahlung | ⏳ |
| Deployment biati.de | ⏳ |
