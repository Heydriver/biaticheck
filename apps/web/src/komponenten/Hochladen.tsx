"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_MB = 20;

/** Prüft die Auswahl im Browser – die verbindliche Prüfung (Inhalt, Größe) macht der Server. */
export function pruefeAuswahl(f: { name: string; type: string; size: number } | undefined): string | undefined {
  if (!f) return "Bitte wählen Sie zuerst Ihre Abrechnung aus.";
  const typOk = /^(application\/pdf|image\/jpeg|image\/png)$/.test(f.type) || /\.(pdf|jpe?g|png)$/i.test(f.name);
  if (!typOk) return "Bitte laden Sie ein PDF oder ein Foto (JPG, PNG) Ihrer Abrechnung hoch.";
  if (f.size > MAX_MB * 1024 * 1024) return `Die Datei ist größer als ${MAX_MB} MB.`;
  return undefined;
}

export function Hochladen() {
  const router = useRouter();
  const [datei, setDatei] = useState<File>();
  const [einwilligung, setEinwilligung] = useState(false);
  const [ziehen, setZiehen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();

  function waehle(f: File | undefined) {
    const problem = f ? pruefeAuswahl(f) : undefined;
    setFehler(problem);
    setDatei(problem ? undefined : f);
  }

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (laedt) return;
    // Der Knopf ist immer aktiv und erklärt, was noch fehlt – statt stumm ausgegraut zu sein.
    const problem = pruefeAuswahl(datei);
    if (problem) return setFehler(problem);
    if (!einwilligung) return setFehler("Bitte bestätigen Sie, dass Sie mit der Verarbeitung einverstanden sind.");

    setLaedt(true);
    setFehler(undefined);
    try {
      const formular = new FormData();
      formular.set("datei", datei!);
      formular.set("einwilligung", "ja");
      const antwort = await fetch("/api/faelle", { method: "POST", body: formular });
      const daten = (await antwort.json().catch(() => ({}))) as { id?: string; token?: string; fehler?: string };
      if (!antwort.ok || !daten.id || !daten.token) {
        setFehler(daten.fehler ?? "Das Hochladen hat nicht geklappt. Bitte versuchen Sie es erneut.");
        setLaedt(false);
        return;
      }
      // Token steht hinter dem # und wird so nie an den Server übertragen.
      router.push(`/fall/${daten.id}#${daten.token}`);
    } catch {
      setFehler("Keine Verbindung. Bitte prüfen Sie Ihre Internetverbindung.");
      setLaedt(false);
    }
  }

  const zustand = fehler && !datei && fehler.includes("PDF oder ein Foto") ? "ungueltig" : datei ? "gewaehlt" : "leer";

  return (
    <form onSubmit={absenden} noValidate className="grid gap-4 rounded-3xl border border-linie bg-grund p-5 shadow-glas sm:p-7">
      <div
        onDragEnter={() => setZiehen(true)}
        onDragOver={() => setZiehen(true)}
        onDragLeave={() => setZiehen(false)}
        onDrop={() => setZiehen(false)}
        className={`relative grid place-items-center gap-1.5 rounded-2xl border-2 px-4 py-8 text-center transition-colors focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-gruen ${
          zustand === "ungueltig"
            ? "border-fehler-text bg-fehler"
            : zustand === "gewaehlt"
              ? "border-solid border-gruen bg-mint"
              : `border-dashed bg-mint ${ziehen ? "border-gruen" : "border-gruen/40 hover:border-gruen"}`
        }`}
      >
        {/* Das echte Dateifeld liegt unsichtbar über der ganzen Fläche: Antippen und Hineinziehen funktionieren auf allen Geräten (auch iOS). */}
        <input
          id="datei"
          name="datei"
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          aria-label="Abrechnung auswählen (PDF oder Foto)"
          aria-describedby="datei-hinweis"
          onChange={(e) => waehle(e.target.files?.[0])}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-gruen" aria-hidden="true">
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <span className="text-[17px] font-bold text-gruen-tief">
          {datei ? `✓ ${datei.name} (${(datei.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB)` : "PDF oder Foto auswählen"}
        </span>
        <span id="datei-hinweis" className="text-sm text-gedaempft">
          Antippen oder Datei hierher ziehen · PDF, JPG oder PNG, bis {MAX_MB} MB
        </span>
      </div>

      <label htmlFor="einwilligung" className="flex items-start gap-3 text-sm text-gedaempft">
        <input
          id="einwilligung"
          type="checkbox"
          name="einwilligung"
          checked={einwilligung}
          onChange={(e) => {
            setEinwilligung(e.target.checked);
            if (e.target.checked && fehler?.includes("einverstanden")) setFehler(undefined);
          }}
          className="mt-0.5 size-5 shrink-0 accent-[var(--gruen)]"
        />
        <span>
          Ich bin einverstanden, dass meine Abrechnung zur Prüfung verarbeitet und nach 90 Tagen gelöscht wird. Details in der{" "}
          <a href="/datenschutz" className="underline underline-offset-2">
            Datenschutzerklärung
          </a>
          .
        </span>
      </label>

      {fehler && (
        <p role="alert" className="rounded-xl bg-warn px-3.5 py-2.5 text-sm text-warn-text">
          {fehler}
        </p>
      )}

      <button
        type="submit"
        disabled={laedt}
        className="w-full rounded-lg bg-gruen px-6 py-3.5 text-base font-semibold text-white shadow-[0_14px_28px_-16px_rgba(31,163,126,0.8)] hover:bg-gruen-tief disabled:cursor-wait disabled:opacity-60"
      >
        {laedt ? "Wird hochgeladen …" : "Kostenlos prüfen"}
      </button>
    </form>
  );
}
