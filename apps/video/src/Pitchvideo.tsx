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
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { LOGO_PFAD, MARKE } from "./marke";

/**
 * Internes Pitch-Video: Akrem erklärt Eldin und Martin BiatiCheck,
 * das Preismodell, die Zahlen, das Expertenteam und die Partner.
 * Stimme: ElevenLabs (public/pitch/szeneN.mp3), Handy: three.js mit echten Bildschirmen der Test-Seite.
 */

const FPS = 30;
const VORLAUF = 15;
const PAUSE = 24;
const ABSPANN = 120;

const SZENEN = [
  {
    datei: "pitch/szene1.mp3",
    sekunden: 10.4,
    text: "Hallo Eldin, hallo Martin. Ich bin's, Akrem. Ich möchte euch in drei Minuten zeigen, was BiatiCheck heute schon kann, wie wir damit Geld verdienen, und warum wir jetzt schnell sein müssen.",
  },
  {
    datei: "pitch/szene2.mp3",
    sekunden: 17.58,
    text: "Jedes Jahr bekommen Millionen Mieter in Deutschland eine Nebenkostenabrechnung, und viele davon enthalten Fehler. Wer Deutsch nicht als Muttersprache spricht, versteht den Brief oft nicht und zahlt einfach. Mietervereine und Anwälte sind für diese Menschen kaum erreichbar. Genau diese Lücke schließen wir.",
  },
  {
    datei: "pitch/szene3.mp3",
    sekunden: 42.34,
    text: "So funktioniert es. Der Kunde fotografiert seine Abrechnung, oder er lädt das PDF hoch. Unser Tool liest jede Seite aus und prüft sie mit 21 festen Regeln. Nach ein bis zwei Minuten sieht er auf einen Blick: Wie hoch ist das Fehlerpotenzial? Wie hoch ist die Nachzahlung? Bis wann kann er widersprechen? Und wie liegen seine Kosten im Vergleich zu seiner Postleitzahl? Danach bekommt er seine nächsten Schritte, mit Datum: wie viel er wirklich zahlen muss, welche Belege er anfordern soll, und ein fertiges Schreiben an die Hausverwaltung, mit seinem Namen, seiner Adresse und der richtigen E-Mail-Adresse. Wer möchte, lädt zusätzlich seinen Mietvertrag hoch. Dann finden wir oft noch weitere Fehler.",
  },
  {
    datei: "pitch/szene4.mp3",
    sekunden: 15.28,
    text: "Unser Modell ist einfach: Prüfen ist kostenlos. Nur wenn wir mindestens 30 Euro Ersparnis finden, kostet das Erledigen-Paket 9,90 Euro. Der Kunde zahlt also nur, wenn es sich für ihn lohnt. Das schafft Vertrauen, gerade bei unserer Zielgruppe.",
  },
  {
    datei: "pitch/szene5.mp3",
    sekunden: 33.8,
    text: "Jetzt die Zahlen. Und Eldin, ich weiß, dass du genau hinschaust: Das sind Annahmen. Wir rechnen so: Jede zweite Abrechnung bringt mindestens 30 Euro Ersparnis. Vier von zehn dieser Kunden kaufen das Paket, und fünf Prozent buchen zusätzlich unser Experten-Paket für 39 Euro. Bei hundert Kunden sind das rund 400 Euro Umsatz, und unsere Kunden sparen zusammen etwa 7.500 Euro. Bei zehntausend Kunden sind es rund 39.000 Euro Umsatz, plus Lizenzen von Partnern. Und unsere Kunden sparen zusammen rund 750.000 Euro.",
  },
  {
    datei: "pitch/szene6.mp3",
    sekunden: 19.83,
    text: "Unser Expertenteam arbeitet in drei Stufen. Erstens prüft das Tool automatisch. Zweitens kontrollieren unsere Fachprüfer innerhalb von 24 Stunden alles, was die Software nicht sicher lesen konnte. Drittens: Wenn die Hausverwaltung ablehnt, übergeben wir den Fall mit fertiger Akte an unsere Partnerkanzlei für Mietrecht.",
  },
  {
    datei: "pitch/szene7.mp3",
    sekunden: 23.07,
    text: "Dafür brauchen wir drei Partner: eine Kanzlei für Mietrecht, die die Rechtsberatung übernimmt. Eine Rechtsschutzversicherung, die BiatiCheck ihren Kunden anbietet. Und Migrationsberatungen und Integrationskurse, die uns den Weg zu unserer Zielgruppe öffnen. Mein Vorschlag: In vier Wochen testen wir mit zwanzig echten Nutzern. Dann entscheiden wir gemeinsam, mit echten Zahlen. Lasst uns loslegen.",
  },
] as const;

