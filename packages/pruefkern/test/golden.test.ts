import { describe, expect, it } from "vitest";
import { pruefeAbrechnung, type Status } from "../src/index";
import { G001 } from "./golden/G-001";

/**
 * Golden Set: echte, anonymisierte Abrechnungen mit dem vom Experten erwarteten Ergebnis.
 * Jede Abweichung zwischen Prüfkern und Expertenurteil lässt diesen Test fehlschlagen.
 */
describe("G-001 – Großvermieter München 2024", () => {
  const bericht = pruefeAbrechnung(G001, { heute: "2026-10-29" });
  const status = (id: string) => bericht.ergebnisse.filter((e) => e.regelId === id).map((e) => e.status);

  it.each<[string, Status[]]>([
    ["F-01", ["ok"]],
    ["F-02", ["nicht_pruefbar"]],
    ["F-03", ["nicht_pruefbar"]],
    ["F-04", ["ok"]],
    ["R-01", ["ok"]],
    ["R-02", ["ok"]],
    ["R-03", ["ok"]],
    ["R-04", ["auffaelligkeit"]],
    ["R-05", ["ok", "pruefbedarf"]],
    ["I-01", ["ok"]],
    ["I-02", ["nicht_pruefbar", "nicht_pruefbar"]],
    ["I-03", []],
    ["I-04", ["ok"]],
    ["I-05", ["auffaelligkeit"]],
    ["I-06", ["nicht_pruefbar"]],
    ["I-07", ["auffaelligkeit"]],
    ["I-08", ["ok"]],
    ["P-01", ["nicht_pruefbar"]],
    ["P-02", ["ok"]],
    ["P-03", ["auffaelligkeit"]],
  ])("%s → %j", (id, erwartet) => {
    expect(status(id)).toEqual(erwartet);
  });

  it("findet keinen sicheren Fehler: 13,57 € Klärungsbedarf, 1.222,87 € erst nach weiteren Unterlagen", () => {
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(0);
    // SAT-Anteil nach 30.06.2024
    expect(bericht.zusammenfassung.klaerungspotenzial).toBe(13.57);
    // Heizkostenvorauszahlungen: vermutlich im Jahr angepasst – Prüfbedarf, nicht im Potenzial
    expect(bericht.zusammenfassung.pruefbedarfBetrag).toBe(1222.87);
    const r05 = bericht.ergebnisse.find((e) => e.regelId === "R-05" && e.status === "pruefbedarf")!;
    expect(r05.unterlagen).toEqual(["vorjahresabrechnung", "kontoauszug"]);
  });

  it("fragt gezielt beim Kunden nach", () => {
    expect(bericht.zusammenfassung.rueckfragen.map((r) => r.feld)).toEqual([
      "meta.zugangAm",
      "mietvertrag.vereinbarteSonstigeKosten",
      "mietvertrag.aufzugAusgenommen",
      "ausstattung.gewerbeImHaus",
      "vorjahr",
    ]);
  });
});
