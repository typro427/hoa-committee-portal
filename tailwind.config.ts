import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f0f4fa", 100: "#dde6f3", 200: "#bccde6", 300: "#8faacf",
          400: "#5f80b3", 500: "#3f6198", 600: "#2f4b7c", 700: "#243b63",
          800: "#1c2f50", 900: "#152340", 950: "#0d1629",
        },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
