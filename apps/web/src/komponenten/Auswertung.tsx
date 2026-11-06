"use client";

import type { Kennwert, Stufe1, Stufe2 } from "@biaticheck/pruefkern";
import { useState } from "react";
import type { FallAnsicht } from "@/server/ansicht";
import { Rueckfragen } from "./Rueckfragen";

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const zahl = (n: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const datum = (iso: string) => iso.split("-").reverse().join(".");

const STATUS = {
  abweichung: { text: "Fehler", klasse: "bg-fehler text-fehler-text" },
  auffaelligkeit: { text: "Auffällig", klasse: "bg-warn text-warn-text" },
  nicht_pruefbar: { text: "Offen", klasse: "bg-offen text-offen-text" },
} as const;

type Aktionen = {
  beantworte: (feld: string, wert: unknown) => Promise<void>;
  freischalten: () => Promise<void>;
  beratungAnfragen: (daten: Record<string, unknown>) => Promise<void>;
};

export function Auswertung({ ansicht, aktionen }: { ansicht: FallAnsicht & { stufe1: Stufe1 }; aktionen: Aktionen }) {
  const s1 = ansicht.stufe1;
  return (
    <div className="grid gap-10">
      {ansicht.demo && (
        <p role="note" className="rounded-xl border border-blau/40 bg-[color-mix(in_srgb,var(--blau)_12%,transparent)] px-4 py-3 text-sm">
          <strong>Demo-Modus:</strong> Statt Ihrer Datei wurde die Musterabrechnung ausgewertet. Das automatische Auslesen ist in dieser Testumgebung noch nicht
          eingerichtet.
        </p>
      )}

      <header className="grid gap-2">
        <span className="text-xs font-semibold tracking-[0.08em] text-gedaempft uppercase">Ihre Auswertung{s1.abrechnungsjahr ? ` · Abrechnung ${s1.abrechnungsjahr}` : ""}</span>
        <h1 className="text-[clamp(28px,4vw,40px)] leading-tight font-bold">Ihr Einsparpotenzial</h1>
      </header>

      <Stufe nummer="1" titel="Kostenlose Auswertung">
        <Fehlerpotenzial s1={s1} />
        <Widerspruchsfrist s1={s1} beantworte={aktionen.beantworte} />
        <Kosten s1={s1} />
        <Vergleich s1={s1} beantworte={aktionen.beantworte} />
      </Stufe>

      {ansicht.stufe2 ? (
        <>
          <Stufe nummer="2" titel="Ausführliche Auswertung">
            <Auffaelligkeiten s2={ansicht.stufe2} />
            {ansicht.stufe2.rueckfragen.length > 0 && <Rueckfragen fragen={ansicht.stufe2.rueckfragen} beantworte={aktionen.beantworte} />}
            <Zusammenfassung s2={ansicht.stufe2} />
          </Stufe>
          <Abschluss s2={ansicht.stufe2} beratungAnfragen={aktionen.beratungAnfragen} />
        </>
      ) : (
        <Freischalten s1={s1} modus={ansicht.freischaltung} freischalten={aktionen.freischalten} />
      )}
    </div>
  );
}

function Stufe({ nummer, titel, children }: { nummer: string; titel: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5" aria-labelledby={`stufe-${nummer}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-gruen font-bold text-white">{nummer}</span>
        <h2 id={`stufe-${nummer}`} className="text-xl font-bold">
          {titel}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Karte({ titel, unterzeile, children }: { titel: string; unterzeile?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 rounded-3xl border border-linie bg-grund p-5 shadow-glas sm:p-6">
      <div className="grid gap-1">
        <h3 className="text-lg font-bold">{titel}</h3>
        {unterzeile && <p className="text-sm text-gedaempft">{unterzeile}</p>}
      </div>
      {children}
    </div>
  );
}

function Kennzahl({ titel, wert, hinweis, betont }: { titel: string; wert: string; hinweis?: string; betont?: boolean }) {
  return (
    <div className={`grid content-start gap-1 rounded-2xl border p-4 ${betont ? "border-gruen bg-mint" : "border-linie"}`}>
      <span className="text-[13px] text-gedaempft">{titel}</span>
      <span className="text-2xl font-extrabold tracking-tight tabular-nums">{wert}</span>
      {hinweis && <span className="text-xs text-gedaempft">{hinweis}</span>}
    </div>
  );
}

// ---------- Stufe 1.1 ----------

function Fehlerpotenzial({ s1 }: { s1: Stufe1 }) {
  const f = s1.fehlerpotenzial;
  return (
    <Karte titel="1.1 Fehlerpotenzial" unterzeile="Was Sie nach unserer Prüfung möglicherweise zu viel bezahlen.">
      <div className="grid grid-cols-2 gap-3">
        <Kennzahl titel="Sicheres Einsparpotenzial" wert={euro(f.sicher)} hinweis="aus eindeutigen Fehlern" betont={f.sicher > 0} />
        <Kennzahl titel="Zu klären" wert={euro(f.zuKlaeren)} hinweis="kann sich als Ersparnis erweisen" betont={f.zuKlaeren > 0} />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Chip klasse={STATUS.abweichung.klasse}>{f.anzahl.abweichung} Fehler</Chip>
        <Chip klasse={STATUS.auffaelligkeit.klasse}>{f.anzahl.auffaelligkeit} Auffälligkeiten</Chip>
        <Chip klasse={STATUS.nicht_pruefbar.klasse}>{f.anzahl.nicht_pruefbar} offene Punkte</Chip>
        <Chip klasse="bg-ok text-ok-text">{f.anzahl.ok} ohne Befund</Chip>
      </div>
    </Karte>
  );
}

function Chip({ klasse, children }: { klasse: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-3 py-1 font-semibold ${klasse}`}>{children}</span>;
}

function Widerspruchsfrist({ s1, beantworte }: { s1: Stufe1; beantworte: Aktionen["beantworte"] }) {
  const w = s1.widerspruchsfrist;
  const knapp = w.status === "offen" && (w.tageVerbleibend ?? 99) <= 30;
  const frageZugang = s1.rueckfragen.filter((r) => r.feld === "meta.zugangAm");
  return (
    <Karte titel="Widerspruchsfrist" unterzeile="Einwände gegen die Abrechnung sind nur innerhalb von 12 Monaten nach Erhalt möglich.">
      {w.status === "offen" && w.bis && (
        <div className={`grid gap-1 rounded-2xl p-4 ${knapp ? "bg-warn text-warn-text" : "bg-mint"}`}>
          <span className="text-sm">Einwände möglich bis</span>
          <span className="text-2xl font-extrabold tabular-nums">{datum(w.bis)}</span>
          <span className="text-sm font-semibold">
            {w.tageVerbleibend === 0 ? "Heute ist der letzte Tag." : `Noch ${w.tageVerbleibend} ${w.tageVerbleibend === 1 ? "Tag" : "Tage"}.`}
            {knapp ? " Handeln Sie zeitnah." : ""}
          </span>
        </div>
      )}
      {w.status === "abgelaufen" && w.bis && (
        <p className="rounded-2xl bg-fehler p-4 text-fehler-text">Die Frist für Einwände ist am {datum(w.bis)} abgelaufen.</p>
      )}
      {w.status === "unbekannt" && frageZugang.length > 0 && <Rueckfragen fragen={frageZugang} beantworte={beantworte} ohneUeberschrift />}
      <p className="text-sm text-gedaempft">
        Abrechnungsfrist des Vermieters{w.abrechnungsfrist.bis ? ` (bis ${datum(w.abrechnungsfrist.bis)})` : ""}:{" "}
        <strong className="text-text">
          {w.abrechnungsfrist.status === "eingehalten" ? "eingehalten" : w.abrechnungsfrist.status === "versaeumt" ? "versäumt – eine Nachforderung ist grundsätzlich ausgeschlossen" : "noch nicht prüfbar"}
        </strong>
      </p>
    </Karte>
  );
}

// ---------- Stufe 1.2 ----------

function Kosten({ s1 }: { s1: Stufe1 }) {
  const k = s1.kosten;
  const saldo = k.saldo;
  return (
    <Karte titel="1.2 Ihre Kosten" unterzeile="So setzt sich Ihre Abrechnung zusammen.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {k.betriebskosten !== undefined && <Kennzahl titel="Betriebskosten" wert={euro(k.betriebskosten)} />}
        {k.heizkosten !== undefined && <Kennzahl titel="Heiz- und Warmwasserkosten" wert={euro(k.heizkosten)} />}
        {k.vorauszahlungen !== undefined && <Kennzahl titel="Ihre Vorauszahlungen" wert={euro(k.vorauszahlungen)} />}
        {saldo !== undefined && <Kennzahl titel={saldo >= 0 ? "Nachzahlung" : "Guthaben"} wert={euro(Math.abs(saldo))} betont={saldo > 0} />}
      </div>
    </Karte>
  );
}

function Vergleich({ s1, beantworte }: { s1: Stufe1; beantworte: Aktionen["beantworte"] }) {
  const frageWerte = s1.rueckfragen.filter((r) => r.feld === "meta.plz" || r.feld === "flaechen.wohnflaecheMieter");
  if (!s1.vergleich.ok) {
    return (
      <Karte titel="Vergleich mit anderen Abrechnungen">
        <p className="text-gedaempft">{s1.vergleich.grund}</p>
        {frageWerte.length > 0 && <Rueckfragen fragen={frageWerte} beantworte={beantworte} ohneUeberschrift />}
      </Karte>
    );
  }
  const v = s1.vergleich.vergleich;
  const skala = Math.max(v.gesamt.ihr, v.gesamt.maximum ?? 0, v.gesamt.durchschnitt ?? 0) * 1.08;
  return (
    <Karte titel="Vergleich mit anderen Abrechnungen" unterzeile={`Kosten je m² Wohnfläche und Monat · Vergleich: ${v.region}${v.fallzahl ? ` (${v.fallzahl} Abrechnungen)` : ""}`}>
      <div className="grid gap-5">
        <Balken titel="Nebenkosten gesamt" k={v.gesamt} skala={skala} />
        <Balken titel="Heizung und Warmwasser" k={v.heizungWarmwasser} skala={skala} />
        <Balken titel="Kalte Betriebskosten" k={v.kalt} skala={skala} />
      </div>
      {v.gruppen.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm tabular-nums">
            <caption className="pb-2 text-left font-semibold">Einzelne Kostenarten</caption>
            <thead className="text-gedaempft">
              <tr className="border-b border-linie">
                <th className="py-2 text-left font-medium">Kostenart</th>
                <th className="py-2 text-right font-medium">Ihre Kosten</th>
                <th className="py-2 text-right font-medium">Durchschnitt</th>
                <th className="py-2 text-right font-medium">Abweichung</th>
              </tr>
            </thead>
            <tbody>
              {v.gruppen.map((g) => (
                <tr key={g.gruppe} className="border-b border-linie last:border-0">
                  <td className="py-2">{g.name}</td>
                  <td className="py-2 text-right">{zahl(g.ihr)} €</td>
                  <td className="py-2 text-right text-gedaempft">{g.durchschnitt !== undefined ? `${zahl(g.durchschnitt)} €` : "–"}</td>
                  <td className={`py-2 text-right font-semibold ${(g.abweichungProzent ?? 0) > 20 ? "text-warn-text" : ""}`}>
                    {g.abweichungProzent !== undefined ? `${g.abweichungProzent > 0 ? "+" : ""}${g.abweichungProzent} %` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gedaempft">
        Quelle: {v.quelle}.
        {v.regionalFolgt ? ` Der Vergleich für das ${v.regionalFolgt} folgt, sobald genug Abrechnungen aus Ihrer Region vorliegen.` : ""}
      </p>
      {frageWerte.length > 0 && <Rueckfragen fragen={frageWerte} beantworte={beantworte} ohneUeberschrift />}
    </Karte>
  );
}

function Balken({ titel, k, skala }: { titel: string; k: Kennwert; skala: number }) {
  const breite = (x: number) => `${Math.min(100, (x / skala) * 100)}%`;
  const ueber = (k.abweichungProzent ?? 0) > 0;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">{titel}</span>
        <span className="tabular-nums">
          Ihre Kosten <strong>{zahl(k.ihr)} €</strong>
          {k.durchschnitt !== undefined && (
            <>
              {" "}
              · Durchschnitt {zahl(k.durchschnitt)} €
              {k.abweichungProzent !== undefined && (
                <strong className={ueber ? "text-warn-text" : "text-ok-text"}>
                  {" "}
                  ({ueber ? "+" : ""}
                  {k.abweichungProzent} %)
                </strong>
              )}
            </>
          )}
        </span>
      </div>
      <div className="relative h-3.5 rounded-full bg-offen" role="img" aria-label={`${titel}: ${zahl(k.ihr)} € je m² und Monat${k.durchschnitt !== undefined ? `, Durchschnitt ${zahl(k.durchschnitt)} €` : ""}`}>
        <div className="h-full rounded-full bg-gradient-to-r from-[#1fa37e] to-[#2e7bb8]" style={{ width: breite(k.ihr) }} />
        {k.durchschnitt !== undefined && <span className="absolute -top-1 h-5.5 w-0.5 rounded bg-text" style={{ left: breite(k.durchschnitt) }} title="Durchschnitt" />}
      </div>
    </div>
  );
}

// ---------- Freischalten ----------

function Freischalten({ s1, modus, freischalten }: { s1: Stufe1; modus: "test" | "aus"; freischalten: () => Promise<void> }) {
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();
  const n = s1.fehlerpotenzial.anzahl;
  const punkte = n.abweichung + n.auffaelligkeit + n.nicht_pruefbar;
  return (
    <section className="grid gap-4 rounded-3xl bg-dunkelkarte p-6 text-dunkelkarte-text sm:p-8" aria-labelledby="freischalten-titel">
      <span className="text-xs font-semibold tracking-[0.08em] uppercase opacity-80">Stufe 2</span>
      <h2 id="freischalten-titel" className="text-2xl font-bold">
        Ausführliche Auswertung freischalten
      </h2>
      <ul className="grid gap-2 text-[15px]">
        <li>Alle {punkte} Befunde mit Erklärung, wie wir sie festgestellt haben</li>
        <li>Konkrete Lösungsvorschläge zu jedem Punkt</li>
        <li>Zusammenfassung Ihrer Abrechnung</li>
        <li>Anschreiben an Ihre Hausverwaltung und auf Wunsch Beratung durch unsere Experten</li>
      </ul>
      {modus === "test" ? (
        <>
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
            className="justify-self-start rounded-lg bg-gruen px-6 py-3.5 font-semibold text-white hover:bg-gruen-tief disabled:opacity-60"
          >
            {laedt ? "Wird freigeschaltet …" : "Jetzt freischalten"}
          </button>
          <p className="text-sm opacity-80">Testmodus: Die Freischaltung erfolgt ohne Bezahlung.</p>
        </>
      ) : (
        <p className="font-semibold">Die ausführliche Auswertung ist in Kürze verfügbar.</p>
      )}
      {fehler && (
        <p role="alert" className="rounded-xl bg-fehler px-3.5 py-2.5 text-sm text-fehler-text">
          {fehler}
        </p>
      )}
    </section>
  );
}

// ---------- Stufe 2 ----------

function Auffaelligkeiten({ s2 }: { s2: Stufe2 }) {
  if (s2.auffaelligkeiten.length === 0) {
    return <Karte titel="Auffälligkeiten">Wir haben keine Fehler oder Auffälligkeiten festgestellt.</Karte>;
  }
  return (
    <div className="grid gap-4">
      <h3 className="text-lg font-bold">Auffälligkeiten und Lösungsvorschläge</h3>
      <ol className="grid gap-4">
        {s2.auffaelligkeiten.map((p, i) => (
          <li key={`${p.regelId}-${i}`} className="grid gap-3 rounded-3xl border border-linie bg-grund p-5 shadow-glas sm:p-6">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[p.status].klasse}`}>{STATUS[p.status].text}</span>
              <h4 className="min-w-0 flex-1 text-[17px] font-semibold">{p.titel}</h4>
              {p.betrag !== undefined && <span className="font-bold tabular-nums">{euro(p.betrag)}</span>}
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-semibold tracking-[0.06em] text-gedaempft uppercase">Befund</span>
              <p className="text-[15px]">{p.befund}</p>
            </div>
            <div className="grid gap-1 rounded-2xl bg-mint p-4">
              <span className="text-xs font-semibold tracking-[0.06em] text-gruen-tief uppercase">Lösungsvorschlag</span>
              <p className="text-[15px]">{p.loesung}</p>
            </div>
            {p.grundlage && <p className="text-xs text-gedaempft">Grundlage: {p.grundlage}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Zusammenfassung({ s2 }: { s2: Stufe2 }) {
  return (
    <Karte titel="Zusammenfassung">
      <div className="grid gap-3 text-[15px] leading-relaxed">
        {s2.zusammenfassung.map((satz, i) => (
          <p key={i}>{satz}</p>
        ))}
      </div>
    </Karte>
  );
}

// ---------- Abschluss ----------

function Abschluss({ s2, beratungAnfragen }: { s2: Stufe2; beratungAnfragen: Aktionen["beratungAnfragen"] }) {
  return (
    <section className="grid gap-5" aria-labelledby="abschluss-titel">
      <h2 id="abschluss-titel" className="text-xl font-bold">
        Wie möchten Sie weitermachen?
      </h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <Anschreiben s2={s2} />
        <Beratung beratungAnfragen={beratungAnfragen} />
      </div>
    </section>
  );
}

function Anschreiben({ s2 }: { s2: Stufe2 }) {
  const [text, setText] = useState(s2.anschreiben.text);
  const [kopiert, setKopiert] = useState(false);
  const mailto = `mailto:?subject=${encodeURIComponent(s2.anschreiben.betreff)}&body=${encodeURIComponent(text)}`;
  async function kopieren() {
    const voll = `Betreff: ${s2.anschreiben.betreff}\n\n${text}`;
    try {
      await navigator.clipboard.writeText(voll);
      setKopiert(true);
    } catch {
      (document.getElementById("anschreiben") as HTMLTextAreaElement | null)?.select();
    }
  }
  return (
    <Karte titel="E-Mail an Ihre Hausverwaltung" unterzeile="Vorlage mit Ihren Einwänden und der Bitte um Belegeinsicht. Ergänzen Sie Name und Anschrift.">
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Betreff</span>
        <span className="rounded-lg border border-linie bg-grund-alt px-3 py-2">{s2.anschreiben.betreff}</span>
      </label>
      <label htmlFor="anschreiben" className="grid gap-1 text-sm">
        <span className="font-semibold">Text</span>
        <textarea
          id="anschreiben"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setKopiert(false);
          }}
          rows={14}
          className="w-full rounded-lg border border-linie bg-grund px-3 py-2 font-sans text-sm leading-relaxed text-text"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={kopieren} className="rounded-lg bg-gruen px-5 py-2.5 font-semibold text-white hover:bg-gruen-tief">
          {kopiert ? "Kopiert" : "Text kopieren"}
        </button>
        <a href={mailto} className="rounded-lg border border-linie px-5 py-2.5 font-semibold">
          Im E-Mail-Programm öffnen
        </a>
      </div>
      <p className="text-xs text-gedaempft">Bitte prüfen Sie die Vorlage vor dem Versand. Sie ersetzt keine Rechtsberatung im Einzelfall.</p>
    </Karte>
  );
}

function Beratung({ beratungAnfragen }: { beratungAnfragen: Aktionen["beratungAnfragen"] }) {
  const [werte, setWerte] = useState({ name: "", email: "", telefon: "", erreichbarkeit: "", nachricht: "" });
  const [einwilligung, setEinwilligung] = useState(false);
  const [zustand, setZustand] = useState<"bereit" | "sendet" | "gesendet">("bereit");
  const [fehler, setFehler] = useState<string>();
  const feld = (name: keyof typeof werte) => ({
    id: `beratung-${name}`,
    value: werte[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setWerte((w) => ({ ...w, [name]: e.target.value })),
    className: "w-full rounded-lg border border-linie bg-grund px-3 py-2.5 text-text",
  });

  if (zustand === "gesendet") {
    return (
      <Karte titel="Beratung durch unsere Experten">
        <p role="status" className="rounded-2xl bg-mint p-4">
          Vielen Dank. Wir haben Ihre Anfrage erhalten und melden uns in der Regel innerhalb von zwei Werktagen bei Ihnen.
        </p>
      </Karte>
    );
  }

  return (
    <Karte titel="Beratung durch unsere Experten" unterzeile="Wir gehen Ihre Abrechnung mit Ihnen durch und besprechen das weitere Vorgehen.">
      <form
        noValidate
        className="grid gap-3"
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
        <label htmlFor="beratung-erreichbarkeit" className="grid gap-1 text-sm font-semibold">
          Wann sind Sie gut erreichbar? (optional)
          <input {...feld("erreichbarkeit")} placeholder="z. B. werktags ab 17 Uhr" />
        </label>
        <label htmlFor="beratung-nachricht" className="grid gap-1 text-sm font-semibold">
          Ihre Nachricht (optional)
          <textarea {...feld("nachricht")} rows={3} />
        </label>
        <label htmlFor="beratung-einwilligung" className="flex items-start gap-3 text-sm text-gedaempft">
          <input id="beratung-einwilligung" type="checkbox" checked={einwilligung} onChange={(e) => setEinwilligung(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--gruen)]" />
          <span>Ich bin einverstanden, dass Biati Solutions mich zu meiner Abrechnung kontaktiert.</span>
        </label>
        {fehler && (
          <p role="alert" className="rounded-xl bg-warn px-3.5 py-2.5 text-sm text-warn-text">
            {fehler}
          </p>
        )}
        <button type="submit" disabled={zustand === "sendet"} className="justify-self-start rounded-lg bg-gruen px-5 py-2.5 font-semibold text-white hover:bg-gruen-tief disabled:opacity-60">
          {zustand === "sendet" ? "Wird gesendet …" : "Beratung anfragen"}
        </button>
      </form>
    </Karte>
  );
}
