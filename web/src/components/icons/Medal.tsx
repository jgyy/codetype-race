/**
 * Phase 16.12 — inline SVG medal/trophy glyphs.
 *
 * Replaces the system-emoji equivalents (🥇🥈🥉🏆) so podium and bracket
 * winner indicators render identically across macOS, Windows, Android,
 * and Linux. Each glyph is a single self-contained SVG with currentColor
 * accents, an aria-label for assistive tech, and presentational role
 * when wrapped by a labelled parent.
 *
 * Sizing follows the parent's font-size via `1em` so they slot into text
 * runs cleanly. No external assets, no payload — the glyph is part of
 * the component bundle.
 */

const places = ["1st", "2nd", "3rd"] as const;
const ribbonColors: Record<MedalPlace, string> = {
    1: "#fbbf24", // gold
    2: "#cbd5e1", // silver
    3: "#cd7f32", // bronze
};

export type MedalPlace = 1 | 2 | 3;

export function Medal({ place, className = "" }: { place: MedalPlace; className?: string }) {
    const fill = ribbonColors[place];
    const label = `${places[place - 1]} place`;
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            role="img"
            aria-label={label}
            className={className}
        >
            <path
                d="M7 2 L9 8 L15 8 L17 2 Z"
                fill="#dc2626"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeLinejoin="round"
            />
            <circle cx="12" cy="15" r="6" fill={fill} stroke="#92400e" strokeWidth="0.6" />
            <text
                x="12"
                y="17.6"
                textAnchor="middle"
                fontSize="6.5"
                fontWeight="700"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fill="#78350f"
            >
                {place}
            </text>
        </svg>
    );
}

export function Trophy({ className = "" }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            role="img"
            aria-label="Winner"
            className={className}
        >
            <path
                d="M6 3 H18 V8 A6 6 0 0 1 6 8 Z"
                fill="#fbbf24"
                stroke="#92400e"
                strokeWidth="0.6"
            />
            <path
                d="M3 4 H6 V7 A3 3 0 0 1 3 7 Z M21 4 H18 V7 A3 3 0 0 0 21 7 Z"
                fill="#fbbf24"
                stroke="#92400e"
                strokeWidth="0.6"
            />
            <rect x="10" y="13" width="4" height="4" fill="#fbbf24" stroke="#92400e" strokeWidth="0.6" />
            <rect x="7" y="17" width="10" height="3" rx="0.5" fill="#92400e" />
        </svg>
    );
}
