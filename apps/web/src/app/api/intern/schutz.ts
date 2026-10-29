import type { NextRequest } from "next/server";
import { aktuellerExperte, vonEigenerSeite } from "@/server/intern/anfrage";
import type { Experte } from "@/server/intern/sitzung";
import { FallFehler } from "@/server/verarbeitung";
import { fehler } from "../antwort";

type Handler<P> = (req: NextRequest, experte: Experte, params: P) => Promise<Response>;

/** Jeder interne Endpunkt: angemeldet, bei Änderungen von der eigenen Seite, Fachfehler als Statuscode. */
export function intern<P>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    if (req.method !== "GET" && !vonEigenerSeite(req)) return fehler(403, "Ungültige Herkunft der Anfrage.");
    const experte = await aktuellerExperte();
    if (!experte) return fehler(401, "Bitte melden Sie sich an.");
    try {
      return await handler(req, experte, await ctx.params);
    } catch (e) {
      if (e instanceof FallFehler) return fehler(e.status, e.message);
      throw e;
    }
  };
}
