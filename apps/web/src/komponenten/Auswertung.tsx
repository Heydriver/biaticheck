"use client";

import type { Auffaelligkeit, Stufe1, Stufe2 } from "@biaticheck/pruefkern";
import { useState } from "react";
import type { FallAnsicht } from "@/server/ansicht";
import { Rueckfragen } from "./Rueckfragen";

/**
 * Ergebnis für Kunden, die keine Details wollen, sondern eine Lösung:
 * eine Kernaussage, drei Fakten, eine Empfehlung mit einem Hauptknopf,
 * danach nur kurze Einzeiler. Alles Weitere bleibt eingeklappt.
 */

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const zahl = (n: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const datum = (iso: string) => iso.split("-").reverse().join(".");

/** Preis für das Freischalten der Fehler und des nächsten Schritts. */
export const PREIS = 4.99;

const KARTE = "grid min-w-0 gap-4 rounded-3xl border border-linie bg-grund p-5 sm:p-8";
const KNOPF = "inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold disabled:opacity-60";
const KNOPF_HAUPT = `${KNOPF} bg-gruen text-white hover:bg-gruen-tief`;
const KNOPF_NEBEN = `${KNOPF} border border-linie bg-grund text-text`;

type Aktionen = {
  beantworte: (feld: string, wert: unknown) => Promise<void>;
  freischalten: () => Promise<void>;
  beratungAnfragen: (daten: Record<string, unknown>) => Promise<void>;
};

export function Auswertung({ ansicht, aktionen }: { ansicht: FallAnsicht & { stufe1: Stufe1 }; aktionen: Aktionen }) {
  return (
    <div className="grid gap-5">
      {ansicht.demo && (
        <p role="note" className="text-sm text-gedaempft">
          Demo-Modus: Statt Ihrer Datei wurde die Musterabrechnung ausgewertet.
        </p>
      )}
      <Ergebnis s1={ansicht.stufe1} beantworte={aktionen.beantworte}>
        {!ansicht.stufe2 && <Freischalten modus={ansicht.freischaltung} freischalten={aktionen.freischalten} />}
      </Ergebnis>
      {ansicht.stufe2 && <Loesung s1={ansicht.stufe1} s2={ansicht.stufe2} aktionen={aktionen} />}
    </div>
  );
}

// ---------- Kostenlos: Ergebnis auf einen Blick ----------

function Ergebnis({ s1, beantworte, children }: { s1: Stufe1; beantworte: Aktionen["beantworte"]; children: React.ReactNode }) {
  const f = s1.fehlerpotenzial;
  const anzahl = f.anzahl.abweichung + f.anzahl.auffaelligkeit;
  const summe = f.sicher + f.zuKlaeren;
  const titel =
    f.sicher > 0
      ? `${euro(f.sicher)} müssen Sie nicht bezahlen.`
      : summe > 0
        ? `Bis zu ${euro(summe)} könnten falsch abgerechnet sein.`
        : anzahl
          ? "Ihre Abrechnung hat Auffälligkeiten."
          : "Ihre Abrechnung sieht korrekt aus.";
  const saldo = s1.kosten.saldo;

  return (
    <section className={KARTE} aria-labelledby="ergebnis-titel">
      <p className="text-sm text-gedaempft">Ihre Abrechnung{s1.abrechnungsjahr ? ` ${s1.abrechnungsjahr}` : ""}</p>
      <h1 id="ergebnis-titel" className="text-[clamp(24px,4.4vw,34px)] leading-tight font-bold tracking-tight">
        {titel}
      </h1>
      <p>{anzahl ? `Wir haben ${anzahl === 1 ? "einen Punkt" : `${anzahl} Punkte`} gefunden, die Sie Geld kosten können.` : "Wir haben keine Fehler gefunden."}</p>
      <dl className="grid border-t border-linie sm:grid-cols-3 sm:border-b">
        {saldo !== undefined && (
          <Fakt titel={saldo >= 0 ? "Ihre Nachzahlung" : "Ihr Guthaben"}>
            <dd className="text-xl font-bold tabular-nums">{euro(Math.abs(saldo))}</dd>
          </Fakt>
        )}
        <Frist s1={s1} beantworte={beantworte} />
        <Vergleich s1={s1} />
      </dl>
      {children}
    </section>
  );
}

function Fakt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-0.5 border-b border-linie py-3.5 sm:border-0 sm:py-4 sm:pr-4">
      <dt className="text-sm text-gedaempft">{titel}</dt>
      {children}
    </div>
  );
}

