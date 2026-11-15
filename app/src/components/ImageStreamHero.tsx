"use client";
import { useEffect, useState, type ReactNode } from "react";
import { SAMPLES } from "@/lib/samples";

/**
 * Hero backdrop: two rails of product photos stream out of a vanishing point at the centre and
 * sweep to both edges, growing and turning as they approach (CSS 3D perspective, endless loop).
 * Original implementation for BidGuard; pauses for "reduce motion".
 */
const PER_RAIL = 8;
const DURATION = 18; // seconds for one card to travel centre → edge

export function ImageStreamHero({ children }: { children: ReactNode }) {
  // Shuffle on the client so every visit streams a different mix of products.
  const [imgs, setImgs] = useState(() => SAMPLES.map((s) => s.image));
  useEffect(() => {
    setImgs((cur) => [...cur].sort(() => Math.random() - 0.5));
  }, []);
  const rail = (side: "l" | "r") =>
    Array.from({ length: PER_RAIL }, (_, i) => {
      const src = imgs[(i * 2 + (side === "r" ? 1 : 0)) % imgs.length];
      return (
        <div key={`${side}-${i}`} className={`stream-card stream-${side}`} style={{ animationDelay: `${-(i * DURATION) / PER_RAIL}s`, animationDuration: `${DURATION}s` }} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" draggable={false} />
        </div>
      );
    });

  return (
    <section className="stream-stage relative ml-[calc(50%-50vw)] w-screen overflow-hidden">
      <div className="stream-scene" aria-hidden>
        {rail("l")}
        {rail("r")}
      </div>
      {/* keeps the centre readable in both themes */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_42%_at_50%_52%,rgb(var(--g-950))_45%,rgb(var(--g-950)/0.8)_70%,transparent_100%)] sm:bg-[radial-gradient(ellipse_55%_60%_at_50%_50%,rgb(var(--g-950))_25%,rgb(var(--g-950)/0.75)_55%,transparent_85%)]" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950 to-transparent" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-[560px] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:min-h-[620px]">{children}</div>
    </section>
  );
}
