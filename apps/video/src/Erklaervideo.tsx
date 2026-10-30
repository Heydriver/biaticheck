import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ALLE_REGELN } from "@biaticheck/pruefkern";
import { LOGO_PFAD, MARKE } from "./marke";

/** Anzahl der Prüfregeln – direkt aus dem Regelwerk, damit sie nie veraltet. */
const ANZAHL_REGELN = ALLE_REGELN.length;

/** Szenen in Frames (30 fps, 25 s). */
export const SZENEN = {
  frage: [0, 120],
  hochladen: [120, 270],
  pruefen: [270, 480],
  ergebnis: [480, 630],
  aufruf: [630, 750],
} as const;
export const DAUER = 750;

const ein = (frame: number, start: number, dauer = 18) =>
  interpolate(frame, [start, start + dauer], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

/** Blendet eine Szene am Anfang ein und am Ende aus. */
function useSzenenblende(laenge: number) {
  const f = useCurrentFrame();
  return interpolate(f, [0, 12, laenge - 12, laenge], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function Schrift() {
  const [handle] = useState(() => delayRender("Inter laden"));
  useEffect(() => {
    Promise.all(
      [400, 500, 600, 700, 800].map((w) =>
        new FontFace("Inter", `url(${staticFile(`inter-latin-${w}-normal.woff2`)}) format("woff2")`, { weight: String(w) })
          .load()
          .then((f) => (document.fonts as unknown as { add: (f: FontFace) => void }).add(f)),
      ),
    ).then(() => continueRender(handle));
  }, [handle]);
  return null;
}

function Hintergrund() {
  const f = useCurrentFrame();
  const schwebe = (phase: number) => Math.sin((f + phase) / 60) * 40;
  const blob = (farbe: string, x: string, y: string, groesse: number, phase: number): React.CSSProperties => ({
    position: "absolute",
    left: x,
    top: y,
    width: groesse,
    height: groesse,
    borderRadius: "50%",
    background: farbe,
    filter: "blur(120px)",
    opacity: 0.55,
    transform: `translate(${schwebe(phase)}px, ${schwebe(phase + 90)}px)`,
  });
  return (
    <AbsoluteFill style={{ background: MARKE.offWhite, overflow: "hidden" }}>
      <div style={blob("#CFEBE1", "-8%", "-12%", 900, 0)} />
      <div style={blob("#D6E6F3", "55%", "40%", 1000, 120)} />
      <div style={blob("#E6F3EE", "20%", "70%", 700, 240)} />
    </AbsoluteFill>
  );
}

function Logo({ groesse }: { groesse: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: groesse * 0.3 }}>
      <svg viewBox="0 0 150 166" width={groesse} height={groesse * 1.1} aria-hidden>
        <path d={LOGO_PFAD} fill={MARKE.gruen} />
      </svg>
      <span style={{ fontSize: groesse * 0.62, fontWeight: 700, color: MARKE.dunkelgruen, letterSpacing: -0.5 }}>
        Biati<span style={{ color: MARKE.gruen }}>Check</span>
      </span>
    </div>
  );
}

function Badge({ children, groesse }: { children: React.ReactNode; groesse: number }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: `${groesse * 0.35}px ${groesse * 0.8}px`,
        borderRadius: 999,
        background: "rgba(31,163,126,0.10)",
        border: "1px solid rgba(31,163,126,0.25)",
        color: MARKE.gruenDunkel,
        fontSize: groesse,
        fontWeight: 600,
      }}
    >
      <span style={{ width: groesse * 0.45, height: groesse * 0.45, borderRadius: "50%", background: MARKE.gruen }} />
      {children}
    </div>
  );
}