function Frist({ s1, beantworte }: { s1: Stufe1; beantworte: Aktionen["beantworte"] }) {
  const w = s1.widerspruchsfrist;
  const frage = s1.rueckfragen.filter((r) => r.feld === "meta.zugangAm");
  return (
    <Fakt titel="Einspruch möglich">
      {w.status === "offen" && w.bis && (
        <>
          <dd className={`text-xl font-bold tabular-nums ${(w.tageVerbleibend ?? 99) <= 30 ? "text-warn-text" : ""}`}>bis {datum(w.bis)}</dd>
          <dd className="text-[13px] text-gedaempft">
            {w.tageVerbleibend === 0 ? "heute letzter Tag" : `noch ${w.tageVerbleibend} ${w.tageVerbleibend === 1 ? "Tag" : "Tage"}`}
          </dd>
        </>
      )}
      {w.status === "abgelaufen" && w.bis && (
        <>
          <dd className="text-xl font-bold text-warn-text">abgelaufen</dd>
          <dd className="text-[13px] text-gedaempft">am {datum(w.bis)}</dd>
        </>
      )}
      {w.status === "unbekannt" && (
        <dd>{frage.length > 0 ? <Rueckfragen fragen={frage.map((f) => ({ ...f, frage: "Wann kam die Abrechnung an?" }))} beantworte={beantworte} ohneUeberschrift /> : "unbekannt"}</dd>
      )}
    </Fakt>
  );
}

function Vergleich({ s1 }: { s1: Stufe1 }) {
  if (!s1.vergleich.ok) return null;
  const g = s1.vergleich.vergleich.gesamt;
  if (g.abweichungProzent === undefined || g.durchschnitt === undefined) return null;
  const a = g.abweichungProzent;
  return (
    <Fakt titel="Ihre Nebenkosten">
      <dd className="text-xl font-bold">{a > 0 ? `${a} % über` : a < 0 ? `${-a} % unter` : "genau im"} Durchschnitt</dd>
      <dd className="text-[13px] text-gedaempft" title={`Quelle: ${s1.vergleich.vergleich.quelle}`}>
        {zahl(g.ihr)} € statt {zahl(g.durchschnitt)} € je m² im Monat
      </dd>
    </Fakt>
  );
}

function Freischalten({ modus, freischalten }: { modus: "test" | "aus"; freischalten: () => Promise<void> }) {
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();
  if (modus !== "test") return <p className="font-semibold">Die Lösung ist in Kürze verfügbar.</p>;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={laedt}
          onClick={async () => {
            setLaedt(true);
            setFehler(undefined);
            try {
              await freischalten();
            } catch (e) {
              setFehler(e instanceof Error ? e.message : "Freischalten fehlgeschlagen");
              setLaedt(false);
            }
          }}
          className={KNOPF_HAUPT}
        >
          {laedt ? "Einen Moment …" : `Fehler anzeigen für ${euro(PREIS)}`}
        </button>
        <span className="text-sm text-gedaempft">Testmodus: Es wird nichts berechnet.</span>
      </div>
      {fehler && (
        <p role="alert" className="text-sm text-fehler-text">
          {fehler}
        </p>
      )}
    </div>
  );
}

// ---------- Nach Freischaltung: eine Empfehlung, kurze Punkte ----------

