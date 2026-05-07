"use client";
import { useEffect, useMemo, useState } from "react";
import {
  configureAuth,
  confirmSignUp,
  getCurrentUser,
  signIn,
  signUp,
} from "@/lib/aws/cognito";
import { createRoom } from "@/lib/api";
import { useRouter } from "next/navigation";
import snippets from "@/data/snippets.json";

type Mode = "signin" | "signup" | "confirm" | "ready";
type PickerMode = "filters" | "specific";

const FILTER_STORAGE_KEY = "codetype:host_filters";

interface StoredFilters {
  mode: PickerMode;
  language: string;
  difficulty: number;
  snippetId: string;
}

function loadFilters(defaultSnippet: string): StoredFilters {
  if (typeof window === "undefined") {
    return { mode: "filters", language: "", difficulty: 3, snippetId: defaultSnippet };
  }
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) throw new Error("no value");
    const parsed = JSON.parse(raw) as Partial<StoredFilters>;
    return {
      mode: parsed.mode === "specific" ? "specific" : "filters",
      language: parsed.language ?? "",
      difficulty:
        typeof parsed.difficulty === "number" ? parsed.difficulty : 3,
      snippetId: parsed.snippetId ?? defaultSnippet,
    };
  } catch {
    return { mode: "filters", language: "", difficulty: 3, snippetId: defaultSnippet };
  }
}

export default function HostPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const defaultSnippet = snippets[0]?.snippet_id ?? "";
  const [filters, setFilters] = useState<StoredFilters>({
    mode: "filters",
    language: "",
    difficulty: 3,
    snippetId: defaultSnippet,
  });
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setFilters(loadFilters(defaultSnippet));
  }, [defaultSnippet]);

  useEffect(() => {
    configureAuth();
    getCurrentUser().then(() => setMode("ready")).catch(() => {});
  }, []);

  const languages = useMemo(
    () => Array.from(new Set(snippets.map((s) => s.language))).sort(),
    [],
  );

  function persist(next: StoredFilters) {
    setFilters(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      if (mode === "signin") {
        await signIn({ username: email, password });
        setMode("ready");
      } else if (mode === "signup") {
        await signUp({ username: email, password, options: { userAttributes: { email } } });
        setMode("confirm");
      } else if (mode === "confirm") {
        await confirmSignUp({ username: email, confirmationCode: code });
        setMode("signin");
      }
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  async function onCreate() {
    setErr(null);
    try {
      const r =
        filters.mode === "specific"
          ? await createRoom({ snippet_id: filters.snippetId })
          : await createRoom({
              filters: {
                language: filters.language || undefined,
                difficulty: filters.difficulty,
              },
            });
      sessionStorage.setItem("is_host", "1");
      sessionStorage.setItem("display_name", "host");
      router.push(`/room/?code=${r.code}`);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">Host</h1>

      {mode !== "ready" && (
        <form onSubmit={onSubmit} className="mt-8 space-y-3">
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className={mode === "signin" ? "underline" : "text-neutral-400"}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "underline" : "text-neutral-400"}
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
            required
          />
          {mode !== "confirm" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
              required
              minLength={8}
            />
          )}
          {mode === "confirm" && (
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="confirmation code"
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
              required
            />
          )}
          <button
            type="submit"
            className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black"
          >
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Confirm"}
          </button>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </form>
      )}

      {mode === "ready" && (
        <div className="mt-8 space-y-4">
          <p>Signed in.</p>

          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className={
                filters.mode === "filters" ? "underline" : "text-neutral-400"
              }
              onClick={() => persist({ ...filters, mode: "filters" })}
            >
              Pick by filter
            </button>
            <button
              type="button"
              className={
                filters.mode === "specific" ? "underline" : "text-neutral-400"
              }
              onClick={() => persist({ ...filters, mode: "specific" })}
            >
              Pick a specific snippet
            </button>
          </div>

          {filters.mode === "filters" && (
            <>
              <label className="block text-sm">
                <span className="block mb-1 text-neutral-400">Language</span>
                <select
                  value={filters.language}
                  onChange={(e) =>
                    persist({ ...filters, language: e.target.value })
                  }
                  className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
                >
                  <option value="">Any language</option>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block mb-1 text-neutral-400">
                  Difficulty: {filters.difficulty}
                </span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={filters.difficulty}
                  onChange={(e) =>
                    persist({ ...filters, difficulty: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
            </>
          )}

          {filters.mode === "specific" && (
            <label className="block text-sm">
              <span className="block mb-1 text-neutral-400">Snippet</span>
              <select
                value={filters.snippetId}
                onChange={(e) =>
                  persist({ ...filters, snippetId: e.target.value })
                }
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
              >
                {snippets.map((s) => (
                  <option key={s.snippet_id} value={s.snippet_id}>
                    {s.title} ({s.language})
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            onClick={onCreate}
            className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black"
          >
            Create room
          </button>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
      )}
    </main>
  );
}
