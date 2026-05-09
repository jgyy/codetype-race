"use client";
import { useEffect, useMemo, useState } from "react";
import {
  configureAuth,
  confirmSignUp,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from "@/lib/aws/cognito";
import { createRoom, friendlyMessage } from "@/lib/api";
import { TeamSetup, type TeamSetupValue } from "@/components/team/TeamSetup";
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
  const [team, setTeam] = useState<TeamSetupValue>({ enabled: false, teams: [] });
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setFilters(loadFilters(defaultSnippet));
  }, [defaultSnippet]);

  useEffect(() => {
    configureAuth();
    getCurrentUser()
      .then((u) => {
        setMode("ready");
        setHostUserId((u as { userId?: string }).userId ?? null);
      })
      .catch(() => {});
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
    } catch (e) {
      setErr(friendlyMessage(e));
    }
  }

  async function onSignOut() {
    setErr(null);
    try {
      await signOut();
    } catch (e) {
      setErr(friendlyMessage(e));
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("is_host");
      sessionStorage.removeItem("display_name");
      sessionStorage.removeItem("role");
    }
    setHostUserId(null);
    setEmail("");
    setPassword("");
    setCode("");
    setMode("signin");
  }

  async function onCreate() {
    setErr(null);
    try {
      const teamOpts =
        team.enabled && team.teams.length >= 2
          ? { mode: "team" as const, teams: team.teams }
          : {};
      const base =
        filters.mode === "specific"
          ? { snippet_id: filters.snippetId }
          : {
              filters: {
                language: filters.language || undefined,
                difficulty: filters.difficulty,
              },
            };
      const r = await createRoom({ ...base, ...teamOpts });
      sessionStorage.setItem("is_host", "1");
      sessionStorage.setItem("display_name", "host");
      router.push(`/room/?code=${r.code}`);
    } catch (e) {
      setErr(friendlyMessage(e));
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
          <div className="flex items-center justify-between">
            <p>Signed in.</p>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:border-neutral-500"
            >
              Sign out
            </button>
          </div>

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

          <TeamSetup
            value={team}
            onChange={setTeam}
            hostUserId={hostUserId}
          />

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
