import { after } from "next/server";
import { db } from "@/server/db";
import { abhaengigkeiten } from "@/server/dienste";
import { setzeZurueck } from "@/server/intern/faelle";
import { verarbeiteFall } from "@/server/verarbeitung";
import { json } from "../../../../antwort";
import { intern } from "../../../schutz";

export const runtime = "nodejs";

export const POST = intern<{ id: string }>(async (_req, experte, { id }) => {
  await setzeZurueck(db(), id, experte);
  after(() => verarbeiteFall(id, abhaengigkeiten()).catch((e) => console.error(`Fall ${id}: erneutes Auslesen fehlgeschlagen`, e)));
  return json({ ok: true }, 202);
});
