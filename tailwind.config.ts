import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" }, screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        forest: {
          50: "#EEF7F1", 100: "#D6EEDD", 200: "#ADDCBC", 300: "#77C291", 400: "#3FA466",
          500: "#1A9147", 600: "#12803C", 700: "#0E6A31", 800: "#0C5328", 900: "#0A3F1F", 950: "#062814",
        },
        sand: {
          50: "#FAF8F4", 100: "#F4F1EA", 200: "#E8E3D8", 300: "#D6CFBF", 400: "#B4AA95",
          500: "#8E846F", 600: "#6D6553", 700: "#524C3F", 800: "#36322A", 900: "#1E1C17",
        },
        mint: { DEFAULT: "#F2F9F4", line: "#CFE8D7" },
        ink: { DEFAULT: "#15211A", soft: "#3C4A41", muted: "#66716A" },
        amber: { 400: "#E5AE45", 500: "#D99A2B", 600: "#B57D1C" },
        clay: { 50: "#FBEFEA", 500: "#B5583A", 600: "#9A4429", 700: "#7C3520" },
      },
      fontFamily: {
        display: ['"Red Hat Display Variable"', "system-ui", "sans-serif"],
        sans: ['"Red Hat Text Variable"', "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: { DEFAULT: "6px", sm: "4px", md: "6px", lg: "10px", xl: "14px" },
      boxShadow: {
        card: "0 1px 2px rgba(21,33,26,.06), 0 1px 1px rgba(21,33,26,.04)",
        pop: "0 10px 30px -12px rgba(21,33,26,.25), 0 2px 6px rgba(21,33,26,.06)",
      },
      maxWidth: { prose: "68ch" },
    },
  },
  plugins: [],
} satisfies Config;
