"use client";

import { useEffect, useRef } from "react";

/**
 * 3D-Szene der Startseite: ein Haus, durch das Kostenströme fließen und das
 * von einer Prüfebene abgetastet wird. Farben aus dem Design von biati.de.
 *
 * - three.js wird erst im Browser nachgeladen (blockiert nicht den Seitenaufbau)
 * - pausiert außerhalb des Bildschirms und in Hintergrund-Tabs
 * - steht still bei „reduzierte Bewegung“
 * - gibt beim Verlassen der Seite den Grafikspeicher frei
 */
export function HeldSzene({ anzahlRegeln }: { anzahlRegeln: number }) {
  const buehne = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let abgebrochen = false;
    let aufraeumen = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js");
      if (abgebrochen || !buehne.current || !leinwand.current) return;
      const el = buehne.current;
      const ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: leinwand.current, antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        el.dataset.ohneWebgl = "true";
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const szene = new THREE.Scene();
      const kamera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      kamera.position.set(7.5, 5.6, 9.5);

      szene.add(new THREE.HemisphereLight(0xffffff, 0xcfe8de, 2.2));
      const sonne = new THREE.DirectionalLight(0xffffff, 2.2);
      sonne.position.set(5, 9, 6);
      szene.add(sonne);

      const MAT = {
        sockel: new THREE.MeshStandardMaterial({ color: 0xe8f5f0, roughness: 0.9 }),
        wand: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
        dach: new THREE.MeshStandardMaterial({ color: 0x0e3b2e, roughness: 0.5 }),
        fenster: new THREE.MeshStandardMaterial({ color: 0x9fd9c4, emissive: 0x1fa37e, emissiveIntensity: 0.25, roughness: 0.2 }),
        tuer: new THREE.MeshStandardMaterial({ color: 0x1fa37e, roughness: 0.4 }),
      };

      const sockel = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.35, 64), MAT.sockel);
      sockel.position.y = -0.18;
      szene.add(sockel);

      const haus = new THREE.Group();
      const koerper = new THREE.Mesh(new RoundedBoxGeometry(2.6, 2.4, 2.0, 4, 0.08), MAT.wand);
      koerper.position.y = 1.2;
      haus.add(koerper);
      const dachForm = new THREE.Shape();
      dachForm.moveTo(-1.5, 0);
      dachForm.lineTo(0, 1.1);
      dachForm.lineTo(1.5, 0);
      dachForm.lineTo(-1.5, 0);
      const dach = new THREE.Mesh(new THREE.ExtrudeGeometry(dachForm, { depth: 2.25, bevelEnabled: false }), MAT.dach);
      dach.position.set(0, 2.4, -1.125);
      haus.add(dach);
      for (let etage = 0; etage < 3; etage++) {
        for (const x of [-0.75, 0.75]) {
          if (etage === 0 && x > 0) continue;
          const f = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.42, 0.06, 2, 0.03), MAT.fenster);
          f.position.set(x, 0.55 + etage * 0.72, 1.01);
          haus.add(f);
        }
        const seite = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.42, 0.5, 2, 0.03), MAT.fenster);
        seite.position.set(1.31, 0.55 + etage * 0.72, 0.3);
        haus.add(seite);
      }
      const tuer = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.8, 0.06, 2, 0.03), MAT.tuer);
      tuer.position.set(0.75, 0.4, 1.02);
      haus.add(tuer);
      szene.add(haus);

      const gruen = new THREE.Color(0x1fa37e);
      const blau = new THREE.Color(0x2e7bb8);
      const balken = [1.6, 1.1, 0.8, 0.5].map((h, i) => {
        const m = new THREE.Mesh(
          new RoundedBoxGeometry(0.34, h, 0.34, 3, 0.06),
          new THREE.MeshStandardMaterial({ color: gruen.clone().lerp(blau, i / 3), roughness: 0.35 }),
        );
        m.position.set(-2.65 + i * 0.45, h / 2, 1.9 - i * 0.12);
        m.userData.h = h;
        szene.add(m);
        return m;
      });

      const ebeneGeo = new THREE.BoxGeometry(3.4, 0.02, 2.8);
      const ebene = new THREE.Mesh(ebeneGeo, new THREE.MeshBasicMaterial({ color: 0x1fa37e, transparent: true, opacity: 0.22, depthWrite: false }));
      ebene.add(new THREE.LineSegments(new THREE.EdgesGeometry(ebeneGeo), new THREE.LineBasicMaterial({ color: 0x1fa37e, transparent: true, opacity: 0.8 })));
      szene.add(ebene);

      const anzahl = innerWidth < 600 ? 40 : 80;
      const kugel = new THREE.SphereGeometry(0.055, 12, 12);
      const teilchen = Array.from({ length: anzahl }, (_, i) => {
        const w = (i / anzahl) * Math.PI * 2;
        const bahn = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(Math.cos(w) * 4.6, 0.4 + Math.random() * 2.6, Math.sin(w) * 4.6),
          new THREE.Vector3(Math.cos(w + 0.6) * 2.4, 2.8 + Math.random(), Math.sin(w + 0.6) * 2.4),
          new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2),
        );
        const m = new THREE.Mesh(kugel, new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0x2e7bb8 : 0x1fa37e, transparent: true }));
        m.userData = { bahn, versatz: Math.random(), tempo: 0.05 + Math.random() * 0.05 };
        szene.add(m);
        return m;
      });

      const istDunkel = () => getComputedStyle(document.documentElement).getPropertyValue("--grund").trim().toLowerCase() === "#0a0e0c";
      const themaAnwenden = () => {
        const d = istDunkel();
        MAT.sockel.color.set(d ? 0x12241d : 0xe8f5f0);
        MAT.wand.color.set(d ? 0x1c2621 : 0xffffff);
        MAT.dach.color.set(d ? 0x1fa37e : 0x0e3b2e);
        MAT.fenster.emissiveIntensity = d ? 0.9 : 0.25;
      };
      themaAnwenden();

      let zeigerX = 0;
      let zeigerY = 0;
      const zeiger = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        zeigerX = (e.clientX - r.left) / r.width - 0.5;
        zeigerY = (e.clientY - r.top) / r.height - 0.5;
      };
      el.addEventListener("pointermove", zeiger);

      const zeichne = (t: number) => {
        const s = t / 1000;
        ebene.position.y = 0.15 + (Math.sin(s * 0.9) * 0.5 + 0.5) * 3.2;
        (ebene.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = 0.14 + Math.sin(s * 1.8) * 0.06;
        balken.forEach((b, i) => {
          const k = 0.85 + Math.sin(s * 1.2 + i) * 0.15;
          b.scale.y = k;
          b.position.y = ((b.userData.h as number) * k) / 2;
        });
        for (const m of teilchen) {
          const u = ((m.userData.versatz as number) + s * (m.userData.tempo as number)) % 1;
          m.position.copy((m.userData.bahn as InstanceType<typeof THREE.QuadraticBezierCurve3>).getPoint(u));
          (m.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = Math.sin(u * Math.PI);
        }
        haus.rotation.y = -0.35 + Math.sin(s * 0.25) * 0.12 + zeigerX * 0.35;
        kamera.position.y = 5.6 - zeigerY * 1.2;
        kamera.lookAt(0, 1.2, 0);
        renderer.render(szene, kamera);
      };

      const groesse = () => {
        const { width, height } = el.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        kamera.aspect = width / height;
        kamera.updateProjectionMatrix();
      };

      let laeuft = false;
      let sichtbar = true;
      let rahmen = 0;
      const schleife = (t: number) => {
        if (!laeuft) return;
        zeichne(t);
        rahmen = requestAnimationFrame(schleife);
      };
      const steuern = () => {
        const soll = !ruhig && sichtbar && !document.hidden;
        if (soll && !laeuft) {
          laeuft = true;
          rahmen = requestAnimationFrame(schleife);
        } else if (!soll) {
          laeuft = false;
          cancelAnimationFrame(rahmen);
        }
      };
      const neuZeichnen = () => {
        themaAnwenden();
        if (!laeuft) zeichne(1400);
      };

      const beobachterGroesse = new ResizeObserver(() => {
        groesse();
        if (!laeuft) zeichne(1400);
      });
      beobachterGroesse.observe(el);
      const beobachterSicht = new IntersectionObserver(([e]) => {
        sichtbar = Boolean(e?.isIntersecting);
        steuern();
      });
      beobachterSicht.observe(el);
      const farbschema = matchMedia("(prefers-color-scheme: dark)");
      document.addEventListener("visibilitychange", steuern);
      window.addEventListener("themawechsel", neuZeichnen);
      farbschema.addEventListener("change", neuZeichnen);

      groesse();
      zeichne(1400);
      steuern();
      el.dataset.bereit = "true";

      aufraeumen = () => {
        laeuft = false;
        cancelAnimationFrame(rahmen);
        beobachterGroesse.disconnect();
        beobachterSicht.disconnect();
        document.removeEventListener("visibilitychange", steuern);
        window.removeEventListener("themawechsel", neuZeichnen);
        farbschema.removeEventListener("change", neuZeichnen);
        el.removeEventListener("pointermove", zeiger);
        szene.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          m.geometry?.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose();
        });
        renderer.dispose();
      };
    })();

    return () => {
      abgebrochen = true;
      aufraeumen();
    };
  }, []);

  return (
    <div
      ref={buehne}
      role="img"
      aria-label="Animation: Ein Haus wird von einer Prüfebene abgetastet, Kostenströme fließen hinein"
      className="relative aspect-square w-full max-w-[560px] justify-self-center data-[ohne-webgl=true]:bg-[radial-gradient(circle_at_50%_55%,var(--mint),transparent_70%)]"
    >
      <canvas ref={leinwand} className="absolute inset-0 size-full" />
      <div className="schweben absolute top-[8%] right-[2%] rotate-[4deg] rounded-2xl bg-gradient-to-br from-[#2e7bb8] to-[#6fa8d6] px-5 py-3 text-white shadow-glas">
        <div className="text-2xl font-extrabold">{anzahlRegeln}</div>
        <div className="text-xs font-medium text-white/85">Regeln geprüft</div>
      </div>
      <div className="schweben absolute bottom-[14%] left-0 -rotate-[4deg] rounded-2xl border border-linie bg-flaeche px-5 py-3 shadow-glas backdrop-blur [animation-delay:-2s]">
        <div className="text-xs font-medium text-gedaempft">Zu klären (Beispiel)</div>
        <div className="text-2xl font-extrabold tabular-nums tracking-tight">1.236,44 €</div>
      </div>
      <div className="schweben absolute right-0 bottom-[4%] flex rotate-[3deg] items-center gap-2 rounded-2xl border border-linie bg-flaeche px-4 py-2.5 text-sm font-semibold shadow-glas backdrop-blur [animation-delay:-4s]">
        <span className="rounded-full bg-warn px-2.5 py-0.5 text-xs text-warn-text">Auffällig</span>
        Warmwasser 31,14 €/m³
      </div>
    </div>
  );
}
