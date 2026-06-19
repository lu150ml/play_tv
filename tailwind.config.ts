import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b1326",
        surface: "#0b1326",
        "surface-dim": "#0b1326",
        "surface-bright": "#31394d",
        "surface-container-lowest": "#060e20",
        "surface-container-low": "#131b2e",
        "surface-container": "#171f33",
        "surface-container-high": "#222a3d",
        "surface-container-highest": "#2d3449",
        "on-surface": "#dae2fd",
        "on-surface-variant": "#b9cacb",
        outline: "#849495",
        "outline-variant": "#3b494b",
        "surface-tint": "#00dbe9",
        primary: "#dbfcff",
        "on-primary": "#00363a",
        "primary-container": "#00f0ff",
        "on-primary-container": "#006970",
        secondary: "#d0bcff",
        "secondary-container": "#571bc1",
        "on-secondary-container": "#c4abff",
        tertiary: "#fff5de",
        "tertiary-container": "#fed639",
        error: "#ffb4ab",
        "error-container": "#93000a"
      },
      fontFamily: {
        display: ["Geist", "Inter", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem"
      },
      boxShadow: {
        glow: "0 0 24px rgba(0, 219, 233, 0.18)",
        focus: "0 0 0 3px rgba(0, 240, 255, 0.42)"
      },
      maxWidth: {
        canvas: "1440px"
      }
    }
  },
  plugins: []
} satisfies Config;
