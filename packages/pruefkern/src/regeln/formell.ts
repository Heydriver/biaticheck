import { datumDE, euro, plusMonate, vergleiche } from "../hilfen";
import type { Regel, Rueckfrage } from "../regel";

const RUECKFRAGE_ZUGANG: Rueckfrage = {
  feld: "meta.zugangAm",
  frage: "An welchem Tag haben Sie die Abrechnung erhalten (Briefkasten, E-Mail o. Ä.)?",
};

export const F01_Abrechnungszeitraum: Regel = {
  id: "F-01",
  version: "1.0.0",
  titel: "Abrechnungszeitraum höchstens 12 Monate",
  bereich: "formell",
  grundlage: "§ 556 Abs. 3 Satz 1 BGB",
  stand: "entwurf",
  pruefe(a) {
    const z = a.meta.abrechnungszeitraum;
    if (!z) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Abrechnungszeitraum nicht erkennbar",
          erklaerung: "Aus der Abrechnung geht kein eindeutiger Abrechnungszeitraum hervor.",
          naechsterSchritt: "Prüfen Sie, ob die Abrechnung einen Zeitraum (von–bis) nennt. Fehlt er, ist die Abrechnung formell angreifbar.",
        },
      ];
    }
    const spaetestesEnde = plusMonate(z.von, 12);
    if (vergleiche(z.bis, spaetestesEnde) >= 0) {
      return [
        {
          status: "abweichung",
          titel: "Abrechnungszeitraum länger als 12 Monate",
          erklaerung: `Der Zeitraum ${datumDE(z.von)}–${datumDE(z.bis)} ist länger als ein Jahr. Betriebskosten sind jährlich abzurechnen.`,
          naechsterSchritt: "Widersprechen Sie der Abrechnung schriftlich und verlangen Sie eine Abrechnung über höchstens 12 Monate.",
          beleg: { von: z.von, bis: z.bis },
        },
      ];
    }
    return [
      {
        status: "ok",
        titel: "Abrechnungszeitraum korrekt",
        erklaerung: `Der Abrechnungszeitraum ${datumDE(z.von)}–${datumDE(z.bis)} umfasst höchstens 12 Monate.`,
        beleg: { von: z.von, bis: z.bis },
      },
    ];
  },
};

export const F02_Abrechnungsfrist: Regel = {
  id: "F-02",
  version: "1.0.0",
  titel: "Abrechnungsfrist eingehalten",
  bereich: "formell",
  grundlage: "§ 556 Abs. 3 Satz 2 und 3 BGB",
  stand: "entwurf",
  pruefe(a) {
    const z = a.meta.abrechnungszeitraum;
    if (!z) return [];
    const fristEnde = plusMonate(z.bis, 12);
    const saldo = a.ausgewiesen.saldo;
    const zugang = a.meta.zugangAm;

    // Ist schon das Erstellungsdatum nach Fristende, ist die Abrechnung sicher verspätet.
    const stichtag = zugang ?? (a.meta.erstelltAm && vergleiche(a.meta.erstelltAm, fristEnde) > 0 ? a.meta.erstelltAm : undefined);

    if (!stichtag) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Zugang der Abrechnung unbekannt",
          erklaerung: `Die Abrechnung muss Ihnen bis spätestens ${datumDE(fristEnde)} zugegangen sein. Dafür brauchen wir das Datum, an dem Sie sie erhalten haben.`,
          beleg: { fristEnde },
          rueckfrage: RUECKFRAGE_ZUGANG,
        },
      ];
    }

    if (vergleiche(stichtag, fristEnde) > 0) {
      if (saldo !== undefined && saldo > 0) {
        return [
          {
            status: "abweichung",
            titel: "Abrechnung verspätet – Nachzahlung nicht geschuldet",
            erklaerung: `Die Abrechnung ist erst am ${datumDE(stichtag)} zugegangen, die Frist endete am ${datumDE(fristEnde)}. Eine Nachforderung ist dann grundsätzlich ausgeschlossen, es sei denn, der Vermieter hat die Verspätung nicht zu vertreten.`,
            naechsterSchritt: `Zahlen Sie die Nachforderung von ${euro(saldo)} nicht und teilen Sie dem Vermieter schriftlich mit, dass die Abrechnungsfrist abgelaufen ist.`,
            betragZugunstenMieter: saldo,
            beleg: { fristEnde, stichtag, saldo },
          },
        ];
      }
      return [
        {
          status: "auffaelligkeit",
          titel: "Abrechnung verspätet",
          erklaerung: `Die Abrechnung ist nach Fristende (${datumDE(fristEnde)}) zugegangen. Ein Guthaben steht Ihnen trotzdem zu.`,
          beleg: { fristEnde, stichtag, saldo },
        },
      ];
    }

    return [
      {
        status: "ok",
        titel: "Abrechnungsfrist eingehalten",
        erklaerung: `Die Abrechnung ist innerhalb der Frist (bis ${datumDE(fristEnde)}) zugegangen.`,
        beleg: { fristEnde, stichtag },
      },
    ];
  },
};

