"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { submitSnippet } from "@/lib/api";
import { getCurrentUser } from "@/lib/aws/cognito";

export default function SubmitSnippetPage() {
  const [authed, setAuthed] = useState(false);
  const [language, setLanguage] = useState("typescript");
  const [difficulty, setDifficulty] = useState(3);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setStatus("saving");
    try {
      await submitSnippet({
        language: language.trim(),
        difficulty,
        title: title.trim(),
        text,
        source: source.trim() || undefined,
      });
      setStatus("ok");
      setTitle("");
      setText("");
      setSource("");
    } catch (e: any) {
      setStatus("err");
      setErr(e.message);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Submit a snippet</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:underline">
          Home
        </Link>
      </header>

      {!authed && (
        <p className="text-sm text-amber-400">
          Sign in via /host first to submit. Submissions are rate-limited
          (5/day).
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="block text-neutral-400">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={80}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="block text-neutral-400">Language</span>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            required
            list="language-options"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          />
          <datalist id="language-options">
            <option value="typescript" />
            <option value="javascript" />
            <option value="python" />
            <option value="go" />
            <option value="rust" />
          </datalist>
        </label>
        <label className="block text-sm">
          <span className="block text-neutral-400">
            Difficulty: {difficulty}
          </span>
          <input
            type="range"
            min={1}
            max={5}
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="flex items-center justify-between text-neutral-400">
            <span>Code</span>
            <span className="text-xs">
              {text.length}/2000 chars
            </span>
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            required
            minLength={20}
            rows={10}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="block text-neutral-400">
            Source URL (optional, for attribution)
          </span>
          <input
            type="url"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          />
        </label>

        {text.length >= 20 && (
          <section>
            <p className="text-xs uppercase text-neutral-500">Preview</p>
            <pre className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm font-mono whitespace-pre-wrap">
              {text}
            </pre>
          </section>
        )}

        <button
          type="submit"
          disabled={!authed || status === "saving"}
          className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          {status === "saving" ? "Submitting…" : "Submit for review"}
        </button>

        {status === "ok" && (
          <p className="text-sm text-emerald-400">
            Submitted. An admin will review it shortly.
          </p>
        )}
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>
    </main>
  );
}
