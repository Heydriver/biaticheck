import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiatiCheck – Nebenkostenabrechnung prüfen",
  description: "Laden Sie Ihre Nebenkostenabrechnung hoch und erhalten Sie eine kostenlose Erstauswertung – geprüft nach Expertenregeln.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="flex min-h-dvh flex-col">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-marke-700">
              BiatiCheck
            </Link>
            <span className="text-xs text-stone-500">Nebenkosten prüfen</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <footer className="border-t border-stone-200 bg-white text-sm text-stone-500">
          <div className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-4">
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <span className="ml-auto">© biati.de</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
