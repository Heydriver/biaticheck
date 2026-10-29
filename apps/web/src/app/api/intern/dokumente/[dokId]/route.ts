import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dokumente } from "@/server/db/schema";
import { speicher } from "@/server/dienste";
import { fehler } from "../../../antwort";
import { intern } from "../../schutz";

export const runtime = "nodejs";

/** Liefert ein Originaldokument entschlüsselt an angemeldete Experten aus. */
export const GET = intern<{ dokId: string }>(async (_req, _experte, { dokId }) => {
  if (!/^[0-9a-f-]{36}$/.test(dokId)) return fehler(404, "Nicht gefunden.");
  const [dok] = await db().select().from(dokumente).where(eq(dokumente.id, dokId));
  if (!dok) return fehler(404, "Nicht gefunden.");
  const daten = await speicher().lade(dok.speicherschluessel);
  return new Response(Buffer.from(daten), {
    headers: {
      "Content-Type": dok.mimeType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
});
