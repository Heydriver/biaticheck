import { ThreeCanvas } from "@remotion/three";
import { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Audio,
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
import * as THREE from "three";
import { LOGO_PFAD, MARKE } from "./marke";

/**
 * Motion-Spot: Ein Handy erklärt BiatiCheck – vom Brief bis zur Lösung, Mehrwert
 * für den Kunden und Geschäftsmodell. Die Handy-Oberfläche ist komplett animiert
 * (keine Screenshots). Hintergrund: three.js. Stimme: ElevenLabs (public/spot/sN.mp3).
 * Schluss: Akrem auf Serbisch.
 */

/** Dauer der Aufnahmen für Szene 6 und 7 (nach dem Erzeugen eintragen). */
const S6_SEK = 17.9;
const S7_SEK = 11.4;

const FPS = 30;
const VORLAUF = 20;
const PAUSE = 16;
const AUSKLANG = 75;

const SZENEN = [
  { datei: "motiv/s1.mp3", sek: 9.64, text: "Eldin, Martin, stellt euch vor: Post vom Vermieter. Die Nebenkostenabrechnung. 1.214 Euro Nachzahlung. Und jetzt?" },
  { datei: "motiv/s2.mp3", sek: 8.28, text: "Viele Abrechnungen enthalten Fehler. Doch wer den Brief nicht versteht, zahlt einfach. Genau hier setzen wir an, mit BiatiCheck." },
  {
    datei: "motiv/s3.mp3",
    sek: 19.41,
    text: "Hier stelle ich euch BiatiCheck kurz vor. Der Kunde fotografiert seine Abrechnung oder lädt das PDF hoch. BiatiCheck liest jede Seite und prüft sie mit 21 festen Regeln. Nach ein bis zwei Minuten sieht er: das Fehlerpotenzial, seine Nachzahlung, seine Frist für den Einspruch, und den Vergleich mit seiner Postleitzahl.",
  },
  { datei: "motiv/s4.mp3", sek: 4.99, text: "Die gefundenen Fehler sieht er sofort, mit Betrag. Und zwar kostenlos." },
  {
    datei: "motiv/s5.mp3",
    sek: 19.72,
    text: "Und jetzt kommt unser Mehrwert. Mit dem Erledigen-Paket wird daraus eine Lösung: Der Kunde weiß genau, wie viel er wirklich zahlen muss. Er bekommt seine nächsten Schritte mit Datum, die Belegliste und ein fertiges Schreiben an die Hausverwaltung. Mit seinem Mietvertrag finden wir oft noch mehr Fehler. Und als Bonus: wie viel Steuern er sparen kann.",
  },
  {
    datei: "motiv/s6.mp3",
    sek: S6_SEK,
    text: "Und hier stelle ich euch unser Business-Modell vor. Prüfen ist kostenlos. Das Erledigen-Paket kostet 9,90 Euro, aber nur, wenn wir mindestens 30 Euro Ersparnis finden. Dazu kommen Partner wie Rechtsschutzversicherungen und Beratungsstellen, die BiatiCheck ihren Kunden anbieten. Fair für den Kunden, planbar für uns.",
  },
  {
    datei: "motiv/s7.mp3",
    sek: S7_SEK,
    text: "Und wenn die Hausverwaltung ablehnt? Dann greift unser Expertenteam: Unsere Fachprüfer kontrollieren jeden unsicheren Fall innerhalb von 24 Stunden, und unsere Partnerkanzlei für Mietrecht übernimmt mit fertiger Akte.",
  },
  { datei: "motiv/s8.mp3", sek: 7.0, text: "Das ist BiatiCheck. Nebenkosten verstehen. Und handeln. Die Lücke ist groß, und wir sind bereit." },
  { datei: "motiv/s9.mp3", sek: 2.51, text: "Hvala vam! Hajde da počnemo!" },
] as const;

const LAENGEN = SZENEN.map((s, i) => Math.ceil(s.sek * FPS) + (i === 7 ? 10 : PAUSE));
const STARTS = LAENGEN.reduce<number[]>((acc, _l, i) => [...acc, i === 0 ? VORLAUF : acc[i - 1]! + LAENGEN[i - 1]!], []);
export const SPOT_PARTNER_DAUER = STARTS[STARTS.length - 1]! + LAENGEN[LAENGEN.length - 1]! + AUSKLANG;

/** Frame in der Szene, an dem eine Textstelle gesprochen wird (über den Textanteil geschätzt). */
function bei(szene: number, stelle: string): number {
  const s = SZENEN[szene]!;
  const i = s.text.indexOf(stelle);
  if (i < 0) throw new Error(`Textstelle fehlt: ${stelle}`);
  return Math.round((i / s.text.length) * s.sek * FPS);
}

const klemm = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ein = (f: number, start: number, dauer = 12) => interpolate(f, [start, start + dauer], [0, 1], { ...klemm, easing: Easing.out(Easing.cubic) });
const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/** Welche Szene läuft gerade, und der Frame darin. */
function szeneBei(f: number): { i: number; lokal: number } {
  let i = 0;
  STARTS.forEach((s, k) => {
    if (f >= s) i = k;
  });
  return { i, lokal: f - STARTS[i]! };
}

// ---------- Schrift ----------

function Schrift() {
  const [handle] = useState(() => delayRender("Inter laden"));
  useEffect(() => {
    Promise.all(
      [400, 500, 600, 700, 800].map((w) =>
        new FontFace("Inter", `url(${staticFile(`inter-latin-${w}-normal.woff2`)}) format("woff2")`, { weight: String(w) })
          .load()
          .then((ff) => (document.fonts as unknown as { add: (x: FontFace) => void }).add(ff)),
      ),
    ).then(() => continueRender(handle));
  }, [handle]);
  return null;
}

// ---------- three.js: schwebende Münzen und Blätter ----------

function Schwebend() {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const muenze = useMemo(() => new THREE.CylinderGeometry(0.55, 0.55, 0.12, 48), []);
  const blatt = useMemo(() => new THREE.BoxGeometry(1.5, 2.1, 0.02), []);
  const dinge = useMemo(
    () =>
      Array.from({ length: 9 }, (_, k) => {
        const z = (n: number) => {
          const x = Math.sin(k * 12.9898 + n * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        return { art: k % 3 === 0 ? "blatt" : "muenze", x: (z(1) - 0.5) * 22, y: (z(2) - 0.5) * 12, zz: -8 - z(3) * 6, v: 0.004 + z(4) * 0.006, p: z(5) * 6.28 };
      }),
    [],
  );
  return (
    <AbsoluteFill style={{ opacity: 0.45, zIndex: 0 }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 12], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 6, 8]} intensity={1.4} />
        {dinge.map((d, k) => {
          const y = ((d.y + f * d.v * 6 + 8) % 16) - 8;
          return (
            <mesh key={k} geometry={d.art === "blatt" ? blatt : muenze} position={[d.x + Math.sin(f / 80 + d.p) * 0.6, y, d.zz]} rotation={[f * d.v + d.p, f * d.v * 1.3, d.p]}>
              {d.art === "blatt" ? (
                <meshStandardMaterial color="#ffffff" roughness={0.9} />
              ) : (
                <meshStandardMaterial color={k % 2 ? "#1FA37E" : "#D9A441"} metalness={0.6} roughness={0.3} />
              )}
            </mesh>
          );
        })}
      </ThreeCanvas>
    </AbsoluteFill>
  );
}

function Hintergrund() {
  const f = useCurrentFrame();
  const blob = (farbe: string, x: number, y: number, r: number, phase: number): React.CSSProperties => ({
    position: "absolute",
    left: x + Math.sin((f + phase) / 70) * 40,
    top: y + Math.cos((f + phase) / 80) * 30,
    width: r,
    height: r,
    borderRadius: "50%",
    background: farbe,
    filter: "blur(100px)",
    opacity: 0.6,
  });
  return (
    <AbsoluteFill style={{ background: MARKE.offWhite, overflow: "hidden" }}>
      <div style={blob("#cdeadf", -160, -160, 800, 0)} />
      <div style={blob("#d5e5f2", 1200, 500, 840, 200)} />
    </AbsoluteFill>
  );
}

// ---------- Handy (CSS-3D mit animierter Oberfläche) ----------

const BREITE = 390;
const HOEHE = 844;
/** Vergrößerung der Oberfläche, damit Schrift im Video gut lesbar ist. */
const ZOOM = 1.3;

/** Lage des Handys je Szene: [x-Mitte in px, Skalierung, Drehung Y in Grad, y-Versatz in px] */
const LAGEN: [number, number, number, number?][] = [
  [960, 0.86, 0, 56], // 1 Brief
  [1320, 0.98, -12], // 2 Problem
  [1340, 0.98, -14], // 3 So funktioniert es
  [1340, 0.98, -14], // 4 Fehler
  [1340, 0.98, -14], // 5 Erledigen-Paket
  [560, 0.9, 14], // 6 Geschäftsmodell
  [560, 0.9, 14], // 7 Experten
  [960, 0.7, 0, -70], // 8 Claim
  [960, 0.0, 0], // 9 Akrem
];

function Handy() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { i, lokal } = szeneBei(Math.max(f, STARTS[0]!));
  const vorher = LAGEN[Math.max(0, i - 1)]!;
  const jetzt = LAGEN[i]!;
  const t = i === 0 ? 1 : spring({ frame: lokal, fps, config: { damping: 20, mass: 0.9 } });
  const x = vorher[0] + (jetzt[0] - vorher[0]) * t;
  const s = vorher[1] + (jetzt[1] - vorher[1]) * t;
  const ry = vorher[2] + (jetzt[2] - vorher[2]) * t + Math.sin(f / 60) * 2;
  const dy = (vorher[3] ?? 0) + ((jetzt[3] ?? 0) - (vorher[3] ?? 0)) * t;
  const auftritt = spring({ frame: f - 4, fps, config: { damping: 16 } });
  const schwebe = Math.sin(f / 45) * 8;
  if (s * auftritt < 0.01) return null;
  return (
    <div style={{ position: "absolute", left: x - (BREITE + 28) / 2, top: 540 - (HOEHE + 28) / 2 + schwebe + dy, perspective: 2200, zIndex: 3 }}>
      <div
        style={{
          width: BREITE + 28,
          height: HOEHE + 28,
          borderRadius: 64,
          background: "linear-gradient(145deg, #2a3a33, #0d1411)",
          padding: 14,
          transform: `scale(${s * auftritt}) rotateY(${ry}deg) rotateX(${4 + Math.sin(f / 90) * 1.5}deg)`,
          boxShadow: "0 60px 120px -40px rgba(14,59,46,0.55), inset 0 0 0 2px rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ width: BREITE, height: HOEHE, borderRadius: 50, overflow: "hidden", background: MARKE.offWhite, position: "relative", fontFamily: MARKE.schrift }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: BREITE / ZOOM, height: HOEHE / ZOOM, transform: `scale(${ZOOM})`, transformOrigin: "0 0" }}>
            <Bildschirm />
          </div>
          <div style={{ position: "absolute", top: 12, left: "50%", width: 110, height: 30, marginLeft: -55, borderRadius: 16, background: "#0d1411" }} />
        </div>
      </div>
    </div>
  );
}

// ---------- Bausteine der Handy-Oberfläche ----------

function Kopf() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "44px 16px 8px", color: MARKE.gruen, fontWeight: 700, fontSize: 18 }}>
      <svg viewBox="0 0 150 166" width={22} height={24}>
        <path fill={MARKE.gruen} d={LOGO_PFAD} />
      </svg>
      BiatiCheck
    </div>
  );
}

