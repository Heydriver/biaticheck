import Link from "next/link";
import { db } from "@/server/db";
import { listeFaelle } from "@/server/intern/faelle";
import { StatusMarke } from "@/komponenten/intern/StatusMarke";

const euro = (n: number | null) => (n === null ? "–" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n));

export default async function Arbeitsliste() {
  const faelle = await listeFaelle(db());
  const offen = faelle.filter((f) => f.status === "expertenpruefung").length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        Fälle <span className="text-base font-normal text-stone-500">({offen} warten auf Prüfung)</span>
      </h1>
      {faelle.length === 0 ? (
        <p className="text-stone-600">Noch keine Fälle.</p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {faelle.map((f) => (
            <li key={f.id}>
              <Link href={`/intern/fall/${f.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-stone-50">
                <StatusMarke status={f.status} />
                <span className="font-mono text-xs text-stone-500">{f.id.slice(0, 8)}</span>
                <span className="text-sm">{f.erstelltAm.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</span>
                {f.konsistent === false && <span className="rounded bg-red-50 px-1.5 text-xs text-red-800">Auslesung unstimmig</span>}
                {f.fehler && <span className="truncate text-xs text-stone-500">{f.fehler}</span>}
                <span className="ml-auto text-sm">
                  {euro(f.einsparpotenzial)} <span className="text-stone-400">/</span> {euro(f.klaerungspotenzial)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">Beträge: sicheres Einsparpotenzial / zu klären.</p>
    </div>
  );
}
