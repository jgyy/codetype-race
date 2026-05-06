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
  const r = await fetch(`${HTTP_API}${path}`, { ...init, headers });
  return r;
}

export async function createRoom(snippet_id: string) {
  const r = await req("/rooms", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ snippet_id }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ room_id: string; code: string }>;
}

export async function joinRoom(code: string, display_name: string) {
  const r = await req("/rooms/join", {
    method: "POST",
    body: JSON.stringify({ code, display_name }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    room_id: string;
    snippet_id: string;
    status: string;
  }>;
}

export async function getRoom(code: string) {
  const r = await req(`/rooms/${code}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listHistory() {
  const r = await req("/history", { auth: true });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ results: any[] }>;
}
