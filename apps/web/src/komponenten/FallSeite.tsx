"use client";

import { useCallback, useEffect, useState } from "react";
import type { FallAnsicht } from "@/server/ansicht";
import { Auswertung } from "./Auswertung";

const ABFRAGE_INTERVALL_MS = 3000;

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
      return ansicht.stufe1 ? (
        <>
          <Auswertung
            ansicht={{ ...ansicht, stufe1: ansicht.stufe1 }}
            aktionen={{
              beantworte: async (feld, wert) => setAnsicht(await anfrage("/antworten", { method: "POST", body: JSON.stringify({ feld, wert }) })),
              freischalten: async () => setAnsicht(await anfrage("/freischalten", { method: "POST" })),
              beratungAnfragen: async (daten) => {
                await anfrage("/beratung", { method: "POST", body: JSON.stringify(daten) });
              },
            }}
          />
          <LinkMerken />
          <p className="mt-4 text-xs text-gedaempft">
            Geprüft am {new Date(ansicht.stufe1.geprueftAm).toLocaleDateString("de-DE")} mit Regelwerk {ansicht.stufe1.regelwerkVersion}. Keine Rechtsberatung.
          </p>
        </>
      ) : null;
  }
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
