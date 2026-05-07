import type { z } from "zod";
import type { WsFinishSchema } from "@codetype/shared/schemas";
import { accuracy, grossWpm, netWpm, scaledWpm } from "@codetype/shared/wpm";
import { computeRatingDeltas, type RaceParticipant } from "@codetype/shared/elo";
import { Errors } from "../src/AppError";
import { connections } from "../src/repos/ConnectionRepo";
import { rooms } from "../src/repos/RoomRepo";
import { snippets } from "../src/repos/SnippetRepo";
import { users } from "../src/repos/UserRepo";
import { postTo } from "../src/wsClient";

type FinishMsg = z.infer<typeof WsFinishSchema>;

export async function applyFinish(
  input: FinishMsg,
  connectionId: string,
): Promise<void> {
  const conn = await connections.byConnectionId(connectionId);
  if (!conn) throw Errors.NotFound("connection");
  if ((conn.role ?? "racer") === "spectator") {
    throw Errors.Forbidden();
  }
  const roomId = conn.PK.slice("ROOM#".length);
  const displayName = conn.display_name;

  const room = await rooms.getMeta(roomId);
  if (!room?.started_at) throw Errors.Conflict("not started");

  const snippet = await snippets.getById(room.snippet_id);
  if (!snippet) throw Errors.NotFound("snippet");
  if (input.chars_typed < snippet.length) {
    throw Errors.BadRequest("incomplete");
  }

  const finishedAt = Date.now();
  const elapsedMs = finishedAt - room.started_at;
  const gross = grossWpm(input.chars_typed, elapsedMs);
  const net = netWpm(input.chars_typed, input.errors, elapsedMs);
  const acc = accuracy(input.chars_typed, input.errors);
  const scaled = scaledWpm(input.chars_typed, input.errors, elapsedMs);

  await rooms.recordFinish({
    roomId,
    hostId: room.host_id,
    displayName,
    finishedAt,
    charsTyped: input.chars_typed,
    errors: input.errors,
    grossWpm: gross,
    netWpm: net,
    accuracy: acc,
    scaledWpm: scaled,
  });

  await maybeApplyRatings(roomId, snippet.language);
}

/**
 * After every finish, check whether all racers have crossed the line.
 * If so, build the participant list (only players with user_id are
 * rated) and call into UserRepo.applyRaceResults. The transaction's
 * `elo_applied` flag on room META makes this idempotent against
 * concurrent finishers.
 */
async function maybeApplyRatings(
  roomId: string,
  language: string,
): Promise<void> {
  const allPlayers = await rooms.listPlayers(roomId);
  const racers = allPlayers.filter((p) => (p.role ?? "racer") === "racer");
  if (racers.length === 0) return;
  const finishedRacers = racers.filter(
    (p) => p.finished_at !== undefined && !p.is_dnf,
  );
  if (finishedRacers.length !== racers.length) return;

  const ranked = [...finishedRacers].sort(
    (a, b) =>
      (b.scaled_wpm ?? 0) - (a.scaled_wpm ?? 0) ||
      (a.finished_at ?? 0) - (b.finished_at ?? 0),
  );

  const rated = ranked
    .filter((p): p is typeof p & { user_id: string } => !!p.user_id)
    .map((p, i) => ({
      player: p,
      finishOrder: i + 1,
    }));
  if (rated.length < 2) return;

  // Materialize current profiles in parallel.
  const profiles = await Promise.all(
    rated.map((r) => users.getOrCreate(r.player.user_id, r.player.display_name)),
  );

  const ps: RaceParticipant[] = rated.map((r, i) => ({
    userId: r.player.user_id,
    rating: profiles[i]!.rating,
    finishOrder: r.finishOrder,
  }));
  const deltas = computeRatingDeltas(ps);

  let applied;
  try {
    applied = await users.applyRaceResults(
      roomId,
      language,
      rated.map((r, i) => ({
        userId: r.player.user_id,
        displayName: r.player.display_name,
        language,
        finishOrder: r.finishOrder,
        scaledWpm: r.player.scaled_wpm ?? 0,
        netWpm: r.player.net_wpm ?? 0,
        grossWpm: r.player.gross_wpm ?? 0,
        accuracy: r.player.accuracy ?? 0,
        profile: profiles[i]!,
        delta: deltas[r.player.user_id] ?? 0,
      })),
    );
  } catch (e: any) {
    // ConditionalCheckFailed inside the transaction means another
    // finish handler already applied ratings — swallow silently.
    if (e?.name === "TransactionCanceledException") return;
    throw e;
  }

  // Broadcast deltas to everyone (racers + spectators) so the Podium
  // can render +12 / −8 next to each finisher. Failures fan out
  // independently so a single Gone connection doesn't block others.
  const conns = await connections.listByRoom(roomId);
  const payload = {
    type: "ratings" as const,
    entries: applied.map((a) => ({
      user_id: a.userId,
      display_name: a.displayName,
      delta: a.delta,
      rating_after: a.newRating,
    })),
  };
  await Promise.all(conns.map((id) => postTo(id, payload).catch(() => false)));
}
