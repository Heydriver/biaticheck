import { describe, expect, it } from "vitest";
import { pruefeAbrechnung, type Status } from "../src/index.js";
import { G001 } from "./golden/G-001.js";

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
    ["R-05", ["ok", "auffaelligkeit"]],
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

  it("findet keinen sicheren Fehler, aber bis zu 1.236,44 € Klärungsbedarf", () => {
    expect(bericht.zusammenfassung.einsparpotenzial).toBe(0);
    // 1.222,87 € Heizkostenvorauszahlungen + 13,57 € SAT-Anteil nach 30.06.2024
    expect(bericht.zusammenfassung.klaerungspotenzial).toBe(1236.44);
  });

  it("fragt gezielt beim Kunden nach", () => {
    expect(bericht.zusammenfassung.rueckfragen.map((r) => r.feld)).toEqual([
      "meta.zugangAm",
      "vorauszahlungenDetail.monatlich.heizkosten",
      "mietvertrag.vereinbarteSonstigeKosten",
      "mietvertrag.aufzugAusgenommen",
      "vorjahr",
    ]);
  });
});
