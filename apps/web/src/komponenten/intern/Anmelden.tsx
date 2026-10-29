"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Anmelden() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string>();
  const [laedt, setLaedt] = useState(false);

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(undefined);
    const antwort = await fetch("/api/intern/anmelden", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, passwort }),
    }).catch(() => undefined);
    if (antwort?.ok) {
      router.replace("/intern");
      router.refresh();
      return;
    }
    const daten = (await antwort?.json().catch(() => ({}))) as { fehler?: string } | undefined;
    setFehler(daten?.fehler ?? "Anmeldung fehlgeschlagen.");
    setLaedt(false);
  }

  return (
    <form onSubmit={absenden} className="mx-auto max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
      <h1 className="text-xl font-semibold">Prüfbereich – Anmeldung</h1>
      <label className="block text-sm">
        E-Mail
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
      </label>
      <label className="block text-sm">
        Passwort
        <input type="password" autoComplete="current-password" required value={passwort} onChange={(e) => setPasswort(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
      </label>
      {fehler && (
        <p role="alert" className="text-sm text-red-700">
          {fehler}
        </p>
      )}
      <button disabled={laedt} className="w-full rounded-xl bg-marke-600 px-4 py-2 font-semibold text-white disabled:bg-stone-300">
        {laedt ? "…" : "Anmelden"}
      </button>
    </form>
  );
}
