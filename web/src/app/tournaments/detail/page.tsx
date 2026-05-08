"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  friendlyMessage,
  getTournament,
  registerForTournament,
  withdrawFromTournament,
  type TournamentDetail,
} from "@/lib/api";

function Timer({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(target).getTime() - now);
  if (ms === 0) return <span className="text-neutral-500">closed</span>;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="font-mono text-emerald-400">
      {h.toString().padStart(2, "0")}:{m.toString().padStart(2, "0")}:
      {sec.toString().padStart(2, "0")}
    </span>
  );
}

function DetailView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [t, setT] = useState<TournamentDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!id) return;
    try {
      setT(await getTournament(id));
    } catch (e) {
      setErr(friendlyMessage(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, [id]);

  async function onRegister() {
    setBusy(true);
    setErr(null);
    try {
      await registerForTournament(id);
      await refresh();
    } catch (e) {
      setErr(friendlyMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    setErr(null);
    try {
      await withdrawFromTournament(id);
      await refresh();
    } catch (e) {
      setErr(friendlyMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!id) return <p className="p-6 text-sm">Missing tournament id.</p>;
  if (!t && !err) return <p className="p-6 text-sm">Loading…</p>;
  if (err) return <p className="p-6 text-sm text-red-400">{err}</p>;
  if (!t) return null;

  const canRegister = t.status === "registering";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <Link
          href="/tournaments"
          className="text-sm text-neutral-400 hover:underline"
        >
          ← All tournaments
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase text-neutral-500">Status</dt>
          <dd className="font-mono">{t.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-neutral-500">Size</dt>
          <dd className="font-mono">
            {t.entrantCount} / {t.size}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-neutral-500">Language</dt>
          <dd className="font-mono">{t.language}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-neutral-500">Starts</dt>
          <dd className="font-mono">
            {new Date(t.startsAt).toLocaleString()}
          </dd>
        </div>
        {canRegister && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-neutral-500">
              Registration closes in
            </dt>
            <dd>
              <Timer target={t.registrationClosesAt} />
            </dd>
          </div>
        )}
      </dl>

      <div className="flex gap-2">
        <Link
          href={`/tournaments/bracket?id=${encodeURIComponent(t.id)}`}
          className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:border-neutral-500"
        >
          View bracket
        </Link>
        {canRegister && (
          <>
            <button
              type="button"
              onClick={onRegister}
              disabled={busy || t.entrantCount >= t.size}
              className="rounded bg-emerald-600 px-3 py-1 text-sm text-emerald-50 hover:bg-emerald-500 disabled:opacity-50"
            >
              Register
            </button>
            <button
              type="button"
              onClick={onWithdraw}
              disabled={busy}
              className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:border-neutral-500"
            >
              Withdraw
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <DetailView />
    </Suspense>
  );
}
