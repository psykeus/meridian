import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-app": "#090d09",
        "bg-panel": "#0f140f",
        "bg-card": "#151c15",
        "bg-hover": "#1c261c",
        border: "#2a3a2a",
        "green-primary": "#00e676",
        "cyan-info": "#00bcd4",
        "red-critical": "#ff5252",
        "orange-warning": "#ff9800",
        "yellow-caution": "#ffeb3b",
        "purple-ai": "#7c4dff",
        "blue-track": "#448aff",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", "14px"],
        xs: ["11px", "16px"],
        sm: ["12px", "18px"],
        base: ["13px", "20px"],
        md: ["14px", "20px"],
      },
    },
  },
  plugins: [],
} satisfies Config;
