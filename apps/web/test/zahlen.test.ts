import { describe, expect, it } from "vitest";
import { enthaeltUngueltigeZahl, leseZahl, zeigeZahl } from "@/komponenten/intern/zahlen";

describe("Deutsche Zahleneingabe im Prüfbereich", () => {
  it.each([
    ["1.214,88", 1214.88],
    ["84,28", 84.28],
    ["1.214", 1214],
    ["10.827,05", 10827.05],
    ["1.000.000", 1000000],
    ["84.28", 84.28],
    ["3187.97", 3187.97],
    ["-1.214,88", -1214.88],
    ["1 214,88 €", 1214.88],
    ["0", 0],
    ["", undefined],
    ["  ", undefined],
  ])("%j → %j", (eingabe, zahl) => {
    expect(leseZahl(eingabe)).toBe(zahl);
  });

  it.each(["abc", "1,2,3", "12a", "1..2"])("ungültig: %j", (eingabe) => {
    expect(leseZahl(eingabe)).toBeNaN();
  });

  it("Anzeige und Eingabe sind umkehrbar", () => {
    for (const n of [1214.88, 84.28, 0.47, 3187.97, 42]) expect(leseZahl(zeigeZahl(n))).toBe(n);
  });

  it("findet ungültige Zahlen in verschachtelten Daten, aber keine Fehlalarme bei Texten", () => {
    expect(enthaeltUngueltigeZahl({ kostenpositionen: [{ bezeichnung: "Nullstellenprüfung", anteilMieter: 5 }] })).toBe(false);
    expect(enthaeltUngueltigeZahl({ kostenpositionen: [{ anteilMieter: NaN }] })).toBe(true);
    expect(enthaeltUngueltigeZahl({ a: { b: Infinity } })).toBe(true);
  });
});
