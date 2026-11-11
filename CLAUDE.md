# BiatiCheck – Hinweise für Claude

## Zwei Oberflächen – nicht verwechseln

| Ordner | Was es ist | Online |
|---|---|---|
| `apps/testseite` | **Die Testseite.** Eine einzelne HTML-Seite mit dem echten Prüfkern. Damit testet das Team. | ja, siehe Link unten |
| `apps/web` | Die spätere Next.js-App (braucht Server, Datenbank, API-Schlüssel). | nein |

Wenn von „der App“, „der Testseite“, „dem Mockup“ oder „dem Link zum Testen“ die Rede ist, ist `apps/testseite` gemeint.
Baue keine zweite Testseite und keine Demo aus `apps/web`.

## Pflicht: Testseite nach jeder Änderung neu veröffentlichen

Die Testseite ist unter **einem festen Link** online. Dieser Link darf sich nie ändern:

**https://claude.ai/artifact/SnRtBSPhZU3ngqTaeKFYU6** (Titel „BiatiCheck Test“)

Nach **jeder** Änderung an `packages/pruefkern`, `packages/auslesen` oder `apps/testseite` gehört zum Abschluss der Aufgabe,
ohne dass der Nutzer darum bitten muss:

1. **Aktuellen Stand holen**, damit keine Änderung aus einem anderen Chat verloren geht:
   `git fetch origin main` und den eigenen Stand darauf aufsetzen (rebase oder merge).
2. **Tests:** `pnpm install --frozen-lockfile`, dann `pnpm --filter @biaticheck/pruefkern --filter @biaticheck/auslesen test`.
   Nur veröffentlichen, wenn die Tests bestehen.
3. **Bauen:** `pnpm testseite:bauen` → `apps/testseite/dist/biaticheck-test.html` (der Ordner `dist` wird nicht eingecheckt).
4. **Committen und pushen**, bevor veröffentlicht wird. Online darf nur stehen, was auch auf GitHub liegt.
5. **Veröffentlichen** mit dem Artifact-Werkzeug **auf den bestehenden Link**:
   - zuerst `action: "read"` mit `url` = Link oben (ohne das wird die Veröffentlichung aus einem neuen Chat abgelehnt),
   - dann veröffentlichen mit `file_path` = `apps/testseite/dist/biaticheck-test.html`, `url` = Link oben und einem kurzen `label`
     (z. B. „Regeln v0.13: Muster 14“).
   - `capabilities` **nicht** angeben: Die Seite behält dann ihre Berechtigung, Claude zu fragen (`sample` mit Bildern).
     Nur falls diese einmal fehlt: `{"sample": {"images": true}}`.
   - `files`, `title` und `icon` nicht angeben.
6. **Dem Nutzer sagen**, dass die Testseite aktualisiert ist, mit dem Link und in einem Satz, was sich geändert hat.

Wenn die Veröffentlichung nicht klappt (kein Artifact-Werkzeug, keine Bearbeitungsrechte, Fehler):
**Kein neues Artifact anlegen.** Dem Nutzer klar sagen, dass die Testseite noch den alten Stand zeigt, und warum.

Änderungen nur an `apps/web`, `apps/video` oder `docs` brauchen keine neue Veröffentlichung.

## Wie die Testseite aufgebaut ist

- `apps/testseite/vorlage.html` – Oberfläche und Ablauf (Hochladen, Auslesen über Claude, Ergebnis).
- `apps/testseite/eintrag.ts` – bündelt Prüfkern und Auslese-Regeln für den Browser.
- `apps/testseite/bauen.py` – setzt Vorlage, Bündel, Farben, Logo und Musterdaten zu einer Datei zusammen.
- Das Auslesen läuft über das Claude-Konto der Person, die die Seite öffnet. Es gibt keinen Server und keinen API-Schlüssel.
  Außerhalb von claude.ai funktioniert nur „Beispiel ansehen“.
