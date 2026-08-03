import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#11110f",
        surface: "#11110f",
        "surface-dim": "#0c0c0b",
        "surface-bright": "#34312b",
        "surface-container-lowest": "#090908",
        "surface-container-low": "#161512",
        "surface-container": "#1a1916",
        "surface-container-high": "#24221e",
        "surface-container-highest": "#34312b",
        "on-surface": "#f1ede4",
        "on-surface-variant": "#a8a197",
        outline: "#8b8479",
        "outline-variant": "#403c35",
        "surface-tint": "#e85d3f",
        primary: "#e85d3f",
        "on-primary": "#fff8f2",
        "primary-container": "#e85d3f",
        "on-primary-container": "#fff8f2",
        secondary: "#d6a84b",
        "secondary-container": "#5b451d",
        "on-secondary-container": "#f8dda2",
        tertiary: "#f1ede4",
        "tertiary-container": "#d6a84b",
        error: "#ffb4ab",
        "error-container": "#93000a"
      },
      fontFamily: {
        display: ["Bricolage Grotesque", "Inter", "sans-serif"],
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
        glow: "0 12px 32px rgba(0, 0, 0, 0.28)",
        focus: "0 0 0 3px rgba(232, 93, 63, 0.48)"
      },
      maxWidth: {
        canvas: "1440px"
      }
    }
  },
  plugins: []
} satisfies Config;
