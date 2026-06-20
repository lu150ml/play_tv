import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#141414",
        surface: "#141414",
        "surface-dim": "#0b0b0b",
        "surface-bright": "#2a2a2a",
        "surface-container-lowest": "#000000",
        "surface-container-low": "#1a1a1a",
        "surface-container": "#1f1f1f",
        "surface-container-high": "#2a2a2a",
        "surface-container-highest": "#333333",
        "on-surface": "#f5f5f5",
        "on-surface-variant": "#b3b3b3",
        outline: "#4d4d4d",
        "outline-variant": "#2e2e2e",
        "surface-tint": "#e50914",
        primary: "#e50914",
        "on-primary": "#ffffff",
        "primary-container": "#e50914",
        "on-primary-container": "#ffffff",
        secondary: "#ffffff",
        "secondary-container": "#e50914",
        "on-secondary-container": "#ffffff",
        tertiary: "#f5c518",
        "tertiary-container": "#f5c518",
        error: "#ff5b52",
        "error-container": "#7a1610"
      },
      fontFamily: {
        display: ["Inter", "Geist", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["Inter", "system-ui", "sans-serif"]
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem"
      },
      boxShadow: {
        glow: "0 12px 32px rgba(0, 0, 0, 0.65)",
        focus: "0 0 0 3px rgba(255, 255, 255, 0.85)"
      },
      maxWidth: {
        canvas: "1440px"
      }
    }
  },
  plugins: []
} satisfies Config;