function Loesung({ s1, s2, aktionen }: { s1: Stufe1; s2: Stufe2; aktionen: Aktionen }) {
  const [weg, setWeg] = useState<"schreiben" | "beratung" | null>(null);
  const e = s2.empfehlung;
  const beanstandet = s2.auffaelligkeiten.filter((p) => p.status !== "nicht_pruefbar");
  // Eingangsdatum wird oben abgefragt – nicht doppelt aufführen
  const offen = s2.auffaelligkeiten.filter((p) => p.status === "nicht_pruefbar" && p.regelId !== "F-02" && p.regelId !== "F-03");
  const weitereFragen = [...s2.rueckfragen, ...s1.rueckfragen.filter((r) => r.feld !== "meta.zugangAm")];

  const knoepfe =
    e.aktion === "keine"
      ? null
      : (e.aktion === "beratung"
          ? [
              ["beratung", "Experten beauftragen"],
              ["schreiben", "Schreiben selbst senden"],
            ]
          : [
              ["schreiben", "Schreiben öffnen"],
              ["beratung", "Lieber vom Experten erledigen lassen"],
            ]
        ).map(([ziel, text], i) => (
          <button key={ziel} type="button" onClick={() => setWeg(ziel as "schreiben" | "beratung")} className={i === 0 ? KNOPF_HAUPT : KNOPF_NEBEN}>
            {text}
          </button>
        ));

  return (
    <>
      <section className="grid gap-4 rounded-3xl bg-dunkelkarte p-5 text-dunkelkarte-text sm:p-8" aria-labelledby="empfehlung-titel">
        <p className="text-sm opacity-75">Unsere Empfehlung</p>
        <h2 id="empfehlung-titel" className="text-[clamp(22px,4vw,30px)] leading-tight font-bold tracking-tight">
          {e.titel}
        </h2>
        <p>{e.text}</p>
        {knoepfe && <div className="flex flex-wrap gap-3">{knoepfe}</div>}
      </section>

      {weg === "schreiben" && <Anschreiben s2={s2} />}
      {weg === "beratung" && <Beratung beratungAnfragen={aktionen.beratungAnfragen} />}

      {beanstandet.length > 0 && (
        <section className={KARTE} aria-labelledby="punkte-titel">
          <h2 id="punkte-titel" className="text-lg font-bold">
            Das beanstanden wir
          </h2>
          <Punkte liste={beanstandet} />
        </section>
      )}

      {(offen.length > 0 || weitereFragen.length > 0) && (
        <details className={`${KARTE} [&[open]>summary]:mb-2`}>
          <summary className="cursor-pointer font-semibold">
            {offen.length > 0 ? `${offen.length} weitere ${offen.length === 1 ? "Punkt prüfen" : "Punkte prüfen"} wir mit Ihrem Mietvertrag` : "Noch genauer prüfen"}
          </summary>
          {offen.length > 0 && <Punkte liste={offen} />}
          {weitereFragen.length > 0 && <Rueckfragen fragen={weitereFragen} beantworte={aktionen.beantworte} />}
        </details>
      )}
    </>
  );
}

function Punkte({ liste }: { liste: Auffaelligkeit[] }) {
  return (
    <ul className="grid">
      {liste.map((p, i) => (
        <li key={`${p.regelId}-${i}`} className="flex items-baseline justify-between gap-3 border-t border-linie py-3.5 first:border-0 first:pt-0">
          <div className="min-w-0">
            <h3 className="font-semibold">{p.kurz.titel}</h3>
            <p className="text-[15px] text-gedaempft">{p.kurz.satz}</p>
          </div>
          {p.betrag !== undefined && <span className="font-bold whitespace-nowrap tabular-nums">{euro(p.betrag)}</span>}
        </li>
      ))}
    </ul>
  );
}

