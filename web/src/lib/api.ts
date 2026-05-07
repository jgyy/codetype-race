import { HTTP_API } from "./config";
import { getIdToken } from "./aws/cognito";

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
  let detail = "";
  if (ct.includes("application/json")) {
    try {
      const body = await r.json();
      detail = body?.message ?? body?.error ?? JSON.stringify(body);
    } catch {
      // fall through
    }
  }
  if (!detail) detail = r.statusText || "Request failed";
  throw new Error(`HTTP ${r.status}: ${detail}`);
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

export async function listHistory() {
  const r = await req("/history", { auth: true });
  if (!r.ok) await failWith(r);
  return r.json() as Promise<{ results: any[] }>;
}
