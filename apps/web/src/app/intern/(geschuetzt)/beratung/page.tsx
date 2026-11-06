import { desc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/server/db";
import { beratungsanfragen } from "@/server/db/schema";

const STATUS_TEXT = { neu: "Neu", in_bearbeitung: "In Bearbeitung", erledigt: "Erledigt" } as const;

export default async function Beratungsanfragen() {
  const anfragen = await db().select().from(beratungsanfragen).orderBy(desc(beratungsanfragen.erstelltAm)).limit(300);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        Beratungsanfragen <span className="text-base font-normal text-stone-500">({anfragen.filter((a) => a.status === "neu").length} neu)</span>
      </h1>
      {anfragen.length === 0 ? (
        <p className="text-stone-600">Noch keine Anfragen.</p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {anfragen.map((a) => (
            <li key={a.id} className="grid gap-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{STATUS_TEXT[a.status]}</span>
                <strong>{a.name}</strong>
                <span>{a.email}</span>
                {a.telefon && <span>{a.telefon}</span>}
                <span className="text-stone-500">{a.erstelltAm.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</span>
                <Link href={`/intern/fall/${a.fallId}`} className="ml-auto text-marke-700 underline">
                  Fall öffnen
                </Link>
              </div>
              {a.erreichbarkeit && <p className="text-stone-600">Erreichbar: {a.erreichbarkeit}</p>}
              {a.nachricht && <p className="whitespace-pre-line text-stone-700">{a.nachricht}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
