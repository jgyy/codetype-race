"use client";

export function JoinCodeBadge({ code }: { code: string }) {
  return (
    <span className="font-mono text-emerald-400" data-testid="join-code">
      {code}
    </span>
  );
}
