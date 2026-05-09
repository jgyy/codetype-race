import type { Config } from "tailwindcss";

const SYSTEM_SANS = [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica",
    "Arial",
    "sans-serif",
];
const SYSTEM_MONO = [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    "Liberation Mono",
    "Courier New",
    "monospace",
];

export default {
    content: ["./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: SYSTEM_SANS,
                mono: SYSTEM_MONO,
            },
            colors: {
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