/** Schräg schwebende Glaskarte – Gestaltungselement von biati.de. */
function Glaskarte({ children, neigung = -3, style }: { children: React.ReactNode; neigung?: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.86)",
        border: "1px solid rgba(14,59,46,0.08)",
        borderRadius: 28,
        boxShadow: "0 40px 80px -30px rgba(14,59,46,0.30), 0 8px 24px -12px rgba(14,59,46,0.15)",
        transform: `rotate(${neigung}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Schritt({ nummer, titel, groesse }: { nummer: number; titel: string; groesse: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: groesse * 0.5 }}>
      <span
        style={{
          width: groesse * 1.6,
          height: groesse * 1.6,
          borderRadius: "50%",
          background: MARKE.gruen,
          color: "white",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          fontSize: groesse * 0.8,
        }}
      >
        {nummer}
      </span>
      <span style={{ fontSize: groesse, fontWeight: 700, color: MARKE.dunkelgruen }}>{titel}</span>
    </div>
  );
}

function Haken({ groesse, fortschritt }: { groesse: number; fortschritt: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill={fortschritt > 0 ? MARKE.gruen : "#E3E8E5"} />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" strokeDashoffset={16 * (1 - fortschritt)} />
    </svg>
  );
}

// ---------- Szenen ----------

function SzeneFrage({ h }: { h: boolean }) {
  const f = useCurrentFrame();
  const blende = useSzenenblende(SZENEN.frage[1] - SZENEN.frage[0]);
  const s = h ? 1.15 : 1;
  return (
    <AbsoluteFill style={{ opacity: blende, padding: h ? "220px 90px" : "0 160px", justifyContent: "center", gap: 48 * s }}>
      <div style={{ opacity: ein(f, 4), transform: `translateY(${(1 - ein(f, 4)) * 20}px)` }}>
        <Badge groesse={30 * s}>Nebenkosten prüfen mit BiatiCheck</Badge>
      </div>
      <h1 style={{ margin: 0, fontSize: (h ? 112 : 128) * s, lineHeight: 1.02, fontWeight: 800, letterSpacing: -3, color: MARKE.dunkelgruen }}>
        <span style={{ display: "block", opacity: ein(f, 12), transform: `translateY(${(1 - ein(f, 12)) * 40}px)` }}>Ist Ihre Nebenkosten&shy;abrechnung</span>
        <span style={{ display: "block", color: MARKE.gruen, opacity: ein(f, 26), transform: `translateY(${(1 - ein(f, 26)) * 40}px)` }}>korrekt?</span>
      </h1>
      <p style={{ margin: 0, maxWidth: 1100, fontSize: 40 * s, lineHeight: 1.45, color: MARKE.gedaempft, opacity: ein(f, 44) }}>
        Viele Abrechnungen enthalten Rechenfehler oder Kosten, die Mieter gar nicht zahlen müssen.
      </p>
    </AbsoluteFill>
  );
}

const ZEILEN = [
  ["Grundsteuer", "257,21"],
  ["Müllentsorgung", "307,25"],
  ["Gebäudeversicherung", "195,12"],
  ["Hausmeister", "303,99"],
  ["Aufzug Prüf./Wart.", "131,96"],
  ["Heizung & Warmwasser", "1.859,40"],
];

function SzeneHochladen({ h }: { h: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blende = useSzenenblende(SZENEN.hochladen[1] - SZENEN.hochladen[0]);
  const flug = spring({ frame: f - 20, fps, config: { damping: 16, mass: 0.9 } });
  const angekommen = ein(f, 70, 14);
  return (
    <AbsoluteFill
      style={{
        opacity: blende,
        padding: h ? "200px 80px" : "0 160px",
        flexDirection: h ? "column" : "row",
        alignItems: "center",
        justifyContent: h ? "center" : "space-between",
        gap: 80,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 36, maxWidth: h ? undefined : 700 }}>
        <Schritt nummer={1} titel="Hochladen" groesse={h ? 64 : 56} />
        <p style={{ margin: 0, fontSize: h ? 46 : 40, lineHeight: 1.45, color: MARKE.gedaempft }}>
          PDF oder Foto Ihrer Abrechnung – mit Heizkostenabrechnung. Am Handy oder am PC.
        </p>
      </div>
      <div style={{ position: "relative", width: h ? 860 : 720, height: h ? 900 : 760 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            top: h ? 120 : 100,
            borderRadius: 36,
            border: `4px dashed ${angekommen > 0 ? MARKE.gruen : "rgba(31,163,126,0.35)"}`,
            background: "rgba(232,245,240,0.7)",
          }}
        />
        <Glaskarte
          neigung={interpolate(flug, [0, 1], [-14, -3])}
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            top: interpolate(flug, [0, 1], [h ? 1100 : 900, h ? 40 : 20]),
            padding: "48px 48px 40px",
          }}
        >
          <div style={{ fontSize: 22, color: MARKE.gedaempft, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>Abrechnung 2024</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: MARKE.dunkelgruen, marginTop: 8 }}>Betriebs- und Heizkosten</div>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            {ZEILEN.map(([name, betrag]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: MARKE.dunkelgruen, borderBottom: "1px solid rgba(14,59,46,0.08)", paddingBottom: 12 }}>
                <span>{name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{betrag} €</span>
              </div>
            ))}
          </div>
        </Glaskarte>
        <div
          style={{
            position: "absolute",
            right: -20,
            bottom: 20,
            opacity: angekommen,
            transform: `scale(${0.8 + angekommen * 0.2})`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: MARKE.gruen,
            color: "white",
            padding: "20px 32px",
            borderRadius: 999,
            fontSize: 30,
            fontWeight: 600,
            boxShadow: "0 20px 40px -16px rgba(31,163,126,0.6)",
          }}
        >
          <Haken groesse={36} fortschritt={1} /> Hochgeladen
        </div>
      </div>
    </AbsoluteFill>
  );
}

const PRUEFUNGEN = [
  "Abrechnungs- und Einwendungsfrist",
  "Rechenwege und Verteilerschlüssel",
  "Nicht umlagefähige Kosten",
  "Vorauszahlungen",
  "Heizkostenverordnung",
  "CO₂-Kostenaufteilung",
  "Kabel- und Wartungskosten",
  "Vergleich mit üblichen Werten",
];

function SzenePruefen({ h }: { h: boolean }) {
  const f = useCurrentFrame();
  const blende = useSzenenblende(SZENEN.pruefen[1] - SZENEN.pruefen[0]);
  const fortschritt = interpolate(f, [20, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return (
    <AbsoluteFill
      style={{
        opacity: blende,
        padding: h ? "180px 80px" : "0 160px",
        flexDirection: h ? "column" : "row",
        alignItems: "center",
        justifyContent: h ? "center" : "space-between",
        gap: 80,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 36, maxWidth: h ? undefined : 640 }}>
        <Schritt nummer={2} titel="Prüfen" groesse={h ? 64 : 56} />
        <p style={{ margin: 0, fontSize: h ? 46 : 40, lineHeight: 1.45, color: MARKE.gedaempft }}>
          {ANZAHL_REGELN} Prüfregeln aus dem Wissen unserer Energie- und Abrechnungsexperten. Jede Zahl wird nachgerechnet.
        </p>
      </div>
      <Glaskarte neigung={2} style={{ width: h ? 880 : 760, padding: 48 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 28, color: MARKE.gedaempft, fontWeight: 600 }}>Prüfung läuft</span>
          <span style={{ fontSize: 56, fontWeight: 800, color: MARKE.gruen, fontVariantNumeric: "tabular-nums" }}>{Math.round(fortschritt * 100)} %</span>
        </div>
        <div style={{ height: 22, borderRadius: 11, background: "#EEF1EF", marginTop: 20, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${fortschritt * 100}%`, borderRadius: 11, background: MARKE.verlauf }} />
        </div>
        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 22 }}>
          {PRUEFUNGEN.map((p, i) => {
            const start = 30 + i * 18;
            const fertig = ein(f, start, 10);
            return (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 32, color: MARKE.dunkelgruen, opacity: 0.45 + fertig * 0.55 }}>
                <Haken groesse={40} fortschritt={fertig} />
                {p}
              </div>
            );
          })}
        </div>
      </Glaskarte>
    </AbsoluteFill>
  );
}

