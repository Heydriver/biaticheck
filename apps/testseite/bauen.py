"""Baut die Test-Seite (eine einzige HTML-Datei) aus Vorlage, Prüfkern-Bündel und Musterdaten.

Aufruf (aus dem Repository-Hauptordner):
  NODE_PATH=packages/auslesen/node_modules npx -y esbuild@0.25.10 apps/testseite/eintrag.ts \
    --bundle --format=iife --global-name=Pruefkern --minify --target=es2020 --outfile=apps/testseite/dist/pruefkern.js
  python3 apps/testseite/bauen.py apps/testseite/dist/biaticheck-test.html
"""
import pathlib, sys

hier = pathlib.Path(__file__).parent
lies = lambda n: (hier / n).read_text(encoding="utf-8")
s = lies("vorlage.html")
s = s.replace("__TOKENS__", lies("tokens.css")).replace("__LOGO__", lies("logo.txt").strip())
s = s.replace("__MUSTER__", lies("muster.json").replace("</", "<\\/"))
s = s.replace("__PRUEFKERN__", (hier / "dist" / "pruefkern.js").read_text(encoding="utf-8").replace("</script", "<\\/script"))
pathlib.Path(sys.argv[1]).write_text(s, encoding="utf-8")
print("gebaut:", sys.argv[1], len(s), "Zeichen")
