"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_MB = 20;

export function Hochladen() {
  const router = useRouter();
  const [datei, setDatei] = useState<File>();
  const [einwilligung, setEinwilligung] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string>();

  function waehle(f: File | undefined) {
    setFehler(undefined);
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setFehler(`Die Datei ist größer als ${MAX_MB} MB.`);
      return;
    }
    setDatei(f);
  }

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (!datei || !einwilligung || laedt) return;
    setLaedt(true);
    setFehler(undefined);
    try {
      const formular = new FormData();
      formular.set("datei", datei);
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

  return (
    <form onSubmit={absenden} className="space-y-4 rounded-2xl border border-marke-100 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold">Abrechnung hochladen</h2>

      <label
        htmlFor="datei"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-marke-100 bg-marke-50 px-4 py-8 text-center hover:border-marke-600"
      >
        <span className="text-base font-medium text-marke-700">{datei ? datei.name : "PDF oder Foto auswählen"}</span>
        <span className="text-sm text-stone-500">{datei ? `${(datei.size / 1024 / 1024).toFixed(1)} MB` : `PDF, JPG oder PNG, bis ${MAX_MB} MB`}</span>
      </label>
      <input
        id="datei"
        name="datei"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        onChange={(e) => waehle(e.target.files?.[0])}
      />

      <label className="flex items-start gap-3 text-sm text-stone-700">
        <input
          type="checkbox"
          name="einwilligung"
          checked={einwilligung}
          onChange={(e) => setEinwilligung(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-marke-600"
        />
        <span>
          Ich bin einverstanden, dass meine Abrechnung zur Prüfung verarbeitet und nach 90 Tagen gelöscht wird. Details in der{" "}
          <a href="/datenschutz" className="underline">
            Datenschutzerklärung
          </a>
          .
        </span>
      </label>

      {fehler && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {fehler}
        </p>
      )}

      <button
        type="submit"
        disabled={!datei || !einwilligung || laedt}
        className="w-full rounded-xl bg-marke-600 px-4 py-3 text-base font-semibold text-white hover:bg-marke-700 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {laedt ? "Wird hochgeladen …" : "Kostenlos prüfen"}
      </button>
    </form>
  );
}
