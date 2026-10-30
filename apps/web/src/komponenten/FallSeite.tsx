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
          <a href="/#pruefen" className="text-gruen-tief underline">
            Andere Datei hochladen
          </a>
        </Hinweis>
      );
    case "fehler":
      return (
        <Hinweis titel="Das Auslesen hat nicht geklappt">
          Bitte versuchen Sie es in ein paar Minuten erneut.
          <button
            className="mt-4 block rounded-lg bg-gruen px-5 py-2.5 font-semibold text-white hover:bg-gruen-tief"
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
  abweichung: { text: "Fehler", klasse: "bg-fehler text-fehler-text" },
  auffaelligkeit: { text: "Auffällig", klasse: "bg-warn text-warn-text" },
  nicht_pruefbar: { text: "Offen", klasse: "bg-offen text-offen-text" },
} as const;

function Ergebnis({ e, beantworte }: { e: Erstauswertung; beantworte: (feld: string, wert: unknown) => Promise<void> }) {
  return (
    <div className="grid gap-7">
      <div className="grid gap-2">
        <span className="text-xs font-semibold tracking-[0.08em] text-gedaempft uppercase">Kostenlose Erstauswertung</span>
        <h1 className="text-[clamp(28px,4vw,40px)] leading-tight font-bold">Ihre kostenlose Erstauswertung</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Kennzahl titel="Sicheres Einsparpotenzial" wert={euro(e.einsparpotenzial)} hervorheben={e.einsparpotenzial > 0} />
        <Kennzahl titel="Zu klären" wert={euro(e.klaerungspotenzial)} hervorheben={e.klaerungspotenzial > 0} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Zaehler anzahl={e.anzahl.abweichung} text="Fehler" klasse={STATUS_STIL.abweichung.klasse} />
        <Zaehler anzahl={e.anzahl.auffaelligkeit} text="Auffälligkeiten" klasse={STATUS_STIL.auffaelligkeit.klasse} />
        <Zaehler anzahl={e.anzahl.nicht_pruefbar} text="offene Punkte" klasse={STATUS_STIL.nicht_pruefbar.klasse} />
        <Zaehler anzahl={e.anzahl.ok} text="ohne Befund" klasse="bg-ok text-ok-text" />
      </div>

      {e.punkte.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-bold">Was uns aufgefallen ist</h2>
          <ul className="divide-y divide-linie overflow-hidden rounded-2xl border border-linie bg-grund">
            {e.punkte.map((p, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <span className={`min-w-[76px] shrink-0 rounded-full px-2.5 py-0.5 text-center text-xs font-semibold ${STATUS_STIL[p.status].klasse}`}>
                  {STATUS_STIL[p.status].text}
                </span>
                <span className="text-[15px]">{p.titel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {e.rueckfragen.length > 0 && <Rueckfragen fragen={e.rueckfragen} beantworte={beantworte} />}

      <section className="grid gap-1.5 rounded-2xl bg-dunkelkarte p-6 text-dunkelkarte-text">
        <h2 className="text-lg font-semibold">Ausführlicher Bericht</h2>
        <p className="text-sm opacity-85">Erklärung zu jedem Punkt, konkrete Beträge, Musterschreiben an den Vermieter und Ihre nächsten Schritte.</p>
        <p className="mt-2 text-sm font-semibold">Demnächst verfügbar.</p>
      </section>

      <LinkMerken />
      <p className="text-xs text-gedaempft">
        Geprüft am {new Date(e.geprueftAm).toLocaleDateString("de-DE")} mit Regelwerk {e.regelwerkVersion}. Keine Rechtsberatung.
      </p>
    </div>
  );
}

function Kennzahl({ titel, wert, hervorheben }: { titel: string; wert: string; hervorheben: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${hervorheben ? "border-gruen bg-mint" : "border-linie bg-grund"}`}>
      <div className="text-[13px] text-gedaempft">{titel}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{wert}</div>
    </div>
  );
}

function Zaehler({ anzahl, text, klasse }: { anzahl: number; text: string; klasse: string }) {
  return (
    <span className={`rounded-full px-3 py-1 font-semibold ${klasse}`}>
      {anzahl} {text}
    </span>
  );
}

function Laden({ text }: { text: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 py-16 text-center">
      <span className="size-10 animate-spin rounded-full border-4 border-mint border-t-gruen" aria-hidden />
      <p className="text-gedaempft">{text}</p>
    </div>
  );
}

function Hinweis({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-linie bg-grund p-6 shadow-glas sm:p-8">
      <h1 className="text-2xl font-bold">{titel}</h1>
      <div className="mt-3 text-gedaempft">{children}</div>
    </div>
  );
}

function LinkMerken() {
  return (
    <p className="mt-4 rounded-xl bg-warn px-3.5 py-2.5 text-sm text-warn-text">
      Bitte speichern Sie diesen Link (Lesezeichen). Nur damit gelangen Sie wieder zu Ihrer Prüfung.
    </p>
  );
}
