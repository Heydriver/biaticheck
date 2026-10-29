import type { NextConfig } from "next";

const sicherheitsHeader = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  // Die Workspace-Pakete liegen als TypeScript-Quellen vor.
  transpilePackages: ["@biaticheck/pruefkern", "@biaticheck/auslesen"],
  // Eigenständiges Server-Bundle nur für das Docker-Image
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: sicherheitsHeader },
      // Einbetten verboten – außer Originaldokumente im eigenen Prüfbereich (PDF-Vorschau)
      { source: "/((?!api/intern/dokumente/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/api/intern/dokumente/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default config;