const karte: React.CSSProperties = { background: "#fff", borderRadius: 18, border: "1px solid rgba(14,59,46,0.08)", padding: 14, margin: "0 10px 10px", boxShadow: "0 12px 30px -24px rgba(14,59,46,0.4)" };
const dunkel: React.CSSProperties = { ...karte, background: MARKE.dunkelgruen, color: "#e8f0ec", border: "none" };

function Rein({ f, start, children, von = 20 }: { f: number; start: number; children: React.ReactNode; von?: number }) {
  const a = ein(f, start, 10);
  return <div style={{ opacity: a, transform: `translateY(${(1 - a) * von}px)` }}>{children}</div>;
}

function Fakt({ titel, wert, klein, farbe }: { titel: string; wert: string; klein?: string; farbe?: string }) {
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid rgba(14,59,46,0.08)" }}>
      <div style={{ fontSize: 13, color: MARKE.gedaempft }}>{titel}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: farbe ?? MARKE.dunkelgruen }}>{wert}</div>
      {klein && <div style={{ fontSize: 11.5, color: MARKE.gedaempft }}>{klein}</div>}
    </div>
  );
}

function Knopf({ text, gedrueckt = 0 }: { text: string; gedrueckt?: number }) {
  return (
    <div style={{ background: MARKE.gruen, color: "#fff", borderRadius: 12, padding: "13px 18px", fontWeight: 700, fontSize: 15, textAlign: "center", transform: `scale(${1 - gedrueckt * 0.06})` }}>{text}</div>
  );
}