const LAENGEN = SZENEN.map((s) => Math.ceil(s.sekunden * FPS) + PAUSE);
const STARTS = LAENGEN.reduce<number[]>((acc, l, i) => [...acc, i === 0 ? VORLAUF : acc[i - 1]! + LAENGEN[i - 1]!], []);
export const PITCH_DAUER = STARTS[STARTS.length - 1]! + LAENGEN[LAENGEN.length - 1]! + ABSPANN;

/** Zeitpunkt (Frame in der Szene), an dem eine Textstelle gesprochen wird – geschätzt über den Textanteil. */
function bei(szene: number, stelle: string): number {
  const s = SZENEN[szene]!;
  const i = s.text.indexOf(stelle);
  if (i < 0) throw new Error(`Textstelle fehlt: ${stelle}`);
  return Math.round((i / s.text.length) * s.sekunden * FPS);
}
const global = (szene: number, stelle: string) => STARTS[szene]! + bei(szene, stelle);

const ein = (f: number, start: number, dauer = 14) =>
  interpolate(f, [start, start + dauer], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

// ---------- Schrift ----------

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

// ---------- Hintergrund ----------

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
    filter: "blur(90px)",
    opacity: 0.55,
  });
  return (
    <AbsoluteFill style={{ background: MARKE.offWhite, overflow: "hidden" }}>
      <div style={blob("#cdeadf", -120, -160, 760, 0)} />
      <div style={blob("#d5e5f2", 1180, 520, 820, 200)} />
      <div style={blob("#e8f5f0", 700, -200, 560, 400)} />
    </AbsoluteFill>
  );
}

// ---------- Handy (three.js) ----------

const BILDER = [
  "1-start",
  "2-ausgewaehlt",
  "3-lesen",
  "4-ergebnis",
  "5-fehler",
  "6-angebot",
  "7-schritte",
  "8-schritte2",
  "9-schreiben",
  "10-brief",
  "11-mietvertrag",
] as const;
type Bild = (typeof BILDER)[number];

/** Welcher Bildschirm wann zu sehen ist (globale Frames). */
const ABLAUF: [number, Bild][] = [
  [0, "1-start"],
  [global(2, "Der Kunde fotografiert"), "2-ausgewaehlt"],
  [global(2, "Unser Tool liest"), "3-lesen"],
  [global(2, "Nach ein bis zwei Minuten"), "4-ergebnis"],
  [global(2, "Danach bekommt er"), "7-schritte"],
  [global(2, "welche Belege"), "8-schritte2"],
  [global(2, "und ein fertiges Schreiben"), "9-schreiben"],
  [global(2, "mit seinem Namen"), "10-brief"],
  [global(2, "Wer möchte"), "11-mietvertrag"],
  [STARTS[3]!, "5-fehler"],
  [global(3, "Nur wenn wir"), "6-angebot"],
  [STARTS[6]!, "4-ergebnis"],
];

function useTexturen() {
  const [texturen, setTexturen] = useState<Record<string, THREE.Texture> | null>(null);
  const [handle] = useState(() => delayRender("Handy-Bildschirme laden"));
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    Promise.all(
      BILDER.map(
        (b) =>
          new Promise<[string, THREE.Texture]>((ok, fehler) =>
            loader.load(
              staticFile(`pitch/screens/${b}.png`),
              (t) => {
                t.colorSpace = THREE.SRGBColorSpace;
                t.anisotropy = 8;
                ok([b, t]);
              },
              undefined,
              fehler,
            ),
          ),
      ),
    ).then((liste) => {
      setTexturen(Object.fromEntries(liste));
      continueRender(handle);
    });
  }, [handle]);
  return texturen;
}

