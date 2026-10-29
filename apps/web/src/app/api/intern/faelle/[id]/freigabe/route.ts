import { db } from "@/server/db";
import { gebeFrei } from "@/server/intern/faelle";
import { json } from "../../../../antwort";
import { intern } from "../../../schutz";

export const runtime = "nodejs";

export const POST = intern<{ id: string }>(async (_req, experte, { id }) => {
  await gebeFrei(db(), id, experte);
  return json({ ok: true });
});
