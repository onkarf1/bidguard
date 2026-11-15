"use client";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/** Dark / light switch. The choice is remembered; first visit follows the OS setting. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  function flip() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("bg-theme", next);
    } catch {}
    setTheme(next);
  }
  return (
    <button onClick={flip} className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-50" aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} title="Toggle theme">
      <motion.span key={theme ?? "x"} initial={{ rotate: -90, scale: 0, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
        {theme === "light" ? <Moon className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
      </motion.span>
    </button>
  );
}

/** Runs before paint (in <head>) so there's no flash of the wrong theme. */
export const themeScript = `(function(){try{var t=localStorage.getItem("bg-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){}})();`;