/** Kurzer Klick-Impuls (0 → 1 → 0) um einen Frame. */
const klick = (f: number, bei: number) => interpolate(f, [bei - 3, bei, bei + 5], [0, 1, 0], klemm);

// ---------- Bildschirme je Szene ----------

function Bildschirm() {
  const f = useCurrentFrame();
  const { i, lokal } = szeneBei(Math.max(f, STARTS[0]!));
  switch (i) {
    case 0:
      return <SperrBildschirm f={lokal} />;
    case 1:
      return <BriefBildschirm f={lokal} />;
    case 2:
      return <PruefBildschirm f={lokal} />;
    case 3:
      return <FehlerBildschirm f={lokal} />;
    case 4:
      return <PaketBildschirm f={lokal} />;
    case 5:
      return <AngebotBildschirm f={lokal} />;
    case 6:
      return <AntwortBildschirm f={lokal} />;
    default:
      return <LogoBildschirm />;
  }
}

function SperrBildschirm({ f }: { f: number }) {
  const n = spring({ frame: f - bei(0, "Post"), fps: FPS, config: { damping: 14 } });
  const frage = ein(f, bei(0, "Und jetzt"), 8);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #0E3B2E, #1a5c49 60%, #2E7BB8)", color: "#fff", alignItems: "center" }}>
      <div style={{ marginTop: 80, fontSize: 68, fontWeight: 300, letterSpacing: -2 }}>9:41</div>
      <div style={{ fontSize: 17, opacity: 0.85 }}>Montag, 1. Dezember</div>
      <div style={{ position: "absolute", top: 220, left: 10, right: 10, transform: `translateY(${(1 - n) * -120}px)`, opacity: n }}>
        <div style={{ background: "rgba(255,255,255,0.92)", color: MARKE.dunkelgruen, borderRadius: 20, padding: "14px 16px", boxShadow: "0 20px 40px -20px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 12, color: MARKE.gedaempft, display: "flex", justifyContent: "space-between" }}>
            <span>Hausverwaltung</span>
            <span>jetzt</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Ihre Nebenkostenabrechnung 2024</div>
          <div style={{ fontSize: 14, marginTop: 2 }}>
            Nachzahlung: <b style={{ color: "#9b2226" }}>1.214,88 €</b>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 360, fontSize: 130, fontWeight: 800, opacity: frage, transform: `scale(${0.6 + frage * 0.4})` }}>?</div>
    </AbsoluteFill>
  );
}

