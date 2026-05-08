import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#7657FF", soft: "#A18BFF" },
        accent: { DEFAULT: "#FF8C42" },
        ink: { 950: "#0a0c10", 900: "#13161d", 700: "#2a2f3d", 500: "#6f7384" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
