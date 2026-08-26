import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--playtv-background) / <alpha-value>)",
        surface: "rgb(var(--playtv-background) / <alpha-value>)",
        "surface-dim": "rgb(var(--playtv-background) / <alpha-value>)",
        "surface-bright": "rgb(49 57 77 / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--playtv-surface-lowest) / <alpha-value>)",
        "surface-container-low": "rgb(var(--playtv-surface-low) / <alpha-value>)",
        "surface-container": "rgb(var(--playtv-surface) / <alpha-value>)",
        "surface-container-high": "rgb(var(--playtv-surface-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--playtv-surface-highest) / <alpha-value>)",
        "on-surface": "rgb(var(--playtv-on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--playtv-on-surface-variant) / <alpha-value>)",
        outline: "rgb(var(--playtv-outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--playtv-outline-variant) / <alpha-value>)",
        "surface-tint": "rgb(var(--playtv-cyan-dark) / <alpha-value>)",
        primary: "rgb(219 252 255 / <alpha-value>)",
        "on-primary": "rgb(var(--playtv-on-cyan) / <alpha-value>)",
        "primary-container": "rgb(var(--playtv-cyan) / <alpha-value>)",
        "on-primary-container": "rgb(0 105 112 / <alpha-value>)",
        secondary: "rgb(var(--playtv-purple) / <alpha-value>)",
        "secondary-container": "rgb(var(--playtv-purple-container) / <alpha-value>)",
        "on-secondary-container": "rgb(196 171 255 / <alpha-value>)",
        tertiary: "rgb(255 245 222 / <alpha-value>)",
        "tertiary-container": "rgb(var(--playtv-yellow) / <alpha-value>)",
        error: "rgb(var(--playtv-error) / <alpha-value>)",
        "error-container": "rgb(var(--playtv-error-container) / <alpha-value>)"
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
        glow: "var(--playtv-glow)",
        focus: "var(--playtv-focus-ring)"
      },
      maxWidth: {
        canvas: "1440px"
      }
    }
  },
  plugins: []
} satisfies Config;
