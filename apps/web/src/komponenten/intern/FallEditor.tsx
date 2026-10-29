"use client";

import { KOSTENKATEGORIEN, type AbrechnungEingabe, type Pruefbericht } from "@biaticheck/pruefkern";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Fallstatus } from "@/server/db/schema";
import { enthaeltUngueltigeZahl, leseZahl, zeigeZahl } from "./zahlen";

type Daten = AbrechnungEingabe;
type Position = Daten["kostenpositionen"][number];
type Dok = { id: string; art: string; mimeType: string };

const SCHLUESSEL = ["wohnflaeche", "personen", "einheiten", "verbrauch", "miteigentumsanteil", "direkt", "sonstig"] as const;
const STATUS_TEXT = { ok: "OK", abweichung: "Fehler", auffaelligkeit: "Auffällig", nicht_pruefbar: "Offen" } as const;
const STATUS_KLASSE = {
  ok: "bg-marke-100 text-marke-900",
  abweichung: "bg-red-100 text-red-800",
  auffaelligkeit: "bg-amber-100 text-amber-900",
  nicht_pruefbar: "bg-stone-200 text-stone-700",
} as const;


/** Setzt einen Wert unter einem Pfad (unveränderlich). undefined entfernt das Feld. */
function setze<T extends object>(obj: T, pfad: (string | number)[], wert: unknown): T {
  const [kopf, ...rest] = pfad;
  const kopie = (Array.isArray(obj) ? [...obj] : { ...obj }) as unknown as Record<string | number, unknown>;
  if (rest.length === 0) {
    if (wert === undefined && !Array.isArray(obj)) delete kopie[kopf!];
    else kopie[kopf!] = wert;
  } else {
    kopie[kopf!] = setze((kopie[kopf!] as object | undefined) ?? (typeof rest[0] === "number" ? [] : {}), rest, wert);
  }
  return kopie as T;
}

function lies(obj: unknown, pfad: (string | number)[]): unknown {
  return pfad.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string | number, unknown>)[k] : undefined), obj);
}

