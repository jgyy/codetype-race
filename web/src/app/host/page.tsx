"use client";
import { useEffect, useState } from "react";
import {
  configureAuth,
  confirmSignUp,
  getCurrentUser,
  signIn,
  signUp,
} from "@/lib/aws/cognito";
import { createRoom } from "@/lib/api";
import { useRouter } from "next/navigation";
import snippets from "../../../../data/snippets.json";

type Mode = "signin" | "signup" | "confirm" | "ready";

export default function HostPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [snippetId, setSnippetId] = useState(snippets[0]?.snippet_id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    configureAuth();
    getCurrentUser().then(() => setMode("ready")).catch(() => {});
  }, []);

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
      const r = await createRoom(snippetId);
      sessionStorage.setItem("is_host", "1");
      sessionStorage.setItem("display_name", "host");
      router.push(`/room/${r.code}`);
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
          <label className="block text-sm">
            <span className="block mb-1 text-neutral-400">Snippet</span>
            <select
              value={snippetId}
              onChange={(e) => setSnippetId(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
            >
              {snippets.map((s) => (
                <option key={s.snippet_id} value={s.snippet_id}>
                  {s.title} ({s.language})
                </option>
              ))}
            </select>
          </label>
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
