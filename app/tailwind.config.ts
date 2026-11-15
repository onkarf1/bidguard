import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#fbbf24", dark: "#d97706", light: "#fef3c7" },
      },
    },
  },
  plugins: [],
};
export default config;