export function FallEditor({
  fallId,
  status,
  datenStart,
  berichtStart,
  dokumente,
}: {
  fallId: string;
  status: Fallstatus;
  datenStart: Daten;
  berichtStart?: Pruefbericht;
  dokumente: Dok[];
}) {
  const router = useRouter();
  const [daten, setDaten] = useState<Daten>(datenStart);
  const [bericht, setBericht] = useState(berichtStart);
  const [geaendert, setGeaendert] = useState(false);
  const [ansicht, setAnsicht] = useState<"formular" | "json" | "ergebnis">("formular");
  const [json, setJson] = useState("");
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string; details?: { pfad: string; meldung: string }[] }>();
  const [aktiv, setAktiv] = useState(false);
  const [dokId, setDokId] = useState(dokumente[0]?.id);

  const aendere = (pfad: (string | number)[], wert: unknown) => {
    setDaten((d) => setze(d, pfad, wert));
    setGeaendert(true);
  };

  function wechsleAnsicht(neu: typeof ansicht) {
    if (ansicht === "json" && neu !== "json") {
      try {
        setDaten(JSON.parse(json) as Daten);
      } catch {
        setMeldung({ art: "fehler", text: "Das JSON ist ungültig – bitte erst korrigieren." });
        return;
      }
    }
    if (neu === "json") setJson(JSON.stringify(daten, null, 2));
    setAnsicht(neu);
  }

  async function aufruf(pfad: string, init: RequestInit) {
    setAktiv(true);
    setMeldung(undefined);
    try {
      const antwort = await fetch(`/api/intern/faelle/${fallId}${pfad}`, { ...init, headers: { "content-type": "application/json" } });
      const inhalt = (await antwort.json().catch(() => ({}))) as { fehler?: string; details?: { pfad: string; meldung: string }[]; bericht?: Pruefbericht };
      if (!antwort.ok) {
        setMeldung({ art: "fehler", text: inhalt.fehler ?? `Fehler ${antwort.status}`, details: inhalt.details });
        return undefined;
      }
      return inhalt;
    } catch {
      setMeldung({ art: "fehler", text: "Keine Verbindung zum Server." });
      return undefined;
    } finally {
      setAktiv(false);
    }
  }

  async function speichern() {
    let zuSpeichern = daten;
    if (ansicht === "json") {
      try {
        zuSpeichern = JSON.parse(json) as Daten;
      } catch {
        setMeldung({ art: "fehler", text: "Das JSON ist ungültig." });
        return;
      }
    }
    if (enthaeltUngueltigeZahl(zuSpeichern)) {
      setMeldung({ art: "fehler", text: "Mindestens eine Zahl ist ungültig (rot markiert)." });
      return;
    }
    const inhalt = await aufruf("/daten", { method: "PUT", body: JSON.stringify(zuSpeichern) });
    if (!inhalt) return;
    setDaten(zuSpeichern);
    setBericht(inhalt.bericht);
    setGeaendert(false);
    setMeldung({ art: "ok", text: "Gespeichert und neu geprüft." });
    router.refresh();
  }

  async function freigeben() {
    if (!confirm("Ergebnis für den Kunden freigeben?")) return;
    if (await aufruf("/freigabe", { method: "POST" })) {
      setMeldung({ art: "ok", text: "Freigegeben – der Kunde sieht jetzt seine Erstauswertung." });
      router.refresh();
    }
  }

  async function erneutAuslesen() {
    if (!confirm("Abrechnung erneut automatisch auslesen? Nicht gespeicherte Änderungen gehen verloren.")) return;
    if (await aufruf("/erneut", { method: "POST" })) router.refresh();
  }

  const dok = dokumente.find((d) => d.id === dokId);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2">
        {dokumente.length > 1 && (
          <div className="flex gap-2">
            {dokumente.map((d) => (
              <button key={d.id} onClick={() => setDokId(d.id)} className={`rounded px-2 py-1 text-sm ${d.id === dokId ? "bg-marke-600 text-white" : "bg-stone-200"}`}>
                {d.art}
              </button>
            ))}
          </div>
        )}
        {dok ? (
          dok.mimeType === "application/pdf" ? (
            <iframe title="Originaldokument" src={`/api/intern/dokumente/${dok.id}`} className="h-[70vh] w-full rounded-xl border border-stone-200 bg-white lg:h-[85vh]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Originaldokument" src={`/api/intern/dokumente/${dok.id}`} className="w-full rounded-xl border border-stone-200" />
          )
        ) : (
          <p className="text-sm text-stone-500">Kein Dokument vorhanden.</p>
        )}
      </section>

      <section className="space-y-3">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white/95 p-2 backdrop-blur">
          {(["formular", "json", "ergebnis"] as const).map((a) => (
            <button key={a} onClick={() => wechsleAnsicht(a)} className={`rounded-lg px-3 py-1.5 text-sm ${ansicht === a ? "bg-stone-800 text-white" : "bg-stone-100"}`}>
              {{ formular: "Daten", json: "JSON", ergebnis: "Prüfergebnis" }[a]}
            </button>
          ))}
          <span className="ml-auto" />
          <button onClick={speichern} disabled={aktiv} className="rounded-lg bg-marke-600 px-3 py-1.5 text-sm font-semibold text-white disabled:bg-stone-300">
            Speichern &amp; prüfen
          </button>
          {status === "expertenpruefung" && (
            <button
              onClick={freigeben}
              disabled={aktiv || geaendert || !bericht}
              title={geaendert ? "Erst speichern" : undefined}
              className="rounded-lg bg-marke-900 px-3 py-1.5 text-sm font-semibold text-white disabled:bg-stone-300"
            >
              Freigeben
            </button>
          )}
          <button onClick={erneutAuslesen} disabled={aktiv} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
            Neu auslesen
          </button>
        </div>

        {meldung && (
          <div role="alert" className={`rounded-lg px-3 py-2 text-sm ${meldung.art === "ok" ? "bg-marke-50 text-marke-900" : "bg-red-50 text-red-800"}`}>
            {meldung.text}
            {meldung.details && (
              <ul className="mt-1 list-disc pl-5">
                {meldung.details.map((d, i) => (
                  <li key={i}>
                    <code>{d.pfad || "(gesamt)"}</code>: {d.meldung}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {geaendert && <p className="text-xs text-amber-800">Nicht gespeicherte Änderungen.</p>}

        {ansicht === "json" && (
          <textarea
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setGeaendert(true);
            }}
            spellCheck={false}
            className="h-[70vh] w-full rounded-xl border border-stone-300 p-3 font-mono text-xs"
          />
        )}
        {ansicht === "ergebnis" && <Ergebnisliste bericht={bericht} />}
        {ansicht === "formular" && <Formular daten={daten} aendere={aendere} />}
      </section>
    </div>
  );
}

function Formular({ daten, aendere }: { daten: Daten; aendere: (pfad: (string | number)[], wert: unknown) => void }) {
  const zahl = (pfad: (string | number)[], titel: string) => <ZahlFeld titel={titel} wert={lies(daten, pfad) as number | undefined} setze={(w) => aendere(pfad, w)} />;
  const datum = (pfad: string[], titel: string) => (
    <label className="text-xs text-stone-600">
      {titel}
      <input
        type="date"
        value={(lies(daten, pfad) as string | undefined) ?? ""}
        onChange={(e) => aendere(pfad, e.target.value || undefined)}
        className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
      />
    </label>
  );
  const zeitraum = (feld: "abrechnungszeitraum" | "nutzungszeitraum", titel: string) => {
    const z = daten.meta[feld];
    const setzeTeil = (teil: "von" | "bis", wert: string) => {
      const neu = { von: z?.von ?? "", bis: z?.bis ?? "", [teil]: wert };
      aendere(["meta", feld], neu.von || neu.bis ? neu : undefined);
    };
    return (
      <div className="grid grid-cols-2 gap-2">
        {(["von", "bis"] as const).map((t) => (
          <label key={t} className="text-xs text-stone-600">
            {titel} {t}
            <input type="date" value={z?.[t] ?? ""} onChange={(e) => setzeTeil(t, e.target.value)} className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900" />
          </label>
        ))}
      </div>
    );
  };

  const positionen = daten.kostenpositionen;
  const neuePosition = (): Position => ({
    id: `m${Date.now().toString(36)}`,
    bezeichnung: "",
    kategorie: "unbekannt",
    anteilMieter: 0,
  });

  return (
    <div className="space-y-4 text-sm">
      <Abschnitt titel="Allgemein">
        {zeitraum("abrechnungszeitraum", "Abrechnung")}
        {zeitraum("nutzungszeitraum", "Nutzung")}
        <div className="grid grid-cols-3 gap-2">
          {datum(["meta", "erstelltAm"], "Erstellt am")}
          {datum(["meta", "zugangAm"], "Zugang am")}
          {zahl(["meta", "geschoss"], "Geschoss (EG = 0)")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {zahl(["flaechen", "wohnflaecheMieter"], "Wohnfläche m²")}
          {zahl(["flaechen", "gesamtflaeche"], "Gesamtfläche m²")}
        </div>
      </Abschnitt>

      <Abschnitt titel="Ergebnis laut Abrechnung">
        <div className="grid grid-cols-3 gap-2">
          {zahl(["ausgewiesen", "summeKostenMieter"], "Summe Kosten")}
          {zahl(["vorauszahlungen"], "Vorauszahlungen")}
          {zahl(["ausgewiesen", "saldo"], "Saldo (+ Nachzahlung)")}
          {zahl(["vorauszahlungenDetail", "betriebskosten"], "VZ Betriebskosten")}
          {zahl(["vorauszahlungenDetail", "heizkosten"], "VZ Heizkosten")}
          <span />
          {zahl(["vorauszahlungenDetail", "monatlich", "betriebskosten"], "monatl. BK")}
          {zahl(["vorauszahlungenDetail", "monatlich", "heizkosten"], "monatl. HK")}
        </div>
      </Abschnitt>

      <Abschnitt titel={`Kostenpositionen (${positionen.length})`}>
        <div className="space-y-2">
          {positionen.map((p, i) => (
            <div key={p.id} className="space-y-1 rounded-lg border border-stone-200 p-2">
              <div className="flex gap-2">
                <input
                  value={p.bezeichnung}
                  placeholder="Bezeichnung"
                  onChange={(e) => aendere(["kostenpositionen", i, "bezeichnung"], e.target.value)}
                  className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1"
                />
                <button
                  title="Position entfernen"
                  onClick={() => aendere(["kostenpositionen"], positionen.filter((_, j) => j !== i))}
                  className="rounded px-2 text-stone-500 hover:bg-red-50 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
              <select
                value={p.kategorie}
                onChange={(e) => aendere(["kostenpositionen", i, "kategorie"], e.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1"
              >
                {Object.entries(KOSTENKATEGORIEN).map(([k, name]) => (
                  <option key={k} value={k}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {zahl(["kostenpositionen", i, "gesamtkosten"], "Gesamt €")}
                <label className="text-xs text-stone-600">
                  Schlüssel
                  <select
                    value={p.umlageschluessel?.typ ?? ""}
                    onChange={(e) =>
                      aendere(["kostenpositionen", i, "umlageschluessel"], e.target.value ? { ...p.umlageschluessel, typ: e.target.value } : undefined)
                    }
                    className="mt-0.5 w-full rounded border border-stone-300 px-1 py-1 text-sm text-stone-900"
                  >
                    <option value="">–</option>
                    {SCHLUESSEL.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {p.umlageschluessel ? zahl(["kostenpositionen", i, "umlageschluessel", "anteilEinheit"], "Anteil") : <span />}
                {p.umlageschluessel ? zahl(["kostenpositionen", i, "umlageschluessel", "anteilGesamt"], "von gesamt") : <span />}
                {zahl(["kostenpositionen", i, "anteilMieter"], "Ihr Anteil €")}
              </div>
            </div>
          ))}
          <button onClick={() => aendere(["kostenpositionen"], [...positionen, neuePosition()])} className="rounded-lg border border-dashed border-stone-400 px-3 py-1.5 text-stone-700">
            + Position
          </button>
        </div>
      </Abschnitt>

      <Abschnitt titel="Heizkosten">
        {daten.heizkosten ? (
          <div className="grid grid-cols-3 gap-2">
            {zahl(["heizkosten", "anteilMieter"], "Ihr Anteil €")}
            {zahl(["heizkosten", "gesamtkosten"], "Gesamt €")}
            {zahl(["heizkosten", "verbrauchsanteilProzent"], "Verbrauch %")}
            {zahl(["heizkosten", "flaecheMieter"], "Heizfläche m²")}
            {zahl(["heizkosten", "gesamtflaeche"], "Heizfläche gesamt")}
            <label className="text-xs text-stone-600">
              Verbrauch erfasst
              <select
                value={daten.heizkosten.verbrauchErfasst === undefined ? "" : String(daten.heizkosten.verbrauchErfasst)}
                onChange={(e) => aendere(["heizkosten", "verbrauchErfasst"], e.target.value === "" ? undefined : e.target.value === "true")}
                className="mt-0.5 w-full rounded border border-stone-300 px-1 py-1 text-sm text-stone-900"
              >
                <option value="">?</option>
                <option value="true">ja</option>
                <option value="false">nein</option>
              </select>
            </label>
          </div>
        ) : (
          <button onClick={() => aendere(["heizkosten"], { anteilMieter: 0 })} className="rounded-lg border border-dashed border-stone-400 px-3 py-1.5 text-stone-700">
            + Heizkosten erfassen
          </button>
        )}
        <p className="text-xs text-stone-500">CO₂, Warmwasser, Mietvertrag und Vorjahr in der JSON-Ansicht.</p>
      </Abschnitt>
    </div>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
      <legend className="px-1 font-semibold">{titel}</legend>
      {children}
    </fieldset>
  );
}

/** Zahlenfeld mit deutscher Eingabe; übernimmt den Wert beim Verlassen. Ungültige Eingaben werden rot markiert. */
function ZahlFeld({ titel, wert, setze }: { titel: string; wert: number | undefined; setze: (w: number | undefined) => void }) {
  const [text, setText] = useState(zeigeZahl(wert));
  const [zuletzt, setZuletzt] = useState(wert);
  if (wert !== zuletzt && !Number.isNaN(wert)) {
    // Wert wurde von außen geändert (z. B. JSON-Ansicht)
    setZuletzt(wert);
    setText(zeigeZahl(wert));
  }
  const ungueltig = Number.isNaN(leseZahl(text));
  return (
    <label className="text-xs text-stone-600">
      {titel}
      <input
        inputMode="decimal"
        value={text}
        aria-invalid={ungueltig}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const w = leseZahl(text);
          setZuletzt(w);
          setze(w);
        }}
        className={`mt-0.5 w-full rounded border px-2 py-1 text-right text-sm text-stone-900 ${ungueltig ? "border-red-500 bg-red-50" : "border-stone-300"}`}
      />
    </label>
  );
}

function Ergebnisliste({ bericht }: { bericht?: Pruefbericht }) {
  if (!bericht) return <p className="text-sm text-stone-500">Noch nicht geprüft – Daten erfassen und speichern.</p>;
  const z = bericht.zusammenfassung;
  return (
    <div className="space-y-2 text-sm">
      <p>
        Einsparpotenzial <strong>{z.einsparpotenzial.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</strong> · zu klären{" "}
        <strong>{z.klaerungspotenzial.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</strong> · Regelwerk {bericht.regelwerkVersion}
      </p>
      <ul className="space-y-2">
        {bericht.ergebnisse.map((e, i) => (
          <li key={i} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_KLASSE[e.status]}`}>{STATUS_TEXT[e.status]}</span>
              <span className="font-mono text-xs text-stone-500">{e.regelId}</span>
              <span className="font-medium">{e.titel}</span>
              {e.betragZugunstenMieter !== undefined && (
                <span className="ml-auto">{e.betragZugunstenMieter.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
              )}
            </div>
            <p className="mt-1 text-stone-700">{e.erklaerung}</p>
            {e.naechsterSchritt && <p className="mt-1 text-stone-600">→ {e.naechsterSchritt}</p>}
            {e.beleg && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-stone-500">Beleg</summary>
                <pre className="overflow-x-auto text-xs">{JSON.stringify(e.beleg, null, 2)}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
