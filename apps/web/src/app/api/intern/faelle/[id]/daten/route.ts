import { db } from "@/server/db";
import { speichereDaten, validiereDaten } from "@/server/intern/faelle";
import { json } from "../../../../antwort";
import { intern } from "../../../schutz";

export const runtime = "nodejs";

export const PUT = intern<{ id: string }>(async (req, experte, { id }) => {
  const pruefung = validiereDaten(await req.json().catch(() => null));
  if (!pruefung.ok) return json({ fehler: "Die Daten sind unvollständig oder ungültig.", details: pruefung.fehler }, 400);
  const bericht = await speichereDaten(db(), id, pruefung.daten, experte);
  return json({ bericht });
});
