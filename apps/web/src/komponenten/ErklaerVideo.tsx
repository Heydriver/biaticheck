"use client";

import { useEffect, useRef } from "react";

/** Erklärvideo (Remotion): spielt stumm ab, sobald es sichtbar ist, und pausiert außerhalb. */
export function ErklaerVideo() {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const beobachter = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.4 },
    );
    beobachter.observe(v);
    return () => beobachter.disconnect();
  }, []);
  return (
    <div className="aspect-video w-full max-w-full overflow-hidden rounded-3xl border border-linie bg-grund-alt shadow-glas">
      <video
        ref={video}
        src="/video/erklaervideo.mp4"
        poster="/video/poster.jpg"
        muted
        loop
        playsInline
        controls
        preload="metadata"
        aria-label="Erklärvideo: So funktioniert BiatiCheck"
        className="size-full object-cover"
      />
    </div>
  );
}