/** Position und Lage des Handys je Frame: sichtbar in Szene 1, 3, 4 und 7. */
function handyLage(f: number, fps: number) {
  const s = (i: number) => STARTS[i]!;
  const sichtbar = (von: number, bis: number) =>
    Math.min(spring({ frame: f - von, fps, config: { damping: 18 } }), 1 - spring({ frame: f - bis, fps, config: { damping: 18 } }));
  const anteil = Math.max(sichtbar(s(0) - 10, s(1) - 8), sichtbar(s(2) - 6, s(4) - 8), sichtbar(s(6) + bei(6, "Mein Vorschlag") - 10, PITCH_DAUER + 100));
  const x = 3.7 + (1 - anteil) * 9;
  const ry = -0.38 + Math.sin(f / 90) * 0.06 + (1 - anteil) * -0.9;
  const rx = 0.05 + Math.sin(f / 110) * 0.03;
  const y = Math.sin(f / 75) * 0.12;
  return { x, y, rx, ry, anteil };
}

function Handy() {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const texturen = useTexturen();
  const koerper = useMemo(() => new RoundedBoxGeometry(4.0, 8.4, 0.42, 8, 0.5), []);
  const lage = handyLage(f, fps);

  let aktuell = 0;
  ABLAUF.forEach(([start], i) => {
    if (f >= start) aktuell = i;
  });
  const [startAktuell, bildAktuell] = ABLAUF[aktuell]!;
  const bildVorher = ABLAUF[Math.max(0, aktuell - 1)]![1];
  const mix = aktuell === 0 ? 1 : interpolate(f, [startAktuell, startAktuell + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  if (!texturen || lage.anteil < 0.001) return null;
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 17], fov: 38 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[-4, 6, 8]} intensity={1.6} />
        <directionalLight position={[6, -2, 4]} intensity={0.5} color="#cdeadf" />
        <group position={[lage.x, lage.y, 0]} rotation={[lage.rx, lage.ry, 0]}>
          <mesh geometry={koerper}>
            <meshStandardMaterial color="#14201b" metalness={0.55} roughness={0.32} />
          </mesh>
          {/* Bildschirm: zwei Ebenen für weiche Übergänge */}
          <mesh position={[0, 0, 0.212]}>
            <planeGeometry args={[3.7, 3.7 * (844 / 390)]} />
            <meshBasicMaterial map={texturen[bildVorher]} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.214]}>
            <planeGeometry args={[3.7, 3.7 * (844 / 390)]} />
            <meshBasicMaterial map={texturen[bildAktuell]} toneMapped={false} transparent opacity={mix} />
          </mesh>
          {/* Lautsprecher-Schlitz */}
          <mesh position={[0, 3.98, 0.216]}>
            <planeGeometry args={[0.9, 0.12]} />
            <meshBasicMaterial color="#0b120f" />
          </mesh>
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
}

// ---------- Bausteine ----------

const LINKS: React.CSSProperties = { position: "absolute", left: 140, top: 0, bottom: 0, width: 880, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 };

function Logo({ groesse = 64 }: { groesse?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: groesse * 0.25 }}>
      <svg viewBox="0 0 150 166" width={groesse * 0.9} height={groesse}>
        <path fill={MARKE.gruen} d={LOGO_PFAD} />
      </svg>
      <span style={{ fontSize: groesse * 0.62, fontWeight: 700, color: MARKE.gruen, letterSpacing: -0.5 }}>BiatiCheck</span>
    </div>
  );
}

