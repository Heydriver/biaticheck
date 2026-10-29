import { NextResponse, type NextRequest } from "next/server";

export function fehler(status: number, meldung: string) {
  return NextResponse.json({ fehler: meldung }, { status, headers: { "Cache-Control": "no-store" } });
}

export function json(daten: unknown, status = 200) {
  return NextResponse.json(daten, { status, headers: { "Cache-Control": "no-store" } });
}

/** IP für die Ratenbegrenzung. Hinter einem Reverse Proxy setzt dieser X-Forwarded-For. */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unbekannt";
}

export const ZUGANG_HEADER = "x-zugang";