function BriefBildschirm({ f }: { f: number }) {
  const zeilen = [92, 70, 84, 60, 88, 76, 54, 80, 66, 90, 58];
  const mark = ein(f, 4, 14);
  return (
    <AbsoluteFill style={{ background: "#e9ece9", padding: "52px 12px" }}>
      <div style={{ background: "#fff", borderRadius: 6, padding: 16, height: 545, boxShadow: "0 10px 30px -20px rgba(0,0,0,0.4)" }}>
        <div style={{ fontSize: 11, color: "#777" }}>Muster Hausverwaltung GmbH</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#222", margin: "18px 0 14px" }}>Betriebs- und Heizkostenabrechnung 2024</div>
        {zeilen.map((w, k) => (
          <div key={k} style={{ height: 8, width: `${w}%`, background: "#dcdcdc", borderRadius: 4, marginBottom: 11 }} />
        ))}
        <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#222", position: "relative" }}>
          <span>Nachzahlung</span>
          <span>1.214,88 €</span>
          <div style={{ position: "absolute", inset: "-6px -8px", border: "3px solid #c0392b", borderRadius: 10, opacity: mark, transform: `scale(${1.15 - mark * 0.15})` }} />
        </div>
        <div style={{ marginTop: 40 }}>
          {[78, 64, 86].map((w, k) => (
            <div key={k} style={{ height: 8, width: `${w}%`, background: "#dcdcdc", borderRadius: 4, marginBottom: 11 }} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function PruefBildschirm({ f }: { f: number }) {
  const foto = bei(2, "Der Kunde fotografiert");
  const lesen = bei(2, "BiatiCheck liest");
  const ergebnis = bei(2, "Nach ein bis zwei");
  const blitz = interpolate(f, [foto + 22, foto + 25, foto + 34], [0, 1, 0], klemm);
  if (f < lesen) {
    return (
      <AbsoluteFill>
        <Kopf />
        <div style={karte}>
          <div style={{ fontSize: 21, fontWeight: 800, color: MARKE.dunkelgruen, lineHeight: 1.2 }}>Nebenkostenabrechnung kostenlos prüfen</div>
          <div style={{ border: `2px dashed ${MARKE.gruen}`, borderRadius: 14, padding: "26px 10px", marginTop: 14, textAlign: "center", background: f > foto + 28 ? MARKE.mint : "transparent" }}>
            <div style={{ fontWeight: 700, color: MARKE.dunkelgruen }}>{f > foto + 28 ? "Abrechnung_2024.pdf" : "PDF oder Fotos auswählen"}</div>
            <div style={{ fontSize: 12, color: MARKE.gedaempft }}>{f > foto + 28 ? "12 Seiten" : "oder Foto aufnehmen"}</div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Knopf text="Abrechnung prüfen" gedrueckt={klick(f, lesen - 6)} />
          </div>
        </div>
        <AbsoluteFill style={{ background: "#fff", opacity: blitz }} />
      </AbsoluteFill>
    );
  }
  if (f < ergebnis) {
    const t = interpolate(f, [lesen, ergebnis - 4], [0, 1], klemm);
    const regel = Math.max(1, Math.round(t * 21));
    const seite = Math.max(1, Math.round(Math.min(1, t * 1.6) * 12));
    const regeln = ["Abrechnungsfrist", "Einwendungsfrist", "Umlagefähige Kosten", "Verteilerschlüssel", "Vorauszahlungen", "Heizkosten nach Verbrauch", "Kabelfernsehen", "Warmwasser"];
    return (
      <AbsoluteFill>
        <Kopf />
        <div style={karte}>
          <div style={{ fontSize: 19, fontWeight: 800, color: MARKE.dunkelgruen }}>Wir lesen Ihre Abrechnung</div>
          <div style={{ fontSize: 13, color: MARKE.gedaempft, marginTop: 4 }}>Seite {seite} von 12 · Regel {regel} von 21</div>
          <div style={{ height: 8, background: "#e9ece9", borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${t * 100}%`, height: "100%", background: MARKE.verlauf }} />
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {regeln.map((r, k) => {
              const fertig = t > (k + 1) / (regeln.length + 1);
              return (
                <div key={r} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: fertig ? MARKE.dunkelgruen : MARKE.gedaempft }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, background: fertig ? MARKE.gruen : "#e2e6e3", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>{fertig ? "✓" : ""}</span>
                  {r}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  const g = (stelle: string) => bei(2, stelle);
  const balken = ein(f, g("Postleitzahl"), 20);
  return (
    <AbsoluteFill>
      <Kopf />
      <div style={karte}>
        <div style={{ fontSize: 12, color: MARKE.gedaempft }}>Ihre Abrechnung 2024</div>
        <Rein f={f} start={ergebnis}>
          <div style={{ fontSize: 22, fontWeight: 800, color: MARKE.dunkelgruen, lineHeight: 1.2, margin: "6px 0 10px" }}>Bis zu 1.236,44 € könnten falsch abgerechnet sein.</div>
        </Rein>
        <Rein f={f} start={g("das Fehlerpotenzial")}>
          <Fakt titel="Fehlerpotenzial" wert="hoch" farbe={MARKE.bernstein} />
        </Rein>
        <Rein f={f} start={g("seine Nachzahlung")}>
          <Fakt titel="Ihre Nachzahlung" wert="1.214,88 €" />
        </Rein>
        <Rein f={f} start={g("seine Frist")}>
          <Fakt titel="Einspruch möglich" wert="bis 28.11.2026" klein="noch 362 Tage" farbe={MARKE.bernstein} />
        </Rein>
        <Rein f={f} start={g("Postleitzahl")}>
          <div style={{ padding: "10px 0", borderTop: "1px solid rgba(14,59,46,0.08)" }}>
            <div style={{ fontSize: 13, color: MARKE.gedaempft }}>Vergleich für PLZ 80937</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: MARKE.dunkelgruen }}>45 % über Durchschnitt</div>
            <div style={{ position: "relative", height: 10, background: "#e9ece9", borderRadius: 5, marginTop: 8 }}>
              <div style={{ width: `${balken * 82}%`, height: "100%", borderRadius: 5, background: MARKE.verlauf }} />
              <div style={{ position: "absolute", left: "57%", top: -4, width: 2, height: 18, background: MARKE.dunkelgruen }} />
            </div>
          </div>
        </Rein>
      </div>
    </AbsoluteFill>
  );
}

const FEHLER: [string, string, number?][] = [
  ["Vorauszahlungen zu niedrig angerechnet", "1.176,41 € statt 2.399,28 €", 1222.87],
  ["Kabelfernsehen: Satellitenanlage", "Erlaubt nur bis Juni 2024", 13.57],
  ["Unterschiedliche Flächen", "Verschiedene Größen angesetzt"],
  ["Reparaturen in Aufzugskosten?", "Dürfen nicht umgelegt werden"],
  ["Warmwasser sehr teuer", "31,14 € je m³, üblich bis 20 €"],
];

function FehlerBildschirm({ f }: { f: number }) {
  const kostenlos = spring({ frame: f - bei(3, "kostenlos"), fps: FPS, config: { damping: 10 } });
  return (
    <AbsoluteFill>
      <Kopf />
      <div style={karte}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: MARKE.dunkelgruen }}>Das haben wir gefunden</div>
          <span style={{ background: MARKE.gruen, color: "#fff", fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "4px 10px", transform: `scale(${kostenlos})` }}>kostenlos</span>
        </div>
        {FEHLER.map(([t, s, b], k) => (
          <Rein key={t} f={f} start={4 + k * 9} von={-14}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "11px 0", borderTop: k ? "1px solid rgba(14,59,46,0.08)" : "none" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: MARKE.dunkelgruen }}>{t}</div>
                <div style={{ fontSize: 12.5, color: MARKE.gedaempft }}>{s}</div>
              </div>
              {b !== undefined && <div style={{ fontWeight: 800, fontSize: 14.5, color: MARKE.dunkelgruen, whiteSpace: "nowrap" }}>{euro(b)}</div>}
            </div>
          </Rein>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function PaketBildschirm({ f }: { f: number }) {
  const g = (s: string) => bei(4, s);
  const brief = g("und ein fertiges Schreiben");
  const mv = g("Mit seinem Mietvertrag");
  const steuer = g("Und als Bonus");
  const BRIEF = "Muster Hausverwaltung GmbH\nHauptstraße 5, 80331 München\n\nSehr geehrte Damen und Herren,\n\nzu Ihrer Abrechnung 2024 bitte ich um Erläuterung und Einsicht in die Belege …\n\nMit freundlichen Grüßen\nAyşe Yılmaz";
  if (f < brief) {
    const schritte: [string, string, string?][] = [
      ["1", "Höchstens 1.018,04 € zahlen", undefined],
      ["2", "Schreiben senden", "bis 28.11.2026"],
      ["3", "Belege einsehen", "5 Unterlagen"],
      ["4", "Antwort abwarten", "14 Tage"],
    ];
    const strich = ein(f, g("Der Kunde weiß genau") + 18, 14);
    return (
      <AbsoluteFill>
        <Kopf />
        <div style={dunkel}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Ihr Ergebnis</div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginTop: 4 }}>
            Sie zahlen höchstens 1.018,04 € statt{" "}
            <span style={{ position: "relative" }}>
              1.214,88 €
              <span style={{ position: "absolute", left: 0, top: "52%", height: 3, width: `${strich * 100}%`, background: "#f2c66d" }} />
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, margin: "16px 0 8px" }}>Ihre nächsten Schritte</div>
          {schritte.map(([n, t, d], k) => (
            <Rein key={n} f={f} start={g("seine nächsten Schritte") + k * 8}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0" }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, background: MARKE.gruen, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>{n}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t}</span>
                {d && <span style={{ fontSize: 13, color: "#f2c66d", marginLeft: "auto", fontWeight: 700 }}>{d}</span>}
              </div>
            </Rein>
          ))}
        </div>
      </AbsoluteFill>
    );
  }
  if (f < mv) {
    const zeichen = Math.round(interpolate(f, [brief + 4, mv - 20], [0, BRIEF.length], klemm));
    const senden = klick(f, mv - 10);
    const flug = ein(f, mv - 8, 10);
    return (
      <AbsoluteFill>
        <Kopf />
        <div style={{ ...karte, transform: `translateY(${flug * -40}px)`, opacity: 1 - flug * 0.6 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: MARKE.dunkelgruen }}>Ihr Schreiben</div>
          <div style={{ fontSize: 12, color: MARKE.gedaempft, margin: "2px 0 10px" }}>An: service@muster-hv.de</div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.5, color: MARKE.dunkelgruen, minHeight: 300, background: MARKE.offWhite, borderRadius: 10, padding: 12 }}>
            {BRIEF.slice(0, zeichen)}
            <span style={{ opacity: f % 20 < 10 ? 1 : 0 }}>|</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Knopf text="E-Mail an die Hausverwaltung" gedrueckt={senden} />
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  const plus = spring({ frame: f - mv - 6, fps: FPS, config: { damping: 12 } });
  const st = spring({ frame: f - steuer - 6, fps: FPS, config: { damping: 12 } });
  return (
    <AbsoluteFill>
      <Kopf />
      <div style={{ ...karte, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: MARKE.gedaempft }}>Mietvertrag geprüft</div>
        <div style={{ fontSize: 40, fontWeight: 800, color: MARKE.gruen, transform: `scale(${plus})` }}>+2 Fehler</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: MARKE.dunkelgruen }}>196,84 € mehr, die Sie nicht zahlen</div>
      </div>
      <div style={{ ...dunkel, textAlign: "center", opacity: st, transform: `translateY(${(1 - st) * 30}px)` }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Bonus: Steuern sparen</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: "#f2c66d" }}>bis zu 131,19 €</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>haushaltsnahe Dienstleistungen aus Ihrer Abrechnung</div>
      </div>
    </AbsoluteFill>
  );
}

function AngebotBildschirm({ f }: { f: number }) {
  const druck = klick(f, bei(5, "kostet 9,90") + 10);
  return (
    <AbsoluteFill>
      <Kopf />
      <div style={dunkel}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Erledigen-Paket</div>
        <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 10px" }}>Wir erledigen den Rest für Sie</div>
        {["Genauer Betrag", "Schritte mit Terminen", "Fertiges Schreiben", "Mietvertrag-Check", "Erinnerung nach 14 Tagen"].map((t) => (
          <div key={t} style={{ fontSize: 14, padding: "4px 0" }}>· {t}</div>
        ))}
        <div style={{ marginTop: 14 }}>
          <Knopf text="Für 9,90 € erledigen" gedrueckt={druck} />
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>Sie zahlen nur, weil wir mindestens 30 € Ersparnis gefunden haben.</div>
      </div>
    </AbsoluteFill>
  );
}

function AntwortBildschirm({ f }: { f: number }) {
  const weiter = ein(f, bei(6, "Unsere Fachprüfer"), 12);
  return (
    <AbsoluteFill>
      <Kopf />
      <div style={karte}>
        <div style={{ fontSize: 12, color: MARKE.gedaempft }}>Antwort der Hausverwaltung</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#9b2226", margin: "6px 0" }}>Ihr Einwand wird abgelehnt.</div>
        {[90, 74, 82].map((w, k) => (
          <div key={k} style={{ height: 7, width: `${w}%`, background: "#e2e6e3", borderRadius: 4, marginTop: 9 }} />
        ))}
      </div>
      <div style={{ ...dunkel, opacity: weiter, transform: `translateY(${(1 - weiter) * 24}px)` }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Wir übernehmen</div>
        <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 6 }}>Fachprüfer innerhalb von 24 Stunden, danach unsere Partnerkanzlei für Mietrecht.</div>
      </div>
    </AbsoluteFill>
  );
}

function LogoBildschirm() {
  return (
    <AbsoluteFill style={{ background: MARKE.dunkelgruen, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <svg viewBox="0 0 150 166" width={110} height={122}>
        <path fill={MARKE.gruen} d={LOGO_PFAD} />
      </svg>
      <div style={{ fontSize: 34, fontWeight: 800, color: "#fff" }}>BiatiCheck</div>
    </AbsoluteFill>
  );
}

// ---------- Texte neben dem Handy ----------

function Seite({ links = true, children }: { links?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", zIndex: 2, top: 0, bottom: 0, width: 840, left: links ? 140 : 1000, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>{children}</div>
  );
}

function Titel({ f, start, children, groesse = 72, farbe = MARKE.dunkelgruen }: { f: number; start: number; children: React.ReactNode; groesse?: number; farbe?: string }) {
  const a = ein(f, start, 14);
  return <div style={{ opacity: a, transform: `translateY(${(1 - a) * 26}px)`, fontSize: groesse, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.08, color: farbe }}>{children}</div>;
}

function Etikett({ f, children }: { f: number; children: React.ReactNode }) {
  return <div style={{ opacity: ein(f, 0), fontSize: 22, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: MARKE.gruen }}>{children}</div>;
}

function Liste({ f, punkte }: { f: number; punkte: [string, number][] }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {punkte.map(([t, start]) => {
        const a = ein(f, start, 12);
        return (
          <div key={t} style={{ display: "flex", gap: 16, alignItems: "baseline", opacity: a, transform: `translateX(${(1 - a) * -26}px)` }}>
            <span style={{ flex: "0 0 12px", height: 12, borderRadius: 6, background: MARKE.gruen, transform: "translateY(-5px)" }} />
            <span style={{ fontSize: 34, fontWeight: 600, color: MARKE.dunkelgruen, lineHeight: 1.25 }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

function T1() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 60 }}>
      <Titel f={f} start={0} groesse={44}>
        Eldin, Martin, <span style={{ color: MARKE.gruen }}>stellt euch vor …</span>
      </Titel>
    </AbsoluteFill>
  );
}

function T2() {
  const f = useCurrentFrame();
  return (
    <Seite>
      <Titel f={f} start={0}>Viele Abrechnungen enthalten Fehler.</Titel>
      <Titel f={f} start={bei(1, "Doch wer")} groesse={46} farbe={MARKE.gedaempft}>
        Wer den Brief nicht versteht, zahlt einfach.
      </Titel>
      <Titel f={f} start={bei(1, "Genau hier")} groesse={64} farbe={MARKE.gruen}>
        Genau hier setzen wir an: BiatiCheck.
      </Titel>
    </Seite>
  );
}

function T3() {
  const f = useCurrentFrame();
  return (
    <Seite>
      <Etikett f={f}>BiatiCheck kurz vorgestellt</Etikett>
      <Titel f={f} start={0} groesse={64}>
        Vom Foto zum Ergebnis in Minuten
      </Titel>
      <Liste
        f={f}
        punkte={[
          ["Foto oder PDF hochladen", bei(2, "Der Kunde fotografiert")],
          ["21 feste Regeln von Nebenkosten-Experten", bei(2, "prüft sie")],
          ["Fehlerpotenzial und Nachzahlung", bei(2, "das Fehlerpotenzial")],
          ["Frist für den Einspruch", bei(2, "seine Frist")],
          ["Vergleich mit seiner Postleitzahl", bei(2, "Postleitzahl")],
        ]}
      />
    </Seite>
  );
}

function T4() {
  const f = useCurrentFrame();
  return (
    <Seite>
      <Etikett f={f}>Kostenlos</Etikett>
      <Titel f={f} start={0} groesse={68}>
        Alle Fehler sofort sichtbar, mit Betrag.
      </Titel>
    </Seite>
  );
}

function T5() {
  const f = useCurrentFrame();
  const g = (s: string) => bei(4, s);
  return (
    <Seite>
      <Etikett f={f}>Mehrwert für den Kunden</Etikett>
      <Titel f={f} start={0} groesse={64}>
        Aus dem Ergebnis wird eine Lösung
      </Titel>
      <Liste
        f={f}
        punkte={[
          ["Weiß genau, was er wirklich zahlen muss", g("Der Kunde weiß genau")],
          ["Nächste Schritte mit Datum", g("seine nächsten Schritte")],
          ["Fertiges Schreiben mit seinen Daten", g("und ein fertiges Schreiben")],
          ["Mietvertrag-Check findet mehr Fehler", g("Mit seinem Mietvertrag")],
          ["Bonus: Steuern sparen", g("Und als Bonus")],
        ]}
      />
    </Seite>
  );
}

function T6() {
  const f = useCurrentFrame();
  const g = (s: string) => bei(5, s);
  const stufe = (titel: string, wert: string, text: string, start: number, betont = false) => {
    const a = ein(f, start, 14);
    return (
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, background: betont ? MARKE.dunkelgruen : "#fff", color: betont ? "#e8f0ec" : MARKE.dunkelgruen, borderRadius: 26, padding: "26px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, boxShadow: "0 30px 60px -40px rgba(14,59,46,0.4)" }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{titel}</div>
          <div style={{ fontSize: 24, opacity: 0.8, marginTop: 4 }}>{text}</div>
        </div>
        <div style={{ fontSize: 44, fontWeight: 800, color: MARKE.gruen, whiteSpace: "nowrap" }}>{wert}</div>
      </div>
    );
  };
  return (
    <Seite links={false}>
      <Etikett f={f}>Unser Business-Modell</Etikett>
      <Titel f={f} start={0} groesse={60}>
        Fair für Kunden, planbar für uns
      </Titel>
      <div style={{ display: "grid", gap: 18 }}>
        {stufe("Prüfen und Fehler sehen", "0 €", "für jeden Kunden", g("Prüfen ist kostenlos"))}
        {stufe("Erledigen-Paket", "9,90 €", "nur ab 30 € Ersparnis", g("Das Erledigen-Paket"), true)}
        {stufe("Partner-Lizenzen", "B2B", "Rechtsschutzversicherungen, Beratungsstellen", g("Dazu kommen Partner"))}
      </div>
    </Seite>
  );
}

function T7() {
  const f = useCurrentFrame();
  const g = (s: string) => bei(6, s);
  const knoten: [string, string, number][] = [
    ["Tool", "prüft automatisch", 0],
    ["Fachprüfer", "innerhalb von 24 Stunden", g("Unsere Fachprüfer")],
    ["Partnerkanzlei", "Mietrecht, mit fertiger Akte", g("und unsere Partnerkanzlei")],
  ];
  const punkt = interpolate(f, [g("Unsere Fachprüfer"), g("und unsere Partnerkanzlei") + 20], [0, 1], klemm);
  return (
    <Seite links={false}>
      <Etikett f={f}>Unser Expertenteam</Etikett>
      <Titel f={f} start={0} groesse={60}>
        Wenn die Hausverwaltung ablehnt
      </Titel>
      <div style={{ position: "relative", display: "grid", gap: 22, paddingLeft: 40 }}>
        <div style={{ position: "absolute", left: 14, top: 30, bottom: 30, width: 4, background: "#dfe7e3", borderRadius: 2 }}>
          <div style={{ width: "100%", height: `${punkt * 100}%`, background: MARKE.gruen, borderRadius: 2 }} />
        </div>
        {knoten.map(([t, s, start], k) => {
          const a = ein(f, start, 14);
          return (
            <div key={t} style={{ opacity: a, transform: `translateX(${(1 - a) * 30}px)`, background: k === 2 ? MARKE.dunkelgruen : "#fff", color: k === 2 ? "#e8f0ec" : MARKE.dunkelgruen, borderRadius: 24, padding: "22px 28px", boxShadow: "0 30px 60px -40px rgba(14,59,46,0.4)" }}>
              <div style={{ fontSize: 34, fontWeight: 800 }}>
                {k + 1}. {t}
              </div>
              <div style={{ fontSize: 24, opacity: 0.8 }}>{s}</div>
            </div>
          );
        })}
      </div>
    </Seite>
  );
}

function T8() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 56 }}>
      <Titel f={f} start={bei(7, "Nebenkosten")} groesse={58}>
        Nebenkosten verstehen. <span style={{ color: MARKE.gruen }}>Und handeln.</span>
      </Titel>
      <div style={{ height: 10 }} />
      <Titel f={f} start={bei(7, "Die Lücke")} groesse={40} farbe={MARKE.gedaempft}>
        Die Lücke ist groß. Wir sind bereit.
      </Titel>
    </AbsoluteFill>
  );
}

function T9() {
  const f = useCurrentFrame();
  const a = spring({ frame: f, fps: FPS, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: MARKE.dunkelgruen, alignItems: "center", justifyContent: "center", opacity: ein(f, -6, 8) }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, transform: `scale(${0.9 + a * 0.1})` }}>
        <svg viewBox="0 0 150 166" width={96} height={106}>
          <path fill={MARKE.gruen} d={LOGO_PFAD} />
        </svg>
        <div style={{ fontSize: 96, fontWeight: 800, color: "#fff", letterSpacing: -2 }}>Hvala vam!</div>
        <div style={{ fontSize: 72, fontWeight: 800, color: MARKE.gruen, opacity: ein(f, bei(8, "Hajde"), 10) }}>Hajde da počnemo!</div>
        <div style={{ fontSize: 28, color: "#cdeadf", marginTop: 14, opacity: ein(f, 30, 14) }}>Akrem · Biati Solutions</div>
      </div>
    </AbsoluteFill>
  );
}

// ---------- Musik und Geräusche ----------

/** Musik leiser, solange gesprochen wird (Ducking), lauter in Pausen und am Ende. */
function musikLautstaerke(f: number): number {
  const spricht = SZENEN.some((s, i) => f >= STARTS[i]! - 6 && f <= STARTS[i]! + s.sek * FPS + 6);
  const ende = interpolate(f, [SPOT_PARTNER_DAUER - 60, SPOT_PARTNER_DAUER], [1, 0], klemm);
  return (spricht ? 0.13 : 0.32) * ende;
}

const G = (szene: number, stelle: string, plus = 0) => STARTS[szene]! + bei(szene, stelle) + plus;
const GERAEUSCHE: [string, number, number][] = [
  ["ping", G(0, "Post"), 0.6],
  ...STARTS.slice(1).map((s): [string, number, number] => ["whoosh", s - 8, 0.35]),
  ["pop", G(2, "BiatiCheck liest", -6), 0.5],
  ["kamera", G(2, "Der Kunde fotografiert", 22), 0.6],
  ["erfolg", G(2, "Nach ein bis zwei"), 0.45],
  ...[0, 1, 2, 3, 4].map((k): [string, number, number] => ["pop", STARTS[3]! + 4 + k * 9, 0.4]),
  ["erfolg", G(3, "kostenlos"), 0.5],
  ...[0, 1, 2, 3].map((k): [string, number, number] => ["pop", G(4, "seine nächsten Schritte") + k * 8, 0.35]),
  ["tippen", G(4, "und ein fertiges Schreiben", 4), 0.45],
  ["tippen", G(4, "und ein fertiges Schreiben", 64), 0.45],
  ["senden", G(4, "Mit seinem Mietvertrag", -10), 0.5],
  ["erfolg", G(4, "Mit seinem Mietvertrag", 6), 0.55],
  ["erfolg", G(4, "Und als Bonus", 6), 0.55],
  ["pop", G(5, "Prüfen ist kostenlos"), 0.4],
  ["pop", G(5, "Das Erledigen-Paket"), 0.4],
  ["pop", G(5, "kostet 9,90", 10), 0.5],
  ["pop", G(5, "Dazu kommen Partner"), 0.4],
  ["ping", G(6, "Und wenn"), 0.4],
  ["pop", G(6, "Unsere Fachprüfer"), 0.4],
  ["pop", G(6, "und unsere Partnerkanzlei"), 0.4],
  ["erfolg", G(7, "Nebenkosten"), 0.5],
  ["erfolg", STARTS[8]!, 0.6],
];

// ---------- Untertitel ----------

function Untertitel() {
  const f = useCurrentFrame();
  const { i, lokal } = szeneBei(f);
  if (f < STARTS[0]! || i >= 7) return null;
  const s = SZENEN[i]!;
  const dauer = s.sek * FPS;
  if (lokal > dauer + 6) return null;
  const saetze = s.text.match(/[\s\S]*?[.?!:](?=\s|$)/g) ?? [s.text];
  let pos = 0;
  for (const satz of saetze) {
    const von = (pos / s.text.length) * dauer;
    pos += satz.length;
    const bis = (pos / s.text.length) * dauer;
    if (lokal >= von && lokal < bis + 6) {
      return (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 34 }}>
          <div style={{ maxWidth: 1400, background: "rgba(14,59,46,0.82)", color: "#fff", fontSize: 28, fontWeight: 500, padding: "10px 24px", borderRadius: 12, textAlign: "center" }}>{satz.trim()}</div>
        </AbsoluteFill>
      );
    }
  }
  return null;
}

export function SpotPartner() {
  const texte = [T1, T2, T3, T4, T5, T6, T7, T8, T9];
  return (
    <AbsoluteFill style={{ fontFamily: MARKE.schrift }}>
      <Schrift />
      <Hintergrund />
      <Schwebend />
      <AbsoluteFill style={{ zIndex: 2, willChange: "transform", transform: "translateZ(0)" }}>
        {texte.map((T, i) => (
          <Sequence key={i} from={STARTS[i]!} durationInFrames={LAENGEN[i]! + (i === texte.length - 1 ? AUSKLANG : 0)}>
            <T />
          </Sequence>
        ))}
        <Handy />
      </AbsoluteFill>
      {SZENEN.map((s, i) => (
        <Sequence key={s.datei} from={STARTS[i]!}>
          <Audio src={staticFile(s.datei)} />
        </Sequence>
      ))}
      <Audio src={staticFile("motiv/musik.mp3")} volume={musikLautstaerke} />
      {GERAEUSCHE.map(([datei, frame, laut], k) => (
        <Sequence key={k} from={Math.max(0, frame)} durationInFrames={90}>
          <Audio src={staticFile(`motiv/sfx/${datei}.mp3`)} volume={laut} />
        </Sequence>
      ))}
      <AbsoluteFill style={{ zIndex: 4, willChange: "transform", transform: "translateZ(0)" }}>
        <Untertitel />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
