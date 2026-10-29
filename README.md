# BiatiCheck

Automatisierte Prüfung von Nebenkostenabrechnungen auf Basis von Expertenwissen.

- [Architektur](docs/ARCHITEKTUR.md)
- [Regelkatalog](docs/REGELKATALOG.md)
- [Vorlage Prüfprotokoll und Regelkarte](docs/REGELKARTE-VORLAGE.md)

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
| Prüfkern (Schema, 15 Regeln, Engine, Tests) | ✅ v0.1 (Regeln im Entwurf) |
| Auslesen (PDF → Schema) | ⏳ |
| Web-App: Upload, Erstauswertung, Bericht | ⏳ |
| Interner Prüfbereich | ⏳ |
| Bezahlung | ⏳ |
| Deployment biati.de | ⏳ |
