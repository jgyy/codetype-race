/**
 * WCAG 2.2 contrast audit. Pure-JS, zero deps. Asserts that every
 * declared text-on-background pair meets AA: 4.5:1 normal text, 3:1 large/UI.
 *
 * The pair list mirrors the tokens in tailwind.config.ts and globals.css.
 * When you add a new theme color used for text or UI, add it here.
 *
 * Usage:
 *   bun run web/scripts/audit-contrast.ts          # CI gate; exits non-zero on fail
 *   imported by web/tests/audit-contrast.test.ts   # unit fixtures
 */

export type Hex = `#${string}`;
export type Pair = {
  name: string;
  fg: Hex;
  bg: Hex;
  /** AA "large/UI" threshold (3:1) instead of normal-text 4.5:1. */
  large?: boolean;
};

const SRGB_LINEAR_THRESHOLD = 0.03928;

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= SRGB_LINEAR_THRESHOLD ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function parseHex(hex: Hex): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) throw new Error(`bad hex: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function relativeLuminance(hex: Hex): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function threshold(p: Pair): number {
  return p.large ? 3 : 4.5;
}

export function audit(pairs: Pair[]): { ok: boolean; failures: Array<Pair & { ratio: number }> } {
  const failures: Array<Pair & { ratio: number }> = [];
  for (const p of pairs) {
    const ratio = contrastRatio(p.fg, p.bg);
    if (ratio + 1e-6 < threshold(p)) failures.push({ ...p, ratio });
  }
  return { ok: failures.length === 0, failures };
}

/** Project-wide pair manifest. Keep in sync with tailwind.config.ts + globals.css. */
export const PAIRS: Pair[] = [
  // Default dark theme.
  { name: "body text on body bg", fg: "#ededed", bg: "#0a0a0a" },
  { name: "focus ring on body bg", fg: "#63b3ed", bg: "#0a0a0a", large: true },
  // High-contrast theme (data-theme="hc").
  { name: "hc fg on hc bg", fg: "#ffffff", bg: "#000000" },
  { name: "hc accent on hc bg", fg: "#ffd400", bg: "#000000" },
];

if (import.meta.main) {
  const { ok, failures } = audit(PAIRS);
  for (const p of PAIRS) {
    const r = contrastRatio(p.fg, p.bg).toFixed(2);
    const t = threshold(p);
    const status = parseFloat(r) >= t ? "PASS" : "FAIL";
    console.log(`  [${status}] ${r}:1  (need ${t}:1)  ${p.name}  ${p.fg} on ${p.bg}`);
  }
  if (!ok) {
    console.error(`\ncontrast audit failed: ${failures.length} pair(s) below threshold`);
    process.exit(1);
  }
  console.log(`\ncontrast audit passed: ${PAIRS.length} pair(s)`);
}
