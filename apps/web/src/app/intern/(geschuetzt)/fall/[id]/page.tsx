import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { ladeFallIntern, leereAbrechnung } from "@/server/intern/faelle";
import { FallEditor } from "@/komponenten/intern/FallEditor";
import { StatusMarke } from "@/komponenten/intern/StatusMarke";

export default async function FallIntern({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const geladen = await ladeFallIntern(db(), id);
  if (!geladen) notFound();
  const { fall, dokumente, verlauf } = geladen;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Fall {fall.id.slice(0, 8)}</h1>
        <StatusMarke status={fall.status} />
        <span className="text-sm text-stone-500">
          hochgeladen {fall.erstelltAm.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} · Löschung{" "}
          {fall.loeschenAm.toLocaleDateString("de-DE")}
        </span>
      </div>

      {(fall.fehler || fall.auslesung) && (
        <div className="space-y-1 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          {fall.fehler && <p className="text-red-800">{fall.fehler}</p>}
          {fall.auslesung && (
            <>
              <p>
                Auslesung: <strong>{fall.auslesung.konsistenz.konsistent ? "stimmig" : "unstimmig"}</strong> · {fall.auslesung.modell} ·{" "}
                {fall.auslesung.nutzung.eingabeTokens.toLocaleString("de-DE")} / {fall.auslesung.nutzung.ausgabeTokens.toLocaleString("de-DE")} Tokens
              </p>
              <ul className="list-disc pl-5 text-stone-700">
                {fall.auslesung.konsistenz.gruende.map((g, i) => (
                  <li key={`g${i}`} className="text-red-800">
                    {g}
                  </li>
                ))}
                {fall.auslesung.hinweise.map((h, i) => (
                  <li key={`h${i}`}>{h}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <FallEditor
        fallId={fall.id}
        status={fall.status}
        datenStart={fall.daten ?? leereAbrechnung()}
        berichtStart={fall.bericht ?? undefined}
        dokumente={dokumente.map((d) => ({ id: d.id, art: d.art, mimeType: d.mimeType }))}
      />

      <details className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Verlauf ({verlauf.length})</summary>
        <ul className="mt-2 space-y-1">
          {verlauf.map((v) => (
            <li key={v.id} className="flex flex-wrap gap-x-3">
              <span className="text-stone-500">{v.zeitpunkt.toLocaleString("de-DE")}</span>
              <span className="font-medium">{v.aktion}</span>
              <span className="text-stone-600">{v.akteur}</span>
              {v.details && <code className="w-full truncate text-xs text-stone-500">{JSON.stringify(v.details)}</code>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
