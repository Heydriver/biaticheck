"use client";

import type { Erstauswertung } from "@biaticheck/pruefkern";
import { useCallback, useEffect, useState } from "react";
import type { FallAnsicht } from "@/server/ansicht";
import { Rueckfragen } from "./Rueckfragen";

const ABFRAGE_INTERVALL_MS = 3000;
const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export function FallSeite({ id }: { id: string }) {
  const [token, setToken] = useState<string>();
  const [ansicht, setAnsicht] = useState<FallAnsicht>();
  const [fehler, setFehler] = useState<string>();

  useEffect(() => setToken(window.location.hash.slice(1) || ""), []);

  const anfrage = useCallback(
    async (pfad = "", init?: RequestInit) => {
      const antwort = await fetch(`/api/faelle/${id}${pfad}`, {
        ...init,
        headers: { "x-zugang": token ?? "", ...(init?.body ? { "content-type": "application/json" } : {}) },
        cache: "no-store",
      });
      const daten = (await antwort.json().catch(() => ({}))) as FallAnsicht & { fehler?: string };
      if (!antwort.ok) throw new Error(daten.fehler ?? "Unbekannter Fehler");
      return daten;
    },
    [id, token],
  );

  useEffect(() => {
    if (token === undefined) return;
    if (!token) {
      setFehler("Dieser Link ist unvollständig. Bitte verwenden Sie den vollständigen Link zu Ihrer Prüfung.");
      return;
    }
    let aktiv = true;
    let timer: ReturnType<typeof setTimeout>;
    const lade = async () => {
      try {
        const a = await anfrage();
        if (!aktiv) return;
        setAnsicht(a);
        if (a.status === "hochgeladen" || a.status === "wird_ausgelesen") timer = setTimeout(lade, ABFRAGE_INTERVALL_MS);
      } catch (e) {
        if (aktiv) setFehler(e instanceof Error ? e.message : String(e));
      }
    };
    void lade();
    return () => {
      aktiv = false;
      clearTimeout(timer);
    };
  }, [token, anfrage]);

  if (fehler) return <Hinweis titel="Prüfung nicht gefunden">{fehler}</Hinweis>;
  if (!ansicht) return <Laden text="Prüfung wird geladen …" />;

  switch (ansicht.status) {
    case "hochgeladen":
    case "wird_ausgelesen":
      return <Laden text="Ihre Abrechnung wird ausgelesen und geprüft. Das dauert etwa eine Minute." />;
    case "expertenpruefung":
      return (
        <Hinweis titel="Ihre Abrechnung ist bei unseren Experten">
          Wir prüfen Ihre Abrechnung zusätzlich von Hand. Sobald das Ergebnis vorliegt, sehen Sie es unter diesem Link.
          <LinkMerken />
        </Hinweis>
      );
    case "kein_nebenkostendokument":
      return (
        <Hinweis titel="Keine Nebenkostenabrechnung erkannt">
          Das hochgeladene Dokument scheint keine Nebenkosten- oder Betriebskostenabrechnung zu sein.{" "}
          <a href="/" className="underline">
            Andere Datei hochladen
          </a>
        </Hinweis>
      );
    case "fehler":
      return (
        <Hinweis titel="Das Auslesen hat nicht geklappt">
          Bitte versuchen Sie es in ein paar Minuten erneut.
          <button
            className="mt-4 block rounded-xl bg-marke-600 px-4 py-2 font-semibold text-white"
            onClick={async () => setAnsicht(await anfrage("/erneut", { method: "POST" }).catch(() => ansicht))}
          >
            Erneut versuchen
          </button>
        </Hinweis>
      );
    case "fertig":
      return ansicht.erstauswertung ? (
        <Ergebnis
          e={ansicht.erstauswertung}
          beantworte={async (feld, wert) => setAnsicht(await anfrage("/antworten", { method: "POST", body: JSON.stringify({ feld, wert }) }))}
        />
      ) : null;
  }
}