function Zeile({ f, start, children, groesse = 40, farbe = MARKE.dunkelgruen, gewicht = 600 }: { f: number; start: number; children: React.ReactNode; groesse?: number; farbe?: string; gewicht?: number }) {
  const a = ein(f, start);
  return (
    <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, fontSize: groesse, fontWeight: gewicht, color: farbe, lineHeight: 1.25, letterSpacing: -0.5 }}>{children}</div>
  );
}

function Punkt({ f, start, children, groesse = 34 }: { f: number; start: number; children: React.ReactNode; groesse?: number }) {
  const a = ein(f, start);
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "baseline", opacity: a, transform: `translateX(${(1 - a) * -30}px)` }}>
      <span style={{ flex: "0 0 14px", height: 14, borderRadius: 7, background: MARKE.gruen, transform: "translateY(-4px)" }} />
      <span style={{ fontSize: groesse, fontWeight: 500, color: MARKE.dunkelgruen, lineHeight: 1.3 }}>{children}</span>
    </div>
  );
}

function Etikett({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: MARKE.gruen }}>{children}</div>;
}

// ---------- Szenen ----------

function Szene1() {
  const f = useCurrentFrame();
  return (
    <div style={LINKS}>
      <div style={{ opacity: ein(f, 0) }}>
        <Logo />
      </div>
      <Zeile f={f} start={bei(0, "Hallo")} groesse={88} gewicht={800}>
        Hallo Eldin,
        <br />
        hallo Martin.
      </Zeile>
      <Zeile f={f} start={bei(0, "Ich möchte")} groesse={40} farbe={MARKE.gedaempft} gewicht={500}>
        BiatiCheck in drei Minuten: was das Tool kann, wie wir Geld verdienen und warum wir schnell sein müssen.
      </Zeile>
      <Zeile f={f} start={bei(0, "Ich bin's")} groesse={28} farbe={MARKE.gruenDunkel} gewicht={600}>
        Akrem · Biati Solutions
      </Zeile>
    </div>
  );
}

function Szene2() {
  const f = useCurrentFrame();
  const fragen = ["Yan gider faturası?", "Rozliczenie kosztów?", "Utility bill?", "Decontul utilităților?"];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1500, display: "flex", flexDirection: "column", gap: 34 }}>
        <Etikett>Die Lücke</Etikett>
        <Zeile f={f} start={0} groesse={64} gewicht={800}>
          Millionen Mieter bekommen jedes Jahr eine Nebenkostenabrechnung.
        </Zeile>
        <Zeile f={f} start={bei(1, "und viele davon")} groesse={44} farbe={MARKE.bernstein} gewicht={700}>
          Viele davon enthalten Fehler.
        </Zeile>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 10 }}>
          {fragen.map((t, i) => {
            const a = ein(f, bei(1, "Wer Deutsch") + i * 8);
            return (
              <span key={t} style={{ opacity: a, transform: `scale(${0.9 + a * 0.1})`, background: MARKE.weiss, border: "2px solid rgba(14,59,46,0.1)", borderRadius: 999, padding: "16px 30px", fontSize: 34, fontWeight: 600, color: MARKE.dunkelgruen }}>
                {t}
              </span>
            );
          })}
        </div>
        <Zeile f={f} start={bei(1, "versteht den Brief")} groesse={44} farbe={MARKE.gedaempft} gewicht={500}>
          Wer Deutsch nicht als Muttersprache spricht, versteht den Brief oft nicht und zahlt einfach.
        </Zeile>
        <Zeile f={f} start={bei(1, "Genau diese Lücke")} groesse={60} farbe={MARKE.gruen} gewicht={800}>
          Genau diese Lücke schließen wir.
        </Zeile>
      </div>
    </AbsoluteFill>
  );
}

