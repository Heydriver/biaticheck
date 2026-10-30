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
    <section className="grid gap-3">
      <h2 className="text-xl font-bold">Damit wir mehr prüfen können</h2>
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
      <div className="rounded-2xl border border-linie bg-grund p-4 text-sm">
        <p>{frage.frage}</p>
        <p className="mt-2 text-gedaempft">Das Nachreichen von Dokumenten ist in Kürze möglich.</p>
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
    <form onSubmit={senden} className="grid gap-2.5 rounded-2xl border border-linie bg-grund p-4">
      <label htmlFor={id} className="block text-sm font-medium">
        {frage.frage}
      </label>
      <div className="flex flex-wrap gap-2">
        {frage.typ === "janein" ? (
          <select id={id} value={eingabe} onChange={(e) => setEingabe(e.target.value)} className="min-w-0 flex-[1_1_160px] rounded-lg border border-linie bg-grund px-3 py-2.5 text-text">
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
            className="min-w-0 flex-[1_1_160px] rounded-lg border border-linie bg-grund px-3 py-2.5 text-text"
          />
        ) : (
          <input
            id={id}
            type={frage.typ === "datum" ? "date" : "text"}
            inputMode={frage.typ === "datum" ? undefined : "decimal"}
            placeholder={frage.typ === "betrag" ? "z. B. 199,94" : undefined}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            className="min-w-0 flex-[1_1_160px] rounded-lg border border-linie bg-grund px-3 py-2.5 text-text"
          />
        )}
        <button type="submit" disabled={sendet} className="shrink-0 rounded-lg bg-gruen px-5 py-2.5 font-semibold text-white hover:bg-gruen-tief disabled:opacity-60">
          {sendet ? "…" : "Senden"}
        </button>
      </div>
      {fehler && (
        <p role="alert" className="text-sm text-fehler-text">
          {fehler}
        </p>
      )}
    </form>
  );
}
