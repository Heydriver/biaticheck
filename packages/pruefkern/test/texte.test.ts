import { describe, expect, it } from "vitest";
import { pruefeAbrechnung, type AbrechnungEingabe } from "../src/index";
import { fehlerhafteAbrechnung, korrekteAbrechnung } from "./faelle";
import { G001 } from "./golden/G-001";

/** Englisch formatierte Dezimalzahl wie "84.28" – aber kein Datum wie "31.12.2025" und kein Tausenderpunkt wie "1.214". */
const ENGLISCHE_DEZIMALZAHL = /(?<![\d.])\d+\.\d{1,2}(?![\d.])/;

function mitAbweichendenFlaechen(): AbrechnungEingabe {
  const a = structuredClone(G001);
  a.kostenpositionen[0]!.umlageschluessel = { typ: "wohnflaeche", anteilEinheit: 82.5, anteilGesamt: 3100.75 };
  a.heizkosten!.warmwasser!.energieKwh = 99_541;
  return a;
}

describe("Kundentexte", () => {
  const faelle = { korrekt: korrekteAbrechnung(), fehlerhaft: fehlerhafteAbrechnung(), G001, flaechen: mitAbweichendenFlaechen() };

  it.each(Object.entries(faelle))("%s: alle Zahlen im deutschen Format", (_name, fall) => {
    for (const e of pruefeAbrechnung(fall, { heute: "2026-10-29" }).ergebnisse) {
      for (const text of [e.titel, e.erklaerung, e.naechsterSchritt, e.rueckfrage?.frage]) {
        if (text) expect(text, `${e.regelId}: ${text}`).not.toMatch(ENGLISCHE_DEZIMALZAHL);
      }
    }
  });

  it("das Prüfmuster selbst erkennt Fehler und lässt Daten/Tausender durch", () => {
    expect("84.28 m²").toMatch(ENGLISCHE_DEZIMALZAHL);
    expect("15.04 kg").toMatch(ENGLISCHE_DEZIMALZAHL);
    expect("bis 31.12.2025").not.toMatch(ENGLISCHE_DEZIMALZAHL);
    expect("1.214,88 €").not.toMatch(ENGLISCHE_DEZIMALZAHL);
    expect("84,28 m²").not.toMatch(ENGLISCHE_DEZIMALZAHL);
  });
});