function Anschreiben({ s2 }: { s2: Stufe2 }) {
  const [text, setText] = useState(s2.anschreiben.text);
  const [kopiert, setKopiert] = useState(false);
  const mailto = `mailto:?subject=${encodeURIComponent(s2.anschreiben.betreff)}&body=${encodeURIComponent(text)}`;
  async function kopieren() {
    try {
      await navigator.clipboard.writeText(`Betreff: ${s2.anschreiben.betreff}\n\n${text}`);
      setKopiert(true);
    } catch {
      (document.getElementById("anschreiben") as HTMLTextAreaElement | null)?.select();
    }
  }
  return (
    <section className={KARTE} aria-labelledby="anschreiben-titel">
      <div className="grid gap-1">
        <h2 id="anschreiben-titel" className="text-lg font-bold">
          Ihr Schreiben an die Hausverwaltung
        </h2>
        <p className="text-sm text-gedaempft">Name und Anschrift ergänzen, dann absenden.</p>
      </div>
      <label htmlFor="anschreiben" className="grid gap-1 text-sm">
        <span className="text-gedaempft">Betreff: {s2.anschreiben.betreff}</span>
        <textarea
          id="anschreiben"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setKopiert(false);
          }}
          rows={12}
          className="w-full rounded-lg border border-linie bg-grund px-3 py-2 font-sans text-sm leading-relaxed text-text"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <a href={mailto} className={KNOPF_HAUPT}>
          Per E-Mail senden
        </a>
        <button type="button" onClick={kopieren} className={KNOPF_NEBEN}>
          {kopiert ? "Kopiert" : "Text kopieren"}
        </button>
      </div>
    </section>
  );
}

function Beratung({ beratungAnfragen }: { beratungAnfragen: Aktionen["beratungAnfragen"] }) {
  const [werte, setWerte] = useState({ name: "", email: "", telefon: "" });
  const [einwilligung, setEinwilligung] = useState(false);
  const [zustand, setZustand] = useState<"bereit" | "sendet" | "gesendet">("bereit");
  const [fehler, setFehler] = useState<string>();
  const feld = (name: keyof typeof werte) => ({
    id: `beratung-${name}`,
    value: werte[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setWerte((w) => ({ ...w, [name]: e.target.value })),
    className: "w-full rounded-lg border border-linie bg-grund px-3 py-2.5 font-normal text-text",
  });

  if (zustand === "gesendet") {
    return (
      <section className={KARTE} role="status">
        <h2 className="text-lg font-bold">Danke, wir melden uns.</h2>
        <p className="text-sm text-gedaempft">In der Regel innerhalb von zwei Werktagen.</p>
      </section>
    );
  }

  return (
    <form
      noValidate
      className={KARTE}
      aria-labelledby="beratung-titel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!einwilligung) return setFehler("Bitte bestätigen Sie, dass wir Sie kontaktieren dürfen.");
        setZustand("sendet");
        setFehler(undefined);
        try {
          await beratungAnfragen({ ...werte, einwilligung });
          setZustand("gesendet");
        } catch (err) {
          setFehler(err instanceof Error ? err.message : "Senden fehlgeschlagen");
          setZustand("bereit");
        }
      }}
    >
      <h2 id="beratung-titel" className="text-lg font-bold">
        Unsere Experten übernehmen das für Sie
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label htmlFor="beratung-name" className="grid gap-1 text-sm font-semibold">
          Name
          <input {...feld("name")} autoComplete="name" required />
        </label>
        <label htmlFor="beratung-email" className="grid gap-1 text-sm font-semibold">
          E-Mail
          <input {...feld("email")} type="email" autoComplete="email" required />
        </label>
        <label htmlFor="beratung-telefon" className="grid gap-1 text-sm font-semibold">
          Telefon (optional)
          <input {...feld("telefon")} type="tel" autoComplete="tel" />
        </label>
      </div>
      <label htmlFor="beratung-einwilligung" className="flex items-start gap-3 text-sm text-gedaempft">
        <input id="beratung-einwilligung" type="checkbox" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--gruen)]" />
        <span>Biati Solutions darf mich zu meiner Abrechnung kontaktieren.</span>
      </label>
      {fehler && (
        <p role="alert" className="text-sm text-fehler-text">
          {fehler}
        </p>
      )}
      <button type="submit" disabled={zustand === "sendet"} className={`${KNOPF_HAUPT} justify-self-start`}>
        {zustand === "sendet" ? "Wird gesendet …" : "Rückruf anfordern"}
      </button>
    </form>
  );
}
