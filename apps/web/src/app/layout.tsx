import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiatiCheck – Nebenkostenabrechnung prüfen",
  description: "Laden Sie Ihre Nebenkostenabrechnung hoch und erhalten Sie eine kostenlose Erstauswertung – geprüft nach den Regeln der Experten von Biati Solutions.",
  icons: { icon: "/biati-logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e0c" },
  ],
};

// Setzt das gespeicherte Farbschema vor dem ersten Zeichnen – verhindert kurzes Aufblitzen.
const THEMA_SKRIPT = `try{var t=localStorage.getItem("bck-thema");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEMA_SKRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
