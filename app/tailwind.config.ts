import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#14b8a6", dark: "#0f766e", light: "#ccfbf1" },
      },
    },
  },
  plugins: [],
};
export default config;
