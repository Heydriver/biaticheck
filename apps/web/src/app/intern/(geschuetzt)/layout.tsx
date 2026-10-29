import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { aktuellerExperte } from "@/server/intern/anfrage";
import { Abmelden } from "@/komponenten/intern/Abmelden";

export const metadata: Metadata = { title: "Prüfbereich – BiatiCheck", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InternLayout({ children }: { children: React.ReactNode }) {
  const experte = await aktuellerExperte();
  if (!experte) redirect("/intern/anmelden");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-marke-900 px-4 py-2 text-sm text-white">
        <Link href="/intern" className="font-semibold">
          Prüfbereich
        </Link>
        <span className="ml-auto text-marke-100">{experte.name}</span>
        <Abmelden />
      </div>
      {children}
    </div>
  );
}
