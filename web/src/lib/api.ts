import { HTTP_API } from "./config";
import { getIdToken } from "./aws/cognito";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const FRIENDLY: Record<string, (status: number) => string> = {
  UNAUTHORIZED: () => "You need to sign in to do that.",
  FORBIDDEN: () => "You don’t have permission for that action.",
  NOT_FOUND: () => "We couldn’t find what you were looking for.",
  CONFLICT: () => "That action conflicts with the current state — try again.",
  RATE_LIMITED: () => "You’re going too fast. Please slow down.",
  BAD_REQUEST: () => "The request was invalid.",
  INTERNAL: () => "Something went wrong on our end. Please try again.",
};

export function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const f = FRIENDLY[err.code];
    if (f) return f(err.status);
    return err.message || `Request failed (${err.status})`;
  }
  if (err instanceof TypeError) {
    // fetch throws TypeError on network failure / CORS / offline.
    return "Network error — check your connection and try again.";
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error.";
}

async function req(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.auth) {
    const tok = await getIdToken();
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
  }
  if (!HTTP_API) {
    throw new Error(
      "API endpoint is not configured. Set NEXT_PUBLIC_HTTP_API in web/.env.local and restart the dev server.",
    );
  }
  const r = await fetch(`${HTTP_API}${path}`, { ...init, headers });
  return r;
}

async function failWith(r: Response): Promise<never> {
  const ct = r.headers.get("content-type") ?? "";
  let code = "HTTP_ERROR";
  let message = r.statusText || "Request failed";
  let details: unknown;
  if (ct.includes("application/json")) {
    try {
      const body = await r.json();
      // Server contract: { error: { code, message, details? } }.
      // Fall back to flat shapes for resilience.
      const e = body?.error;
      if (e && typeof e === "object") {
        if (typeof e.code === "string") code = e.code;
        if (typeof e.message === "string") message = e.message;
        details = (e as { details?: unknown }).details;
      } else if (typeof body?.message === "string") {
        message = body.message;
      } else if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // non-JSON body — keep statusText fallback
    }
  }
  throw new ApiError(r.status, code, message, details);
}

export interface CreateRoomOptions {
  snippet_id?: string;
  filters?: { language?: string; difficulty?: number };
  previous_room_id?: string;
  new_snippet?: boolean;
}

export async function createRoom(opts: string | CreateRoomOptions) {
  const body = typeof opts === "string" ? { snippet_id: opts } : opts;
  const r = await req("/rooms", {
    method: "POST",
    auth: true,
    body: JSON.stringify(body),
  });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ room_id: string; code: string }>;
}

export async function getRandomSnippet(filters: {
  language?: string;
  difficulty?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (filters.language) qs.set("language", filters.language);
  if (filters.difficulty !== undefined)
    qs.set("difficulty", String(filters.difficulty));
  const path = qs.toString()
    ? `/snippets/random?${qs.toString()}`
    : "/snippets/random";
  const r = await req(path);
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function joinRoom(
  code: string,
  display_name: string,
  role: "racer" | "spectator" = "racer",
) {
  const r = await req("/rooms/join", {
    method: "POST",
    body: JSON.stringify({ code, display_name, role }),
  });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    room_id: string;
    snippet_id: string;
    status: string;
  }>;
}

export async function getRoom(code: string) {
  const r = await req(`/rooms/${code}`);
  if (!r.ok) await failWith(r);
  return r.json();
}

export interface PracticeRunBody {
  snippet_id: string;
  chars_typed: number;
  errors: number;
  duration_ms: number;
  save: boolean;
}

export async function postPracticeRun(body: PracticeRunBody) {
  const r = await req("/history/practice", {
    method: "POST",
    auth: body.save,
    body: JSON.stringify(body),
  });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    finished_at: number;
    gross_wpm: number;
    net_wpm: number;
    accuracy: number;
    scaled_wpm: number;
    saved: boolean;
  }>;
}

