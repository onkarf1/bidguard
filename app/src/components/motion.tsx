"use client";
import { MotionConfig, animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/** Respects the OS "reduce motion" setting everywhere. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** A number that springs to its new value (prices, counters). */
export function AnimatedNumber({ value, format, className = "", duration = 0.8 }: { value: number; format: (n: number) => string; className?: string; duration?: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, inView, mv, duration]);
  return <motion.span ref={ref} className={`tabular-nums ${className}`}>{text}</motion.span>;
}

export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
export const rise = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } } };

/** Fades/rises content into view once, as it scrolls in. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/** Lightweight confetti burst (no dependency). */
export function confetti(origin?: { x: number; y: number }) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  Object.assign(c.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "60" });
  c.width = innerWidth;
  c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext("2d")!;
  const ox = origin?.x ?? innerWidth / 2, oy = origin?.y ?? innerHeight / 3;
  const colors = ["#ffffff", "#e5e5e5", "#a3a3a3", "#737373", "#404040", "#0a0a0a"];
  const parts = Array.from({ length: 160 }, () => {
    const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
    return { x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: Math.random() * 0.3 - 0.15 };
  });
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.25;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.max(0, 1 - frame / 140);
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (++frame < 140) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}
