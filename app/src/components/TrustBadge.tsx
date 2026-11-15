"use client";
import { useEffect, useState } from "react";
export function trustColor(score: number) {
  return score >= 75 ? "#34d399" : score >= 55 ? "#fbbf24" : score >= 35 ? "#fb923c" : "#f87171";
}

/** Circular Trust Score badge. */
export function TrustBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const px = size === "sm" ? 40 : size === "lg" ? 88 : 56;
  // Count up from 0 so the ring visibly fills.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(score);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setShown(Math.round(score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  return (
    <span
      className="trust-ring relative inline-grid shrink-0 place-items-center rounded-full"
      style={{ width: px, height: px, ["--v" as string]: shown, ["--c" as string]: trustColor(shown) }}
      role="img"
      aria-label={`Trust score ${score} out of 100`}
    >
      <span className="grid place-items-center rounded-full bg-slate-950" style={{ width: px - 8, height: px - 8 }}>
        <span className={`font-bold tabular-nums ${size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-base"}`} style={{ color: trustColor(shown) }}>
          {shown}
        </span>
      </span>
    </span>
  );
}