const STATUS_STIL = {
  abweichung: { text: "Fehler", klasse: "bg-red-100 text-red-800" },
  auffaelligkeit: { text: "Auffällig", klasse: "bg-amber-100 text-amber-900" },
  nicht_pruefbar: { text: "Offen", klasse: "bg-stone-200 text-stone-700" },
} as const;

function Ergebnis({ e, beantworte }: { e: Erstauswertung; beantworte: (feld: string, wert: unknown) => Promise<void> }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ihre kostenlose Erstauswertung</h1>

      <div className="grid grid-cols-2 gap-3">
        <Kennzahl titel="Sicheres Einsparpotenzial" wert={euro(e.einsparpotenzial)} hervorheben={e.einsparpotenzial > 0} />
        <Kennzahl titel="Zu klären" wert={euro(e.klaerungspotenzial)} hervorheben={e.klaerungspotenzial > 0} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Zaehler anzahl={e.anzahl.abweichung} text="Fehler" klasse={STATUS_STIL.abweichung.klasse} />
        <Zaehler anzahl={e.anzahl.auffaelligkeit} text="Auffälligkeiten" klasse={STATUS_STIL.auffaelligkeit.klasse} />
        <Zaehler anzahl={e.anzahl.nicht_pruefbar} text="offene Punkte" klasse={STATUS_STIL.nicht_pruefbar.klasse} />
        <Zaehler anzahl={e.anzahl.ok} text="ohne Befund" klasse="bg-marke-100 text-marke-900" />
      </div>

      {e.punkte.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Was uns aufgefallen ist</h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {e.punkte.map((p, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STIL[p.status].klasse}`}>
                  {STATUS_STIL[p.status].text}
                </span>
                <span className="text-sm">{p.titel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {e.rueckfragen.length > 0 && <Rueckfragen fragen={e.rueckfragen} beantworte={beantworte} />}

      <section className="rounded-2xl bg-marke-900 p-5 text-white">
        <h2 className="text-lg font-semibold">Ausführlicher Bericht</h2>
        <p className="mt-1 text-sm text-marke-100">
          Erklärung zu jedem Punkt, konkrete Beträge, Musterschreiben an den Vermieter und Ihre nächsten Schritte.
        </p>
        <p className="mt-3 text-sm font-semibold">Demnächst verfügbar.</p>
      </section>

      <LinkMerken />
      <p className="text-xs text-stone-500">
        Geprüft am {new Date(e.geprueftAm).toLocaleDateString("de-DE")} mit Regelwerk {e.regelwerkVersion}. Keine Rechtsberatung.
      </p>
    </div>
  );
}

function Kennzahl({ titel, wert, hervorheben }: { titel: string; wert: string; hervorheben: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${hervorheben ? "border-marke-600 bg-marke-50" : "border-stone-200 bg-white"}`}>
      <div className="text-xs text-stone-600">{titel}</div>
      <div className="mt-1 text-xl font-bold">{wert}</div>
    </div>
  );
}

function Zaehler({ anzahl, text, klasse }: { anzahl: number; text: string; klasse: string }) {
  return (
    <span className={`rounded-full px-3 py-1 font-medium ${klasse}`}>
      {anzahl} {text}
    </span>
  );
}

function Laden({ text }: { text: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 py-16 text-center">
      <span className="size-10 animate-spin rounded-full border-4 border-marke-100 border-t-marke-600" aria-hidden />
      <p className="text-stone-700">{text}</p>
    </div>
  );
}

function Hinweis({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <h1 className="text-xl font-semibold">{titel}</h1>
      <div className="mt-2 text-stone-700">{children}</div>
    </div>
  );
}

function LinkMerken() {
  return (
    <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Bitte speichern Sie diesen Link (Lesezeichen). Nur damit gelangen Sie wieder zu Ihrer Prüfung.
    </p>
  );
}
