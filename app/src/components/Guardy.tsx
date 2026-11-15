"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";

export type GuardyMood = "neutral" | "happy" | "thinking" | "warning";

/**
 * Guardy, BidGuard's chibi anime guardian: silver-lavender hair with fox ears and a bouncy
 * ahoge, big sparkly eyes that follow the pointer, rosy cheeks, a little "ω" mouth, and a
 * hoodie with the BidGuard shield. Blinks, breathes, waves, talks, and changes expression by mood.
 * Pure SVG + framer-motion: crisp at any size, no assets, respects reduced motion.
 */
export function Guardy({ size = 96, mood = "neutral", talking = false, wave = false }: { size?: number; mood?: GuardyMood; talking?: boolean; wave?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const url = (n: string) => `url(#${id(n)})`;
  const ref = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotion();
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const [twitch, setTwitch] = useState(0);

  // Irises follow the pointer anywhere on the page.
  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.45);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 280);
      setLook({ x: (dx / d) * 2.6 * k, y: (dy / d) * 2.4 * k });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce]);

  // Natural blinks (sometimes a double blink) and the occasional ear twitch.
  useEffect(() => {
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 120);
        if (Math.random() < 0.3) setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 110); }, 250);
        if (Math.random() < 0.35) setTwitch((n) => n + 1);
        schedule();
      }, 2000 + Math.random() * 3000);
    };
    schedule();
    return () => clearTimeout(t);
  }, [reduce]);

  const eyes = mood === "thinking" ? { x: 1.6, y: -2.6 } : mood === "warning" ? { x: look.x * 0.5, y: 0.6 } : look;
  const happy = mood === "happy";
  const closed = happy || blink;

  return (
    <motion.svg
      ref={ref}
      width={size}
      height={size * (140 / 120)}
      viewBox="0 0 120 140"
      role="img"
      aria-label={`Guardy, the BidGuard mascot, looking ${mood}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={id("hair")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#e4e1fb" />
          <stop offset="1" stopColor="#a9a3dd" />
        </linearGradient>
        <linearGradient id={id("hairDark")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9c4ef" />
          <stop offset="1" stopColor="#8a83c9" />
        </linearGradient>
        <radialGradient id={id("skin")} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#fff4ec" />
          <stop offset="1" stopColor="#ffe0d0" />
        </radialGradient>
        <linearGradient id={id("iris")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2f8f" />
          <stop offset="0.45" stopColor="#6d5df5" />
          <stop offset="1" stopColor="#7fd8ff" />
        </linearGradient>
        <linearGradient id={id("hoodie")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9d8e6" />
        </linearGradient>
        <linearGradient id={id("silver")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#c7c7d1" />
          <stop offset="1" stopColor="#6b6b7b" />
        </linearGradient>
        <clipPath id={id("eyeL")}><ellipse cx="45" cy="65" rx="9.5" ry="11" /></clipPath>
        <clipPath id={id("eyeR")}><ellipse cx="75" cy="65" rx="9.5" ry="11" /></clipPath>
      </defs>

      {/* soft ground shadow */}
      <motion.ellipse cx="60" cy="135" ry="3.5" fill="#000" initial={{ rx: 24, opacity: 0.25 }} animate={reduce ? undefined : { rx: [24, 20, 24], opacity: [0.25, 0.17, 0.25] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }} />

      {/* whole character bobs */}
      <motion.g
        animate={reduce ? undefined : happy ? { y: [0, -7, 0, -4, 0] } : { y: [0, -2.2, 0] }}
        transition={happy ? { duration: 0.9 } : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* ── body ── */}
        <g>
          {/* feet */}
          <ellipse cx="50" cy="130" rx="7" ry="4" fill="#4b4870" />
          <ellipse cx="70" cy="130" rx="7" ry="4" fill="#4b4870" />
          {/* hoodie */}
          <path d="M38 98 Q60 88 82 98 L86 124 Q60 133 34 124 Z" fill={url("hoodie")} stroke="#a7a5bd" strokeWidth="1.4" strokeLinejoin="round" />
          {/* hood drawstrings */}
          <path d="M54 97 v8 M66 97 v8" stroke="#a7a5bd" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="54" cy="106" r="1.3" fill="#a7a5bd" />
          <circle cx="66" cy="106" r="1.3" fill="#a7a5bd" />
          {/* shield emblem */}
          <path d="M60 107 l7 2.4 q0.4 7.5 -7 11.6 q-7.4 -4.1 -7 -11.6 z" fill={url("silver")} stroke="#55556a" strokeWidth="1" />
          <path d="M56.8 113.6 l2.3 2.3 l4.2 -4.6" stroke="#2b2b38" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* left arm */}
          <path d="M39 101 Q30 108 31 116" stroke="#d9d8e6" strokeWidth="8" strokeLinecap="round" fill="none" />
          <circle cx="31" cy="117.5" r="4.2" fill={url("skin")} stroke="#e8b9a4" strokeWidth="1" />
          {/* right arm: waves hello */}
          <motion.g style={{ originX: "81px", originY: "101px" }} animate={wave && !reduce ? { rotate: [0, -75, -50, -75, -50, -75, 0] } : { rotate: 0 }} transition={{ duration: 1.6, ease: "easeInOut" }}>
            <path d="M81 101 Q90 108 89 116" stroke="#d9d8e6" strokeWidth="8" strokeLinecap="round" fill="none" />
            <circle cx="89" cy="117.5" r="4.2" fill={url("skin")} stroke="#e8b9a4" strokeWidth="1" />
          </motion.g>
        </g>

        {/* ── head (tilts when thinking) ── */}
        <motion.g
          style={{ originX: "60px", originY: "92px" }}
          animate={reduce ? undefined : mood === "thinking" ? { rotate: [0, -8, -8, 0] } : mood === "warning" ? { rotate: [0, 2, -2, 0] } : { rotate: 0 }}
          transition={mood === "thinking" ? { duration: 2.6, repeat: Infinity } : mood === "warning" ? { duration: 0.5, repeat: 2 } : { duration: 0.3 }}
        >
          {/* back hair */}
          <path d="M17 62 Q14 20 60 15 Q106 20 103 62 Q104 84 96 96 Q92 80 88 76 L32 76 Q28 80 24 96 Q16 84 17 62 Z" fill={url("hairDark")} stroke="#6f69ad" strokeWidth="1.4" strokeLinejoin="round" />

          {/* fox ears (twitch now and then) */}
          {[
            { d: "M27 36 L21 6 L48 22 Z", inner: "M29 31 L25.5 13 L42 23 Z", ox: "34px", oy: "28px", dir: -1 },
            { d: "M93 36 L99 6 L72 22 Z", inner: "M91 31 L94.5 13 L78 23 Z", ox: "86px", oy: "28px", dir: 1 },
          ].map((e, i) => (
            <motion.g key={`${i}-${twitch}`} style={{ originX: e.ox, originY: e.oy }} initial={false} animate={reduce || twitch === 0 ? { rotate: 0 } : { rotate: [0, e.dir * 14, 0, e.dir * 8, 0] }} transition={{ duration: 0.45, delay: i * 0.06 }}>
              <path d={e.d} fill={url("hair")} stroke="#6f69ad" strokeWidth="1.4" strokeLinejoin="round" />
              <path d={e.inner} fill="#ffc2d4" />
            </motion.g>
          ))}

          {/* face */}
          <ellipse cx="60" cy="62" rx="34" ry="32" fill={url("skin")} stroke="#e8b9a4" strokeWidth="1.3" />

          {/* side locks */}
          <path d="M24 50 Q20 72 27 90 Q31 78 31 62 Z" fill={url("hair")} stroke="#6f69ad" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M96 50 Q100 72 93 90 Q89 78 89 62 Z" fill={url("hair")} stroke="#6f69ad" strokeWidth="1.2" strokeLinejoin="round" />

          {/* bangs: zig-zag anime strands */}
          <path d="M23 54 Q24 22 60 18 Q96 22 97 54 Q91 44 84 49 Q82 37 73 47 Q69 33 61 46 Q55 33 48 47 Q40 37 37 50 Q30 43 23 54 Z" fill={url("hair")} stroke="#6f69ad" strokeWidth="1.4" strokeLinejoin="round" />
          {/* hair shine */}
          <path d="M38 29 Q50 23 64 24" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.9" />
          <path d="M70 25 Q76 26 80 29" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />

          {/* ahoge (cowlick) sways */}
          <motion.path
            d="M58 19 Q52 4 66 1 Q60 7 63 19 Z"
            fill={url("hair")}
            stroke="#6f69ad"
            strokeWidth="1.3"
            strokeLinejoin="round"
            style={{ originX: "60px", originY: "19px" }}
            animate={reduce ? undefined : { rotate: happy ? [0, -18, 14, -10, 0] : [0, -7, 5, 0] }}
            transition={happy ? { duration: 0.8 } : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* shield hair clip */}
          <path d="M88 40 l5 1.7 q0.3 5.3 -5 8.3 q-5.3 -3 -5 -8.3 z" fill={url("silver")} stroke="#55556a" strokeWidth="0.9" />

          {/* worried brows */}
          {mood === "warning" && (
            <g stroke="#6f69ad" strokeWidth="1.8" strokeLinecap="round" fill="none">
              <path d="M38 51 Q44 49 51 52" transform="rotate(10 44 51)" />
              <path d="M69 52 Q76 49 82 51" transform="rotate(-10 76 51)" />
            </g>
          )}

          {/* ── eyes ── */}
          {closed ? (
            happy ? (
              <g stroke="#2e2760" strokeWidth="2.6" strokeLinecap="round" fill="none">
                <path d="M37 67 Q45 57 53 67" />
                <path d="M67 67 Q75 57 83 67" />
              </g>
            ) : (
              <g stroke="#2e2760" strokeWidth="2.4" strokeLinecap="round" fill="none">
                <path d="M37 66 Q45 70 53 66" />
                <path d="M67 66 Q75 70 83 66" />
              </g>
            )
          ) : (
            [
              { cx: 45, clip: url("eyeL") },
              { cx: 75, clip: url("eyeR") },
            ].map((e, i) => (
              <g key={i}>
                <ellipse cx={e.cx} cy="65" rx="9.5" ry="11" fill="#ffffff" />
                <g clipPath={e.clip}>
                  <motion.g animate={{ x: eyes.x, y: eyes.y }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
                    <ellipse cx={e.cx} cy="66" rx="7.6" ry="9.6" fill={url("iris")} />
                    <ellipse cx={e.cx} cy="66.5" rx="3.6" ry="4.8" fill="#1d1645" />
                    {/* sparkles */}
                    <circle cx={e.cx - 3.2} cy="61.5" r="3" fill="#ffffff" />
                    <circle cx={e.cx + 3.4} cy="70.5" r="1.5" fill="#ffffff" opacity="0.95" />
                    <path d={`M${e.cx + 3} 59.2 l0.7 1.6 l1.6 0.7 l-1.6 0.7 l-0.7 1.6 l-0.7 -1.6 l-1.6 -0.7 l1.6 -0.7 z`} fill="#ffffff" />
                  </motion.g>
                </g>
                {/* lash line with a flick */}
                <path d={i === 0 ? "M35.5 60.5 Q45 51 54.5 58.5" : "M84.5 60.5 Q75 51 65.5 58.5"} stroke="#2e2760" strokeWidth="2.6" strokeLinecap="round" fill="none" />
                <path d={i === 0 ? "M36 60 l-3 -2.2 M37.5 57.4 l-2.6 -2.6" : "M84 60 l3 -2.2 M82.5 57.4 l2.6 -2.6"} stroke="#2e2760" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            ))
          )}

          {/* blush */}
          <ellipse cx="35" cy="77" rx="6.2" ry="3.4" fill="#ff8fb1" opacity={happy ? 0.75 : 0.5} />
          <ellipse cx="85" cy="77" rx="6.2" ry="3.4" fill="#ff8fb1" opacity={happy ? 0.75 : 0.5} />
          <g stroke="#ff6f99" strokeWidth="0.9" strokeLinecap="round" opacity="0.7">
            <path d="M32 77.5 l1.6 -2.4 M35 77.5 l1.6 -2.4 M38 77.5 l1.6 -2.4" />
            <path d="M82 77.5 l1.6 -2.4 M85 77.5 l1.6 -2.4 M88 77.5 l1.6 -2.4" />
          </g>

          {/* ── mouth ── */}
          {talking && !reduce ? (
            <motion.ellipse cx="60" cy="80" rx="3.2" fill="#c2405f" stroke="#7a2038" strokeWidth="1" initial={{ ry: 1.5 }} animate={{ ry: [1.4, 3.4, 2, 3.8, 1.4] }} transition={{ duration: 0.5, repeat: Infinity }} />
          ) : happy ? (
            <g>
              <path d="M53.5 77.5 Q60 87 66.5 77.5 Z" fill="#c2405f" stroke="#7a2038" strokeWidth="1.1" strokeLinejoin="round" />
              <path d="M56.5 81.8 Q60 85 63.5 81.8 Q60 80.5 56.5 81.8 Z" fill="#ff9db5" />
            </g>
          ) : mood === "warning" ? (
            <path d="M54.5 81 q1.8 -2 3.6 0 q1.8 2 3.6 0 q1.8 -2 3.6 0" stroke="#7a2038" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          ) : mood === "thinking" ? (
            <ellipse cx="62" cy="80.5" rx="2" ry="1.6" fill="#c2405f" stroke="#7a2038" strokeWidth="0.9" />
          ) : (
            // cat mouth "ω"
            <path d="M54 78.5 q3 3.4 6 0 q3 3.4 6 0" stroke="#7a2038" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* sweat drop */}
          {(mood === "warning" || mood === "thinking") && (
            <motion.path d="M95 44 q-4 6 0 8.4 q4 -2.4 0 -8.4 z" fill="#a5dcff" stroke="#5aa9e0" strokeWidth="0.9" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} />
          )}
        </motion.g>
      </motion.g>

      {/* thinking bubbles */}
      {mood === "thinking" && !reduce && (
        <g>
          {[0, 1, 2].map((i) => (
            <motion.circle key={i} cx={101 + i * 6} cy={20 - i * 6} r={1.8 + i * 1.1} fill="#e4e1fb" stroke="#a9a3dd" strokeWidth="0.8" initial={{ opacity: 0.2 }} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.22 }} />
          ))}
        </g>
      )}

      {/* happy sparkles */}
      <AnimatePresence>
        {happy &&
          !reduce &&
          [
            { x: 14, y: 30, s: 1, d: 0 },
            { x: 106, y: 26, s: 0.8, d: 0.15 },
            { x: 108, y: 70, s: 0.6, d: 0.3 },
            { x: 10, y: 72, s: 0.7, d: 0.45 },
          ].map((p, i) => (
            <motion.path
              key={i}
              d={`M${p.x} ${p.y - 6 * p.s} L${p.x + 1.6 * p.s} ${p.y - 1.6 * p.s} L${p.x + 6 * p.s} ${p.y} L${p.x + 1.6 * p.s} ${p.y + 1.6 * p.s} L${p.x} ${p.y + 6 * p.s} L${p.x - 1.6 * p.s} ${p.y + 1.6 * p.s} L${p.x - 6 * p.s} ${p.y} L${p.x - 1.6 * p.s} ${p.y - 1.6 * p.s} Z`}
              fill="#ffd86b"
              stroke="#e8a93a"
              strokeWidth="0.6"
              style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 1, 1.2, 0], opacity: [0, 1, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, delay: p.d, repeat: Infinity, repeatDelay: 0.6 }}
            />
          ))}
      </AnimatePresence>
    </motion.svg>
  );
}