const BEFUNDE = ["Vorauszahlungen Heizkosten prüfen", "Hohe Warmwasserkosten", "Reparaturanteil Aufzugswartung", "Satellitenanlage nach 30.06.2024"];

function SzeneErgebnis({ h }: { h: boolean }) {
  const f = useCurrentFrame();
  const blende = useSzenenblende(SZENEN.ergebnis[1] - SZENEN.ergebnis[0]);
  const betrag = interpolate(f, [15, 70], [0, 1236.44], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const format = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(betrag);
  return (
    <AbsoluteFill
      style={{
        opacity: blende,
        padding: h ? "180px 80px" : "0 160px",
        flexDirection: h ? "column" : "row",
        alignItems: "center",
        justifyContent: h ? "center" : "space-between",
        gap: 80,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 36, maxWidth: h ? undefined : 640 }}>
        <Schritt nummer={3} titel="Ergebnis" groesse={h ? 64 : 56} />
        <p style={{ margin: 0, fontSize: h ? 46 : 40, lineHeight: 1.45, color: MARKE.gedaempft }}>
          Kostenlose Erstauswertung sofort. Ausführlicher Bericht mit Musterschreiben auf Wunsch.
        </p>
      </div>
      <div style={{ position: "relative", width: h ? 880 : 780 }}>
        <Glaskarte neigung={-2} style={{ padding: 48 }}>
          <div style={{ fontSize: 26, color: MARKE.gedaempft, fontWeight: 600 }}>Zu klären</div>
          <div style={{ fontSize: 96, fontWeight: 800, color: MARKE.dunkelgruen, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>{format}</div>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 18 }}>
            {BEFUNDE.map((b, i) => {
              const sichtbar = ein(f, 50 + i * 12, 12);
              return (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30, color: MARKE.dunkelgruen, opacity: sichtbar, transform: `translateX(${(1 - sichtbar) * 30}px)` }}>
                  <span style={{ background: "#FCEFD6", color: "#8A5A12", borderRadius: 999, padding: "6px 16px", fontSize: 22, fontWeight: 700 }}>Auffällig</span>
                  {b}
                </div>
              );
            })}
          </div>
        </Glaskarte>
        <div
          style={{
            position: "absolute",
            right: -30,
            top: -50,
            transform: "rotate(4deg)",
            background: "linear-gradient(135deg, #2E7BB8, #6FA8D6)",
            color: "white",
            borderRadius: 24,
            padding: "22px 30px",
            boxShadow: "0 24px 48px -20px rgba(46,123,184,0.55)",
            opacity: ein(f, 30),
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 800 }}>{ANZAHL_REGELN}</div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>Regeln geprüft</div>
        </div>
        <div style={{ marginTop: 28, fontSize: 22, color: MARKE.gedaempft, textAlign: "center" }}>Beispiel aus einer echten, anonymisierten Abrechnung</div>
      </div>
    </AbsoluteFill>
  );
}

