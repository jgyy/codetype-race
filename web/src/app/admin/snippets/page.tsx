"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listPendingSnippets, reviewSnippet, friendlyMessage } from "@/lib/api";

interface Pending {
  snippet_id: string;
  language: string;
  title: string;
  code: string;
  difficulty?: number;
  submitted_by?: string;
  source?: string;
}

export default function AdminSnippetsPage() {
  const [items, setItems] = useState<Pending[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await listPendingSnippets();
      setItems((r.items as Pending[]) ?? []);
    } catch (e) {
      setErr(friendlyMessage(e));
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function decide(
    id: string,
    decision: "approve" | "reject",
    reason?: string,
  ) {
    setBusy(id);
    try {
      await reviewSnippet(id, decision, reason);
      setItems((prev) => (prev ?? []).filter((s) => s.snippet_id !== id));
    } catch (e) {
      setErr(friendlyMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pending snippets</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:underline">
          Home
        </Link>
      </header>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {items === null && !err && (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}
      {items && items.length === 0 && (
        <p className="text-sm text-neutral-500">Queue is empty.</p>
      )}

      <ul className="space-y-3">
        {(items ?? []).map((s) => (
          <li
            key={s.snippet_id}
            className="space-y-2 rounded border border-neutral-800 bg-neutral-900 p-3"
          >
            <div className="flex items-center justify-between text-sm">
              <span>
                <span className="font-mono text-emerald-400">
                  {s.language}
                </span>{" "}
                · {s.title}
                {s.difficulty ? ` · diff ${s.difficulty}` : ""}
              </span>
              <span className="text-xs text-neutral-500">
                by {s.submitted_by ?? "?"}
              </span>
            </div>
            <pre className="max-h-60 overflow-auto rounded bg-neutral-950 p-2 text-xs font-mono whitespace-pre-wrap">
              {s.code}
            </pre>
            {s.source && (
              <p className="text-xs text-neutral-500">source: {s.source}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy === s.snippet_id}
                onClick={() => decide(s.snippet_id, "approve")}
                className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy === s.snippet_id}
                onClick={() => {
                  const reason = window.prompt("Reject reason?") ?? undefined;
                  decide(s.snippet_id, "reject", reason);
                }}
                className="rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