export async function getMe() {
  const r = await req("/users/me", { auth: true });
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function getUserProfile(userId: string) {
  const r = await req(`/users/${encodeURIComponent(userId)}`);
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function getLeaderboard(opts: {
  lang?: string;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (opts.lang) qs.set("lang", opts.lang);
  if (opts.limit !== undefined) qs.set("limit", String(opts.limit));
  const path = qs.toString() ? `/leaderboard?${qs.toString()}` : "/leaderboard";
  const r = await req(path);
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function getDaily() {
  const r = await req("/daily");
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    date: string;
    snippet: {
      snippet_id: string;
      language: string;
      title: string;
      code: string;
      length: number;
      difficulty?: number;
    };
  }>;
}

export async function postDailySubmit(body: {
  date: string;
  snippet_id: string;
  chars_typed: number;
  errors: number;
  duration_ms: number;
}) {
  const r = await req("/daily/submit", {
    method: "POST",
    auth: true,
    body: JSON.stringify(body),
  });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    improved: boolean;
    best_wpm: number;
    rank: number;
  }>;
}

export async function getDailyLeaderboard(opts: {
  date?: string;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (opts.date) qs.set("date", opts.date);
  if (opts.limit !== undefined) qs.set("limit", String(opts.limit));
  const path = qs.toString() ? `/daily/leaderboard?${qs}` : "/daily/leaderboard";
  const r = await req(path);
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    date: string;
    entries: Array<{
      user_id: string;
      display_name: string;
      scaled_wpm: number;
      finished_at: number;
    }>;
  }>;
}

export async function submitSnippet(body: {
  language: string;
  difficulty: number;
  title: string;
  text: string;
  source?: string;
}) {
  const r = await req("/snippets", {
    method: "POST",
    auth: true,
    body: JSON.stringify(body),
  });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ snippet_id: string; status: "pending" }>;
}

export async function listPendingSnippets() {
  const r = await req("/admin/snippets/pending", { auth: true });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ items: any[] }>;
}

export async function reviewSnippet(
  snippetId: string,
  decision: "approve" | "reject",
  reason?: string,
) {
  const r = await req(
    `/admin/snippets/${encodeURIComponent(snippetId)}/${decision}`,
    {
      method: "POST",
      auth: true,
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ snippet_id: string; status: string }>;
}

export async function getReplayUploadUrl(roomId: string) {
  const r = await req(`/rooms/${encodeURIComponent(roomId)}/replay/upload-url`);
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ upload_url: string; key: string }>;
}

export async function getReplay(roomId: string) {
  const r = await req(`/rooms/${encodeURIComponent(roomId)}/replay`);
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ download_url: string; key: string }>;
}

export async function uploadReplay(uploadUrl: string, replay: unknown) {
  const r = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(replay),
  });
  if (!r.ok) throw new Error(`replay upload failed: ${r.status}`);
}

// ─── Phase 09 — tournaments + seasons ────────────────────────────────────────

export interface TournamentSummary {
  id: string;
  name: string;
  size: number;
  language: string;
  difficulty: string;
  status: string;
  startsAt: string;
  registrationClosesAt: string;
  seasonId: string;
  hostId: string;
  createdAt: string;
  winnerId: string | null;
}

export interface TournamentDetail extends TournamentSummary {
  entrantCount: number;
}

export interface BracketMatch {
  tournId: string;
  round: number;
  slot: number;
  status: "pending" | "live" | "done" | "bye" | "flagged";
  players: [string | null, string | null];
  winnerId: string | null;
  roomId: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  flagged: boolean;
}

export async function listTournaments(status = "registering") {
  const r = await req(`/tournaments?status=${encodeURIComponent(status)}`);
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ tournaments: TournamentSummary[] }>;
}

export async function getTournament(id: string) {
  const r = await req(`/tournaments/${encodeURIComponent(id)}`);
  if (!r.ok) await failWith(r);
  return r.json() as Promise<TournamentDetail>;
}

export async function getTournamentBracket(id: string) {
  const r = await req(`/tournaments/${encodeURIComponent(id)}/bracket`);
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    tournId: string;
    size: number;
    matches: BracketMatch[];
  }>;
}

export async function registerForTournament(id: string) {
  const r = await req(`/tournaments/${encodeURIComponent(id)}/register`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({}),
  });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ ok: true; seedSnapshot: number }>;
}

export async function withdrawFromTournament(id: string) {
  const r = await req(`/tournaments/${encodeURIComponent(id)}/register`, {
    method: "DELETE",
    auth: true,
  });
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function getCurrentSeason() {
  const r = await req("/seasons/current");
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    season: {
      id: string;
      status: string;
      startsAt: string;
      endsAt: string;
    } | null;
    daysRemaining: number | null;
  }>;
}

export async function getSeasonLeaderboard(id: string, lang = "*") {
  const r = await req(
    `/seasons/${encodeURIComponent(id)}/leaderboard?lang=${encodeURIComponent(lang)}`,
  );
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{
    seasonId: string;
    language: string;
    rows: Array<{
      seasonId: string;
      language: string;
      rank: number;
      userId: string;
      displayName: string;
      rating: number;
      racesPlayed: number;
    }>;
  }>;
}

export async function listHistory() {
  const r = await req("/history", { auth: true });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ results: any[] }>;
}

// ─── Phase 10 (slice 1): friends + presence ──────────────────────────
export interface FriendSummary {
  user_id: string;
  display_name: string;
  rating: number;
  presence: "online" | "offline";
  accepted_at?: string;
}

export interface FriendRequestSummary {
  from_user_id: string;
  display_name: string;
  rating: number;
  created_at: string;
}

export interface UserSearchHit {
  user_id: string;
  display_name: string;
  rating: number;
}

