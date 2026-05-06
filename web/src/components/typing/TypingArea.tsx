"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Load-bearing module: char-span render strategy.
// Each character is one <span>; React reconciles only the spans whose
// className changed. ~N nodes for N≤800 — well within React's comfort zone.
// Rejected alternative: single <pre> with overlay (cursor positioning
// fights monospaced kerning).

interface Props {
  snippet: string;
  disabled?: boolean;
  onProgress?: (state: {
    progress: number;
    chars_typed: number;
    errors: number;
  }) => void;
  onFinish?: (state: { chars_typed: number; errors: number }) => void;
}

export function TypingArea({ snippet, disabled, onProgress, onFinish }: Props) {
  const [typed, setTyped] = useState("");
  const finishedRef = useRef(false);

  const errors = useMemo(() => {
    let e = 0;
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] !== snippet[i]) e++;
    }
    return e;
  }, [typed, snippet]);

  const charsTyped = typed.length;
  const progress = Math.min(1, charsTyped / snippet.length);

  useEffect(() => {
    onProgress?.({ progress, chars_typed: charsTyped, errors });
    if (
      !finishedRef.current &&
      charsTyped >= snippet.length
    ) {
      finishedRef.current = true;
      onFinish?.({ chars_typed: charsTyped, errors });
    }
  }, [progress, charsTyped, errors, snippet.length, onProgress, onFinish]);

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        setTyped((t) => t.slice(0, -1));
        return;
      }
      if (e.key.length !== 1 && e.key !== "Enter" && e.key !== "Tab") return;
      e.preventDefault();
      const ch = e.key === "Enter" ? "\n" : e.key === "Tab" ? "  " : e.key;
      setTyped((t) =>
        t.length >= snippet.length ? t : t + ch.slice(0, snippet.length - t.length),
      );
    },
    [disabled, snippet.length],
  );

  return (
    <div
      tabIndex={0}
      onKeyDown={onKey}
      className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 font-mono text-base leading-relaxed outline-none focus:border-emerald-500"
      aria-label="typing area"
    >
      <pre className="whitespace-pre-wrap break-words">
        {snippet.split("").map((ch, i) => {
          const t = typed[i];
          let cls = "text-neutral-500"; // pending
          if (i === typed.length) cls = "border-l-2 border-emerald-400 text-neutral-500";
          else if (t === undefined) cls = "text-neutral-500";
          else if (t === ch) cls = "text-emerald-300";
          else cls = "bg-red-900/40 text-red-300";
          return (
            <span key={i} className={cls}>
              {ch === "\n" ? "↵\n" : ch}
            </span>
          );
        })}
      </pre>
      <div className="mt-2 text-xs text-neutral-500">
        {charsTyped}/{snippet.length} chars · {errors} errors
      </div>
    </div>
  );
}
