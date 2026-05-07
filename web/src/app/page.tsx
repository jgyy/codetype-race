"use client";
import Link from "next/link";
import { useState } from "react";
import { joinRoom, friendlyMessage } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function Home() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [asSpectator, setAsSpectator] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await joinRoom(code, name, asSpectator ? "spectator" : "racer");
      sessionStorage.setItem("display_name", name);
      sessionStorage.setItem("role", asSpectator ? "spectator" : "racer");
      router.push(`/room/?code=${code.toUpperCase()}`);
    } catch (e) {
      setErr(friendlyMessage(e));
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-4xl font-bold">CodeType Race</h1>
      <p className="mt-2 text-neutral-400">
        Real-time multiplayer typing race for code snippets.
      </p>

      <section className="mt-10 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-xl font-semibold">Join a room</h2>
        <form onSubmit={onJoin} className="mt-4 space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono uppercase tracking-widest"
            maxLength={6}
            required
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="display name"
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
            maxLength={24}
            required
          />
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={asSpectator}
              onChange={(e) => setAsSpectator(e.target.checked)}
            />
            Join as spectator
          </label>
          <button
            type="submit"
            className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
          >
            Join
          </button>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-xl font-semibold">Host a room</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Sign in to create a room and invite players.
        </p>
        <Link
          href="/host"
          className="mt-4 inline-block rounded border border-neutral-700 px-4 py-2 hover:bg-neutral-800"
        >
          Sign in →
        </Link>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-xl font-semibold">Practice solo</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Type a random snippet without joining a room.
        </p>
        <Link
          href="/practice"
          className="mt-4 inline-block rounded border border-neutral-700 px-4 py-2 hover:bg-neutral-800"
        >
          Start practice →
        </Link>
      </section>
    </main>
  );
}
