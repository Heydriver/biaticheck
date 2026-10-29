import type { Fallstatus } from "@/server/db/schema";

const STIL: Record<Fallstatus, [string, string]> = {
  hochgeladen: ["Hochgeladen", "bg-stone-100 text-stone-700"],
  wird_ausgelesen: ["Wird ausgelesen", "bg-sky-100 text-sky-800"],
  expertenpruefung: ["Prüfen", "bg-amber-100 text-amber-900"],
  fertig: ["Freigegeben", "bg-marke-100 text-marke-900"],
  kein_nebenkostendokument: ["Kein NK-Dokument", "bg-stone-200 text-stone-700"],
  fehler: ["Fehler", "bg-red-100 text-red-800"],
};

export function StatusMarke({ status }: { status: Fallstatus }) {
  const [text, klasse] = STIL[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${klasse}`}>{text}</span>;
}