export async function searchUsers(q: string): Promise<UserSearchHit[]> {
  const r = await req(`/users/search?q=${encodeURIComponent(q)}`, { auth: true });
  if (!r.ok) await failWith(r);
  const body = (await r.json()) as { results: UserSearchHit[] };
  return body.results;
}

export async function listFriends(): Promise<FriendSummary[]> {
  const r = await req("/me/friends", { auth: true });
  if (!r.ok) await failWith(r);
  const body = (await r.json()) as { friends: FriendSummary[] };
  return body.friends;
}

export async function listFriendRequests(): Promise<FriendRequestSummary[]> {
  const r = await req("/me/friends/requests", { auth: true });
  if (!r.ok) await failWith(r);
  const body = (await r.json()) as { incoming: FriendRequestSummary[] };
  return body.incoming;
}

export async function sendFriendRequest(userId: string): Promise<void> {
  const r = await req(`/friends/${encodeURIComponent(userId)}/request`, {
    method: "POST",
    auth: true,
  });
  if (!r.ok) await failWith(r);
}

export async function acceptFriendRequest(userId: string): Promise<void> {
  const r = await req(`/friends/${encodeURIComponent(userId)}/accept`, {
    method: "POST",
    auth: true,
  });
  if (!r.ok) await failWith(r);
}

export async function removeFriend(userId: string): Promise<void> {
  const r = await req(`/friends/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    auth: true,
  });
  if (!r.ok) await failWith(r);
}

export async function blockUser(userId: string): Promise<void> {
  const r = await req(`/users/${encodeURIComponent(userId)}/block`, {
    method: "POST",
    auth: true,
  });
  if (!r.ok) await failWith(r);
}

// ─── Phase 10 (slice 2): guilds ──────────────────────────────────────
export interface Guild {
  id: string;
  name: string;
  slug: string;
  visibility: "public" | "private";
  ownerId: string;
  description: string;
  memberCount: number;
  createdAt: string;
}

export interface GuildMember {
  user_id: string;
  display_name: string;
  rating: number;
  role: "owner" | "mod" | "member";
  joined_at: string;
}

export interface GuildLeaderboardEntry {
  user_id: string;
  display_name: string;
  rating: number;
  rank: number;
}

export async function createGuild(input: {
  name: string;
  slug: string;
  visibility: "public" | "private";
  description?: string;
}): Promise<Guild> {
  const r = await req("/guilds", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input),
  });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<Guild>;
}

export async function searchGuilds(q: string): Promise<Guild[]> {
  const r = await req(`/guilds?q=${encodeURIComponent(q)}&visibility=public`);
  if (!r.ok) await failWith(r);
  const body = (await r.json()) as { guilds: Guild[] };
  return body.guilds;
}

export async function getGuild(
  id: string,
): Promise<{ guild: Guild; viewer_role: GuildMember["role"] | null }> {
  const r = await req(`/guilds/${encodeURIComponent(id)}`, { auth: true });
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function getGuildMembers(id: string): Promise<GuildMember[]> {
  const r = await req(`/guilds/${encodeURIComponent(id)}/members`, {
    auth: true,
  });
  if (!r.ok) await failWith(r);
  const body = (await r.json()) as { members: GuildMember[] };
  return body.members;
}

export async function getGuildLeaderboard(
  id: string,
  lang = "*",
): Promise<{ entries: GuildLeaderboardEntry[]; language: string }> {
  const r = await req(
    `/guilds/${encodeURIComponent(id)}/leaderboard?lang=${encodeURIComponent(lang)}`,
    { auth: true },
  );
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function patchGuild(
  id: string,
  patch: Partial<Pick<Guild, "name" | "description" | "visibility">>,
): Promise<Guild> {
  const r = await req(`/guilds/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch),
  });
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function transferGuild(
  id: string,
  newOwnerId: string,
): Promise<void> {
  const r = await req(`/guilds/${encodeURIComponent(id)}/transfer`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ new_owner_id: newOwnerId }),
  });
  if (!r.ok) await failWith(r);
}

export async function leaveOrKickGuild(
  guildId: string,
  userId: string,
): Promise<void> {
  const r = await req(
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE", auth: true },
  );
  if (!r.ok) await failWith(r);
}

export async function createGuildInvite(
  id: string,
): Promise<{ code: string; expires_at: string }> {
  const r = await req(`/guilds/${encodeURIComponent(id)}/invites`, {
    method: "POST",
    auth: true,
  });
  if (!r.ok) await failWith(r);
  return r.json();
}

export async function redeemGuildInvite(
  code: string,
): Promise<{ guild_id: string; role: GuildMember["role"] }> {
  const r = await req(`/guilds/join/${encodeURIComponent(code)}`, {
    method: "POST",
    auth: true,
  });
  if (!r.ok) await failWith(r);
  return r.json();
}