export const F03_Einwendungsfrist: Regel = {
  id: "F-03",
  version: "1.0.0",
  titel: "Einwendungsfrist des Mieters",
  bereich: "formell",
  grundlage: "§ 556 Abs. 3 Satz 5 und 6 BGB",
  stand: "entwurf",
  pruefe(a, { heute }) {
    const zugang = a.meta.zugangAm;
    if (!zugang) {
      return [
        {
          status: "nicht_pruefbar",
          titel: "Einwendungsfrist nicht berechenbar",
          erklaerung: "Sie können Einwendungen bis zum Ablauf des zwölften Monats nach Erhalt der Abrechnung erheben. Dafür brauchen wir das Zugangsdatum.",
          rueckfrage: RUECKFRAGE_ZUGANG,
        },
      ];
    }
    const fristEnde = plusMonate(zugang, 12);
    if (vergleiche(heute, fristEnde) > 0) {
      return [
        {
          status: "auffaelligkeit",
          titel: "Einwendungsfrist abgelaufen",
          erklaerung: `Die Frist für Einwendungen endete am ${datumDE(fristEnde)}. Einwendungen sind danach grundsätzlich ausgeschlossen, außer Sie haben die Verspätung nicht zu vertreten.`,
          beleg: { zugang, fristEnde },
        },
      ];
    }
    return [
      {
        status: "ok",
        titel: `Einwendungen möglich bis ${datumDE(fristEnde)}`,
        erklaerung: `Sie können Einwendungen gegen diese Abrechnung bis zum ${datumDE(fristEnde)} schriftlich geltend machen.`,
        beleg: { zugang, fristEnde },
      },
    ];
  },
};

export const F04_Mindestangaben: Regel = {
  id: "F-04",
  version: "1.0.0",
  titel: "Mindestangaben je Kostenposition",
  bereich: "formell",
  grundlage: "§ 259 BGB; BGH, Urt. v. 20.01.2016 – VIII ZR 93/15",
  stand: "entwurf",
  pruefe(a) {
    const befunde = a.kostenpositionen
      .filter((p) => p.umlageschluessel?.typ !== "direkt")
      .flatMap((p) => {
        const fehlend: string[] = [];
        if (p.gesamtkosten === undefined) fehlend.push("Gesamtkosten");
        if (!p.umlageschluessel) fehlend.push("Umlageschlüssel");
        if (fehlend.length === 0) return [];
        return [
          {
            status: "auffaelligkeit" as const,
            titel: `Angaben fehlen: ${p.bezeichnung}`,
            erklaerung: `Für „${p.bezeichnung}“ fehlen in der Abrechnung: ${fehlend.join(", ")}. Ohne diese Angaben ist die Position für Sie nicht nachvollziehbar.`,
            naechsterSchritt: "Bitten Sie den Vermieter, die fehlenden Angaben nachzureichen bzw. Belegeinsicht zu gewähren.",
            positionId: p.id,
            beleg: { fehlend },
          },
        ];
      });
    if (befunde.length > 0) return befunde;
    return [
      {
        status: "ok",
        titel: "Mindestangaben vollständig",
        erklaerung: "Für alle Kostenpositionen sind Gesamtkosten und Umlageschlüssel angegeben.",
      },
    ];
  },
};

export const F05_Pauschale: Regel = {
  id: "F-05",
  version: "1.0.0",
  titel: "Keine Abrechnung bei vereinbarter Pauschale",
  bereich: "formell",
  grundlage: "§ 560 Abs. 1 BGB i. V. m. Mietvertrag",
  stand: "entwurf",
  pruefe(a) {
    if (a.mietvertrag?.pauschaleVereinbart !== true) return [];
    const saldo = a.ausgewiesen.saldo;
    return [
      {
        status: "abweichung",
        titel: "Betriebskostenpauschale vereinbart",
        erklaerung: "Laut Ihren Angaben ist im Mietvertrag eine Pauschale vereinbart. Über eine Pauschale wird nicht abgerechnet – Nachforderungen sind dann nicht geschuldet.",
        naechsterSchritt: "Lassen Sie den Mietvertrag prüfen und widersprechen Sie der Nachforderung schriftlich.",
        betragZugunstenMieter: saldo !== undefined && saldo > 0 ? saldo : undefined,
      },
    ];
  },
};

export const FORMELLE_REGELN = [
  F01_Abrechnungszeitraum,
  F02_Abrechnungsfrist,
  F03_Einwendungsfrist,
  F04_Mindestangaben,
  F05_Pauschale,
];
