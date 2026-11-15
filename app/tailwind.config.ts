import type { Config } from "tailwindcss";

/**
 * Monochrome theme. Every gray step and the brand color come from CSS variables
 * (globals.css), so `data-theme="light"` flips the whole UI without touching components.
 * Status colors keep their meaning; their light steps darken in light mode for contrast.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const gray = Object.fromEntries(steps.map((s) => [s, v(`g-${s}`)]));
const status = (name: string, base: Record<number, string>) => ({ ...base, 200: v(`${name}-200`), 300: v(`${name}-300`) });

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: gray,
        brand: { DEFAULT: v("brand"), dark: v("g-300"), light: v("g-800") },
        emerald: status("emerald", { 400: "#34d399", 500: "#10b981" }),
        rose: status("rose", { 400: "#fb7185", 500: "#f43f5e" }),
        amber: status("amber", { 400: "#fbbf24", 500: "#f59e0b" }),
        sky: status("sky", { 400: "#38bdf8", 500: "#0ea5e9" }),
      },
    },
  },
  plugins: [],
};
export default config;
