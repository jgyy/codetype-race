"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCurrentUser } from "@/lib/aws/cognito";
import {
  createGuildInvite,
  friendlyMessage,
  getGuild,
  getGuildLeaderboard,
  getGuildMembers,
  leaveOrKickGuild,
  type Guild,
  type GuildLeaderboardEntry,
  type GuildMember,
} from "@/lib/api";

type Tab = "members" | "leaderboard";

function GuildDetailInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [guild, setGuild] = useState<Guild | null>(null);
  const [viewerRole, setViewerRole] = useState<GuildMember["role"] | null>(null);
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [board, setBoard] = useState<GuildLeaderboardEntry[]>([]);
  const [tab, setTab] = useState<Tab>("members");
  const [err, setErr] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setMyId((u as { userId?: string }).userId ?? null))
      .catch(() => setMyId(null));
  }, []);

  async function refresh() {
    setErr(null);
    try {
      const detail = await getGuild(id);
      setGuild(detail.guild);
      setViewerRole(detail.viewer_role);
      const [m, lb] = await Promise.all([
        getGuildMembers(id),
        getGuildLeaderboard(id),
      ]);
      setMembers(m);
      setBoard(lb.entries);
    } catch (e) {
      setErr(friendlyMessage(e));
    }
  }

  useEffect(() => {
    if (id) refresh();
  }, [id]);

  if (!guild) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-zinc-100">
        {err ?? "Loading..."}
      </main>
    );
  }

  const canInvite = viewerRole === "owner" || viewerRole === "mod";

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-100">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">{guild.name}</h1>
        <p className="text-sm text-zinc-500">
          /{guild.slug} • {guild.visibility} • {guild.memberCount} members
        </p>
        {guild.description ? (
          <p className="mt-2 text-sm text-zinc-300">{guild.description}</p>
        ) : null}
      </header>

      {err ? (
        <div className="mb-4 rounded border border-red-800 bg-red-950/40 p-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {canInvite ? (
        <section className="mb-4">
          <button
            className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
            onClick={async () => {
              setErr(null);
              try {
                const r = await createGuildInvite(id);
                setInvite(r.code);
              } catch (e) {
                setErr(friendlyMessage(e));
              }
            }}
          >
            Create invite
          </button>
          {invite ? (
            <p className="mt-2 text-sm text-zinc-300">
              Invite code:{" "}
              <code className="rounded bg-zinc-900 px-2 py-1">{invite}</code>{" "}
              <span className="text-zinc-500">(expires in 7 days)</span>
            </p>
          ) : null}
        </section>
      ) : null}

      <nav className="mb-3 flex gap-2 text-sm">
        {(["members", "leaderboard"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 ${
              tab === t
                ? "bg-emerald-700"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "members" ? (
        <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between p-2 text-sm"
            >
              <span>
                {m.display_name}{" "}
                <span className="text-zinc-500">
                  • {m.role} • {m.rating}
                </span>
              </span>
              {viewerRole &&
              (m.user_id === guild.ownerId
                ? false
                : viewerRole === "owner" ||
                  (viewerRole === "mod" && m.role === "member")) ? (
                <button
                  className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
                  onClick={async () => {
                    try {
                      await leaveOrKickGuild(id, m.user_id);
                      await refresh();
                    } catch (e) {
                      setErr(friendlyMessage(e));
                    }
                  }}
                >
                  Kick
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <ol className="divide-y divide-zinc-800 rounded border border-zinc-800">
          {board.map((row) => (
            <li
              key={row.user_id}
              className="flex items-center justify-between p-2 text-sm"
            >
              <span>
                <span className="text-zinc-500">#{row.rank}</span>{" "}
                {row.display_name}
              </span>
              <span className="text-zinc-300">{row.rating}</span>
            </li>
          ))}
        </ol>
      )}

      {viewerRole && viewerRole !== "owner" && myId ? (
        <div className="mt-6">
          <button
            className="rounded bg-red-900 px-3 py-1 text-sm hover:bg-red-800"
            onClick={async () => {
              if (!confirm("Leave this guild?")) return;
              try {
                await leaveOrKickGuild(id, myId);
              } catch (e) {
                setErr(friendlyMessage(e));
                return;
              }
              window.location.href = "/guilds";
            }}
          >
            Leave guild
          </button>
        </div>
      ) : null}
    </main>
  );
}

export default function GuildDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl p-6 text-zinc-100">Loading...</main>
      }
    >
      <GuildDetailInner />
    </Suspense>
  );
}