function Szene3() {
  const f = useCurrentFrame();
  const schritte: [string, string][] = [
    ["Der Kunde fotografiert", "Foto oder PDF hochladen"],
    ["Unser Tool liest", "Jede Seite lesen, mit 21 Regeln prüfen"],
    ["Wie hoch ist das Fehlerpotenzial", "Fehlerpotenzial, Nachzahlung, Frist, Vergleich nach PLZ"],
    ["Danach bekommt er", "Nächste Schritte mit Datum"],
    ["und ein fertiges Schreiben", "Fertiges Schreiben mit Name, Adresse, E-Mail"],
    ["Wer möchte", "Optional: Mietvertrag findet weitere Fehler"],
  ];
  return (
    <div style={LINKS}>
      <Etikett>So funktioniert BiatiCheck</Etikett>
      <Zeile f={f} start={0} groesse={64} gewicht={800}>
        Vom Foto zur Lösung in wenigen Minuten
      </Zeile>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 8 }}>
        {schritte.map(([stelle, text]) => (
          <Punkt key={stelle} f={f} start={bei(2, stelle)}>
            {text}
          </Punkt>
        ))}
      </div>
    </div>
  );
}

function Szene4() {
  const f = useCurrentFrame();
  const zeile = (titel: string, wert: string, start: number, betont = false) => {
    const a = ein(f, start);
    return (
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 20}px)`, display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "22px 0", borderBottom: "2px solid rgba(14,59,46,0.08)" }}>
        <span style={{ fontSize: 38, fontWeight: 600, color: MARKE.dunkelgruen }}>{titel}</span>
        <span style={{ fontSize: 44, fontWeight: 800, color: betont ? MARKE.gruen : MARKE.dunkelgruen }}>{wert}</span>
      </div>
    );
  };
  return (
    <div style={LINKS}>
      <Etikett>Unser Preismodell</Etikett>
      <Zeile f={f} start={0} groesse={64} gewicht={800}>
        Der Kunde zahlt nur, wenn es sich lohnt
      </Zeile>
      <div>
        {zeile("Prüfen und Fehler sehen", "kostenlos", bei(3, "Prüfen ist kostenlos"), true)}
        {zeile("Erledigen-Paket nur ab einer Ersparnis von", "30 €", bei(3, "Nur wenn wir"))}
        {zeile("Preis Erledigen-Paket", "9,90 €", bei(3, "kostet das Erledigen"))}
      </div>
      <Zeile f={f} start={bei(3, "Das schafft Vertrauen")} groesse={34} farbe={MARKE.gedaempft} gewicht={500}>
        Das schafft Vertrauen, gerade bei unserer Zielgruppe.
      </Zeile>
    </div>
  );
}

function Zaehler({ f, start, bis, praefix = "", dauer = 45 }: { f: number; start: number; bis: number; praefix?: string; dauer?: number }) {
  const t = interpolate(f, [start, start + dauer], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {praefix}
      {new Intl.NumberFormat("de-DE").format(Math.round(bis * t))} €
    </span>
  );
}

function Szene5() {
  const f = useCurrentFrame();
  const karte = (kunden: string, umsatz: number, ersparnis: number, start: number, gross = false) => {
    const a = ein(f, start, 18);
    return (
      <div style={{ flex: 1, opacity: a, transform: `translateY(${(1 - a) * 30}px)`, background: gross ? MARKE.dunkelgruen : MARKE.weiss, color: gross ? "#e8f0ec" : MARKE.dunkelgruen, borderRadius: 32, padding: 48, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 40px 80px -40px rgba(14,59,46,0.35)" }}>
        <div style={{ fontSize: 34, fontWeight: 600, opacity: 0.8 }}>{kunden}</div>
        <div style={{ fontSize: 26, opacity: 0.75 }}>Umsatz pro Jahr</div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
          <Zaehler f={f} start={start + 6} bis={umsatz} praefix="≈ " />
        </div>
        <div style={{ fontSize: 26, opacity: 0.75, marginTop: 10 }}>Unsere Kunden sparen zusammen</div>
        <div style={{ fontSize: 56, fontWeight: 800, color: MARKE.gruen }}>
          <Zaehler f={f} start={start + 14} bis={ersparnis} praefix="≈ " />
        </div>
        {gross && <div style={{ fontSize: 26, opacity: 0.8 }}>plus Lizenzen von Partnern</div>}
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1600, display: "flex", flexDirection: "column", gap: 30 }}>
        <Etikett>Die Zahlen</Etikett>
        <Zeile f={f} start={0} groesse={60} gewicht={800}>
          Was wir mit 100 und mit 10.000 Kunden verdienen
        </Zeile>
        <div style={{ display: "flex", gap: 40 }}>
          {karte("100 Kunden", 393, 7500, bei(4, "Bei hundert Kunden"))}
          {karte("10.000 Kunden", 39300, 750000, bei(4, "Bei zehntausend Kunden"), true)}
        </div>
        <div style={{ opacity: ein(f, bei(4, "Wir rechnen so")), fontSize: 24, color: MARKE.gedaempft, lineHeight: 1.5 }}>
          Annahmen: 50 % der Abrechnungen mit mindestens 30 € Ersparnis · davon 40 % kaufen das Erledigen-Paket (9,90 €) · 5 % buchen das Experten-Paket (39 €) · Ø 150 € Ersparnis je Fall
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Szene6() {
  const f = useCurrentFrame();
  const stufen: [string, string, string, string][] = [
    ["1", "Tool", "prüft automatisch, sofort", "Erstens"],
    ["2", "Fachprüfer", "kontrollieren Unsicheres in 24 Stunden", "Zweitens"],
    ["3", "Partnerkanzlei", "übernimmt bei Ablehnung, mit fertiger Akte", "Drittens"],
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 1640, display: "flex", flexDirection: "column", gap: 44 }}>
        <Etikett>Unser Expertenteam</Etikett>
        <Zeile f={f} start={0} groesse={60} gewicht={800}>
          Drei Stufen, klar getrennt
        </Zeile>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          {stufen.map(([nr, titel, text, stelle], i) => {
            const a = ein(f, bei(5, stelle), 16);
            return (
              <div key={nr} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div style={{ flex: 1, opacity: a, transform: `translateY(${(1 - a) * 30}px)`, background: i === 2 ? MARKE.dunkelgruen : MARKE.weiss, color: i === 2 ? "#e8f0ec" : MARKE.dunkelgruen, borderRadius: 28, padding: "40px 36px", minHeight: 300, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 30px 60px -36px rgba(14,59,46,0.35)" }}>
                  <span style={{ width: 64, height: 64, borderRadius: 32, background: MARKE.gruen, color: "#fff", display: "grid", placeItems: "center", fontSize: 34, fontWeight: 800 }}>{nr}</span>
                  <div style={{ fontSize: 44, fontWeight: 800 }}>{titel}</div>
                  <div style={{ fontSize: 30, lineHeight: 1.35, opacity: 0.85 }}>{text}</div>
                </div>
                {i < 2 && (
                  <svg width="70" height="40" viewBox="0 0 70 40" style={{ opacity: ein(f, bei(5, stufen[i + 1]![3]) - 6), flexShrink: 0 }}>
                    <path d="M8 20 H54 M42 8 L56 20 L42 32" stroke={MARKE.gruen} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Szene7() {
  const f = useCurrentFrame();
  const partner: [string, string, string][] = [
    ["Kanzlei für Mietrecht", "übernimmt die Rechtsberatung", "eine Kanzlei"],
    ["Rechtsschutzversicherung", "bietet BiatiCheck ihren Kunden an", "Eine Rechtsschutz"],
    ["Migrationsberatung und Integrationskurse", "öffnen den Weg zur Zielgruppe", "Und Migrations"],
  ];
  const plan = bei(6, "Mein Vorschlag");
  const ausblenden = 1 - ein(f, plan - 8, 12);
  return (
    <>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: ausblenden }}>
        <div style={{ width: 1640, display: "flex", flexDirection: "column", gap: 40 }}>
          <Etikett>Unsere Partner</Etikett>
          <Zeile f={f} start={0} groesse={60} gewicht={800}>
            Drei Partnerschaften, die wir jetzt abschließen
          </Zeile>
          <div style={{ display: "flex", gap: 32 }}>
            {partner.map(([titel, text, stelle]) => {
              const a = ein(f, bei(6, stelle), 16);
              return (
                <div key={titel} style={{ flex: 1, opacity: a, transform: `translateY(${(1 - a) * 30}px)`, background: MARKE.weiss, borderRadius: 28, padding: "40px 36px", minHeight: 240, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 30px 60px -36px rgba(14,59,46,0.35)" }}>
                  <div style={{ fontSize: 40, fontWeight: 800, color: MARKE.dunkelgruen, lineHeight: 1.15 }}>{titel}</div>
                  <div style={{ fontSize: 30, color: MARKE.gedaempft, lineHeight: 1.35 }}>{text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
      <div style={{ ...LINKS, opacity: 1 - ausblenden }}>
        <Etikett>Nächster Schritt</Etikett>
        <Zeile f={f} start={plan} groesse={72} gewicht={800}>
          In 4 Wochen:
          <br />
          Test mit 20 echten Nutzern
        </Zeile>
        <Zeile f={f} start={bei(6, "Dann entscheiden")} groesse={40} farbe={MARKE.gedaempft} gewicht={500}>
          Dann entscheiden wir gemeinsam, mit echten Zahlen.
        </Zeile>
        <Zeile f={f} start={bei(6, "Lasst uns loslegen")} groesse={64} farbe={MARKE.gruen} gewicht={800}>
          Lasst uns loslegen.
        </Zeile>
      </div>
    </>
  );
}

// ---------- Untertitel (hilft beim Ansehen ohne Ton) ----------

function Untertitel() {
  const f = useCurrentFrame();
  for (let i = 0; i < SZENEN.length; i++) {
    const s = SZENEN[i]!;
    const lokal = f - STARTS[i]!;
    const dauer = s.sekunden * FPS;
    if (lokal < 0 || lokal > dauer + 6) continue;
    const saetze = s.text.match(/[\s\S]*?[.?!:](?=\s|$)/g) ?? [s.text];
    let pos = 0;
    for (const satz of saetze) {
      const von = (pos / s.text.length) * dauer;
      pos += satz.length;
      const bis = (pos / s.text.length) * dauer;
      if (lokal >= von && lokal < bis + 6) {
        return (
          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 46 }}>
            <div style={{ maxWidth: 1500, background: "rgba(14,59,46,0.86)", color: "#fff", fontSize: 30, fontWeight: 500, lineHeight: 1.35, padding: "12px 26px", borderRadius: 14, textAlign: "center" }}>{satz.trim()}</div>
          </AbsoluteFill>
        );
      }
    }
  }
  return null;
}

function Abspann() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: MARKE.dunkelgruen, opacity: ein(f, 0, 20) }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <svg viewBox="0 0 150 166" width={120} height={133}>
          <path fill={MARKE.gruen} d={LOGO_PFAD} />
        </svg>
        <div style={{ fontSize: 72, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>BiatiCheck</div>
        <div style={{ fontSize: 32, color: "#cdeadf" }}>Nebenkosten verstehen und handeln, in jeder Sprache.</div>
      </div>
    </AbsoluteFill>
  );
}

export function Pitchvideo() {
  const szenen = [Szene1, Szene2, Szene3, Szene4, Szene5, Szene6, Szene7];
  return (
    <AbsoluteFill style={{ fontFamily: MARKE.schrift }}>
      <Schrift />
      <Hintergrund />
      {szenen.map((Szene, i) => (
        <Sequence key={i} from={STARTS[i]!} durationInFrames={LAENGEN[i]! + (i === szenen.length - 1 ? ABSPANN : 0)}>
          <Szene />
        </Sequence>
      ))}
      <Handy />
      {SZENEN.map((s, i) => (
        <Sequence key={s.datei} from={STARTS[i]!}>
          <Audio src={staticFile(s.datei)} />
        </Sequence>
      ))}
      <Untertitel />
      <Sequence from={PITCH_DAUER - 75}>
        <Abspann />
      </Sequence>
    </AbsoluteFill>
  );
}
