import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Phase 12 a11y tokens. Pairs validated by
        // web/scripts/audit-contrast.ts (added in slice 2).
        focus: "#63b3ed",
        contrast: {
          bg: "#000000",
          fg: "#ffffff",
          accent: "#ffd400",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
