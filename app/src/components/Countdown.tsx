"use client";
import { useEffect, useState } from "react";
import { timeLeft } from "@/lib/format";

/** Live countdown; `offset` corrects for the difference between server and device clocks. */
export function Countdown({ endsAt, offset = 0, className = "" }: { endsAt: string | number | Date; offset?: number; className?: string }) {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  const ms = end - now;
  const urgent = ms > 0 && ms <= 30_000;
  return (
    <span className={`font-mono tabular-nums ${urgent ? "text-rose-400" : ""} ${className}`} aria-live={urgent ? "polite" : "off"}>
      {timeLeft(ms)}
    </span>
  );
}