function SzeneAufruf({ h }: { h: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blende = interpolate(f, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const knopf = spring({ frame: f - 24, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ opacity: blende, alignItems: "center", justifyContent: "center", gap: 56, padding: h ? "0 80px" : 0, textAlign: "center" }}>
      <Logo groesse={h ? 110 : 96} />
      <h2 style={{ margin: 0, fontSize: h ? 104 : 110, fontWeight: 800, letterSpacing: -2.5, color: MARKE.dunkelgruen, lineHeight: 1.05 }}>
        Jetzt <span style={{ color: MARKE.gruen }}>kostenlos</span> prüfen
      </h2>
      <div
        style={{
          transform: `scale(${knopf})`,
          background: MARKE.gruen,
          color: "white",
          fontSize: h ? 48 : 44,
          fontWeight: 600,
          padding: "30px 56px",
          borderRadius: 14,
          boxShadow: "0 24px 48px -18px rgba(31,163,126,0.65)",
        }}
      >
        Abrechnung hochladen →
      </div>
      <div style={{ fontSize: h ? 44 : 40, fontWeight: 600, color: MARKE.dunkelgruen, opacity: ein(f, 40) }}>biati.de</div>
    </AbsoluteFill>
  );
}

/** Kleines Logo oben links – in der Schlussszene ausgeblendet, dort steht es groß in der Mitte. */
function KopfLogo({ h }: { h: boolean }) {
  const f = useCurrentFrame();
  const sichtbar = interpolate(f, [SZENEN.aufruf[0] - 10, SZENEN.aufruf[0] + 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ padding: h ? "90px 80px" : "64px 160px", height: "fit-content", opacity: sichtbar }}>
      <Logo groesse={h ? 72 : 56} />
    </AbsoluteFill>
  );
}

export function Erklaervideo({ hochkant }: { hochkant: boolean }) {
  const h = hochkant;
  const dauer = (s: readonly [number, number]) => s[1] - s[0];
  return (
    <AbsoluteFill style={{ fontFamily: MARKE.schrift, color: MARKE.dunkelgruen }}>
      <Schrift />
      <Hintergrund />
      <KopfLogo h={h} />
      <Sequence from={SZENEN.frage[0]} durationInFrames={dauer(SZENEN.frage)}>
        <SzeneFrage h={h} />
      </Sequence>
      <Sequence from={SZENEN.hochladen[0]} durationInFrames={dauer(SZENEN.hochladen)}>
        <SzeneHochladen h={h} />
      </Sequence>
      <Sequence from={SZENEN.pruefen[0]} durationInFrames={dauer(SZENEN.pruefen)}>
        <SzenePruefen h={h} />
      </Sequence>
      <Sequence from={SZENEN.ergebnis[0]} durationInFrames={dauer(SZENEN.ergebnis)}>
        <SzeneErgebnis h={h} />
      </Sequence>
      <Sequence from={SZENEN.aufruf[0]} durationInFrames={dauer(SZENEN.aufruf)}>
        <SzeneAufruf h={h} />
      </Sequence>
    </AbsoluteFill>
  );
}
