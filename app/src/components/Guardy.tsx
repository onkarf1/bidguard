"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";

export type GuardyMood = "neutral" | "happy" | "thinking" | "warning";

/**
 * Guardy, BidGuard's mascot: a polished chrome shield-guardian with a glass visor.
 * Eyes follow the pointer, blinks, breathes, talks (mouth), waves, and changes expression by mood.
 * Pure SVG + framer-motion, so it stays crisp at any size and needs no assets.
 */
export function Guardy({ size = 96, mood = "neutral", talking = false, wave = false }: { size?: number; mood?: GuardyMood; talking?: boolean; wave?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const ref = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotion();
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  // Eyes track the pointer anywhere on the page.
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.42);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 300);
      setLook({ x: (dx / d) * 3.2 * k, y: (dy / d) * 2.6 * k });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce]);

  // Natural blinking at random intervals (sometimes a double blink).
  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        if (Math.random() < 0.25) setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 120); }, 260);
        schedule();
      }, 2200 + Math.random() * 3200);
    };
    schedule();
    return () => clearTimeout(t);
  }, [reduce]);

  const eyeLook = mood === "thinking" ? { x: 2.2, y: -2.6 } : look;
  const eyeColor = mood === "warning" ? "#fb7185" : "#f8fafc";
  const happy = mood === "happy";

  return (
    <motion.svg
      ref={ref}
      width={size}
      height={size * (140 / 120)}
      viewBox="0 0 120 140"
      role="img"
      aria-label={`Guardy the BidGuard mascot, looking ${mood}`}
      animate={reduce ? undefined : mood === "happy" ? { y: [0, -6, 0] } : mood === "thinking" ? { rotate: [0, -6, -6, 0] } : { y: [0, -2.5, 0] }}
      transition={mood === "happy" ? { duration: 0.6, repeat: 2 } : mood === "thinking" ? { duration: 2.4, repeat: Infinity } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      style={{ overflow: "visible", originX: "50%", originY: "90%" }}
    >
      <defs>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.25" stopColor="#e5e5e5" />
          <stop offset="0.6" stopColor="#9ca3af" />
          <stop offset="1" stopColor="#262626" />
        </linearGradient>
        <radialGradient id={id("rim")} cx="0.3" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("glass")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262626" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
        <radialGradient id={id("eye")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor={eyeColor} />
          <stop offset="1" stopColor={eyeColor} stopOpacity="0.2" />
        </radialGradient>
        <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={id("soft")} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <clipPath id={id("visor")}><rect x="31" y="40" width="58" height="36" rx="16" /></clipPath>
      </defs>

      {/* ground shadow */}
      <motion.ellipse cx="60" cy="134" ry="4.5" fill="#000" initial={{ rx: 30, opacity: 0.35 }} animate={reduce ? undefined : { rx: [30, 26, 30], opacity: [0.35, 0.25, 0.35] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} />

      {/* antenna */}
      <line x1="60" y1="20" x2="60" y2="8" stroke="#525252" strokeWidth="3" strokeLinecap="round" />
      <motion.circle cx="60" cy="7" r="4.5" fill={mood === "warning" ? "#fb7185" : "#f5f5f5"} filter={`url(#${id("glow")})`}
        animate={reduce ? undefined : { opacity: mood === "thinking" ? [1, 0.25, 1] : [1, 0.6, 1] }} transition={{ duration: mood === "thinking" ? 0.5 : 2, repeat: Infinity }} />

      {/* left arm */}
      <path d="M22 78 q-10 6 -8 18" stroke="#a3a3a3" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="14" cy="96" r="5.5" fill="#d4d4d4" stroke="#404040" strokeWidth="1" />
      {/* right arm: waves when greeting */}
      <motion.g style={{ originX: "98px", originY: "76px" }} animate={wave && !reduce ? { rotate: [0, -38, -10, -38, -10, 0] } : { rotate: 0 }} transition={{ duration: 1.4 }}>
        <path d="M98 78 q10 6 8 18" stroke="#a3a3a3" strokeWidth="7" strokeLinecap="round" fill="none" />
        <circle cx="106" cy="96" r="5.5" fill="#d4d4d4" stroke="#404040" strokeWidth="1" />
      </motion.g>

      {/* body: shield with metallic gradient, breathing */}
      <motion.g style={{ originX: "60px", originY: "128px" }} animate={reduce ? undefined : { scaleY: [1, 1.025, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M60 18 L100 30 Q102 82 60 128 Q18 82 20 30 Z" fill={`url(#${id("gold")})`} stroke="#262626" strokeWidth="1.5" filter={`url(#${id("soft")})`} />
        <path d="M60 18 L100 30 Q102 82 60 128 Q18 82 20 30 Z" fill={`url(#${id("rim")})`} />
        {/* inner bevel */}
        <path d="M60 25 L93 35 Q94 80 60 119 Q26 80 27 35 Z" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />
        {/* chest emblem: check mark */}
        <circle cx="60" cy="98" r="9" fill="#171717" opacity="0.25" />
        <path d="M55 98 l4 4 l7 -8" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* visor */}
        <rect x="31" y="40" width="58" height="36" rx="16" fill={`url(#${id("glass")})`} stroke="#0f172a" strokeWidth="1.5" />
        <g clipPath={`url(#${id("visor")})`}>
          {/* eyes */}
          {[44, 76].map((cx, i) => (
            <g key={i}>
              {happy ? (
                <path d={`M${cx - 7} ${59} q7 -8 14 0`} stroke={eyeColor} strokeWidth="3.2" fill="none" strokeLinecap="round" filter={`url(#${id("glow")})`} />
              ) : (
                <motion.g animate={{ x: eyeLook.x, y: eyeLook.y, scaleY: blink ? 0.08 : 1 }} transition={{ type: "spring", stiffness: 300, damping: 20, scaleY: { duration: 0.06 } }} style={{ originX: `${cx}px`, originY: "58px" }}>
                  <ellipse cx={cx} cy="58" rx="7.5" ry="8.5" fill={`url(#${id("eye")})`} filter={`url(#${id("glow")})`} />
                  <circle cx={cx - 2} cy="55" r="2" fill="#fff" />
                </motion.g>
              )}
              {/* brows (worried when warning) */}
              {mood === "warning" && <path d={i === 0 ? `M${cx - 7} 46 l12 4` : `M${cx + 7} 46 l-12 4`} stroke="#fb7185" strokeWidth="2.4" strokeLinecap="round" />}
            </g>
          ))}
          {/* mouth */}
          <motion.rect x="52" width="16" rx="3" fill={eyeColor} filter={`url(#${id("glow")})`} initial={{ height: 2, y: 69 }}
            animate={talking && !reduce ? { height: [2, 6, 3, 7, 2], y: [69, 67, 68.5, 66.5, 69] } : happy ? { height: 3, y: 68 } : { height: 2, y: 69 }}
            transition={talking ? { duration: 0.45, repeat: Infinity } : { duration: 0.2 }} />
          {/* glass reflection */}
          <path d="M36 44 q12 -3 22 -1" stroke="#fff" strokeOpacity="0.25" strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
        {/* cheeks */}
        {happy && (
          <>
            <ellipse cx="34" cy="80" rx="5" ry="2.6" fill="#fb7185" opacity="0.55" />
            <ellipse cx="86" cy="80" rx="5" ry="2.6" fill="#fb7185" opacity="0.55" />
          </>
        )}
      </motion.g>

      {/* thinking dots */}
      {mood === "thinking" && !reduce && (
        <g>
          {[0, 1, 2].map((i) => (
            <motion.circle key={i} cx={98 + i * 7} cy={16 - i * 5} r={2 + i} fill="#cbd5e1" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
          ))}
        </g>
      )}
    </motion.svg>
  );
}
