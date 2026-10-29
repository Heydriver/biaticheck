"use client";

import type { Erstauswertung } from "@biaticheck/pruefkern";
import { useState } from "react";

type Frage = Erstauswertung["rueckfragen"][number];

/** Wandelt die Eingabe je Antworttyp in den Wert um, den der Server erwartet. */
export function wandleEingabe(typ: Frage["typ"], eingabe: string): unknown {
  switch (typ) {
    case "datum":
      return eingabe;
    case "betrag":
    case "zahl": {
      const zahl = Number(eingabe.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(zahl) ? zahl : undefined;
    }
    case "janein":
      return eingabe === "ja" ? true : eingabe === "nein" ? false : undefined;
    case "liste":
      return eingabe
        .split(/[\n;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    case "dokument":
      return undefined;
  }
}

export function Rueckfragen({ fragen, beantworte }: { fragen: Frage[]; beantworte: (feld: string, wert: unknown) => Promise<void> }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Damit wir mehr prüfen können</h2>
      {fragen.map((f) => (
        <Frageformular key={f.feld} frage={f} beantworte={beantworte} />
      ))}
    </section>
  );
}

function Frageformular({ frage, beantworte }: { frage: Frage; beantworte: (feld: string, wert: unknown) => Promise<void> }) {
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  const id = `frage-${frage.feld}`;

  if (frage.typ === "dokument") {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
        <p>{frage.frage}</p>
        <p className="mt-2 text-stone-500">Das Nachreichen von Dokumenten ist in Kürze möglich.</p>
      </div>
    );
  }

  async function senden(e: React.FormEvent) {
    e.preventDefault();
    const wert = wandleEingabe(frage.typ, eingabe);
    if (wert === undefined || (Array.isArray(wert) && wert.length === 0)) {
      setFehler("Bitte geben Sie eine gültige Antwort ein.");
      return;
    }
    setSendet(true);
    setFehler(undefined);
    try {
      await beantworte(frage.feld, wert);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      setSendet(false);
    }
  }

  return (
    <form onSubmit={senden} className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
      <label htmlFor={id} className="block text-sm font-medium">
        {frage.frage}
      </label>
      <div className="flex gap-2">
        {frage.typ === "janein" ? (
          <select id={id} value={eingabe} onChange={(e) => setEingabe(e.target.value)} className="flex-1 rounded-lg border border-stone-300 px-3 py-2">
            <option value="">Bitte wählen</option>
            <option value="ja">Ja</option>
            <option value="nein">Nein</option>
          </select>
        ) : frage.typ === "liste" ? (
          <textarea
            id={id}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            rows={3}
            placeholder="Eine Kostenart pro Zeile"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          />
        ) : (
          <input
            id={id}
            type={frage.typ === "datum" ? "date" : "text"}
            inputMode={frage.typ === "datum" ? undefined : "decimal"}
            placeholder={frage.typ === "betrag" ? "z. B. 199,94" : undefined}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2"
          />
        )}
        <button type="submit" disabled={sendet} className="shrink-0 rounded-lg bg-marke-600 px-4 py-2 font-semibold text-white disabled:bg-stone-300">
          {sendet ? "…" : "Senden"}
        </button>
      </div>
      {fehler && (
        <p role="alert" className="text-sm text-red-700">
          {fehler}
        </p>
      )}
    </form>
  );
}
