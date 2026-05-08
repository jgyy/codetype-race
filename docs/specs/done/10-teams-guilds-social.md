# Phase 10 — Teams, Guilds & Social Graph

## Goal

Turn codetype-race from a "pickup-game" into a **persistent social product** by adding three layered concepts:

1. **Friends** — symmetric, opt-in graph of users.
2. **Guilds** — named groups (3–50 members) with a shared roster, leaderboard, and chat thread. Loosely modelled on Discord servers but typing-race-shaped.
3. **Team races** — a mode of room where 2–4 named teams compete, scored as `sum(team.WPM × team.accuracy)` over the room's snippet, with team Elo tracked separately from solo Elo.

The deliverable is the full social plumbing: graph, presence, feed, plus the team-race game mode.

## Motivation

- 42 Singapore (and any campus) is a **graph, not a userbase** — students arrive in cohorts, study in clusters, and natural social proof drives retention. Today the app has no way to surface "your peers".
- A friends/guild system **changes the matchmaking question** from "who is online globally?" to "who in my guild is online right now?", which is materially better engagement at our scale.
- Team races are the killer Friday-night format: 2v2 or 4v4 with shared scoring, chat trash-talk, and a rematch button. The backend cost is incremental (same Lambdas, same rooms).

## Scope

### In

- Friend requests (send / accept / decline / block).
- User search by handle prefix (3+ chars).
- Guilds: create, invite, kick, leave, transfer ownership, public/private toggle.
- Guild leaderboard (members ranked by current-season Elo).
- Guild chat (reuses Phase 06 chat with `roomKind = 'guild'`).
- Online presence: a user appears online if they have any active WS connection.
- "Friends online" widget on home page and in lobby.
- Team-race game mode: 2 or 4 teams, 1–2 players per team. Team-aware scoring + team Elo.
- Activity feed: per user, last 50 events (`raced`, `joined_guild`, `won_tournament`, `daily_completed`).

### Out

- Direct messaging (1:1 chat) — deferred. Guild chat only.
- Cross-region presence — single-region presence only.
- Federated identity / external login — Cognito only.
- Voice / Discord integration — deferred.
- Following users (asymmetric graph) — friends only (symmetric).

## Data model

### New entities

| Entity | PK | SK | GSI1PK | GSI1SK | Notes |
|---|---|---|---|---|---|
| FriendEdge | `USER#<a>` | `FRIEND#<b>` | `USER#<b>` | `FRIEND#<a>` | Two rows per friendship (a→b and b→a). status ∈ `pending\|accepted\|blocked` |
| FriendRequestInbox | `USER#<to>` | `FREQ#<from>#<ts>` | — | — | Index for "incoming requests"; deleted on accept/decline |
| Guild | `GUILD#<id>` | `META` | `GUILD#PUBLIC#<sortKey>` | `<createdAt>` | sortKey = lowercase name slug; only present if public |
| GuildMember | `GUILD#<id>` | `MEMBER#<userId>` | `USER#<userId>` | `GUILD#<id>#<joinedAt>` | role ∈ `owner\|mod\|member` |
| GuildInvite | `GUILD#<id>` | `INVITE#<code>` | `INVITE#<code>` | `GUILD#<id>` | TTL 7 days |
| Presence | `PRESENCE#<userId>` | `CONN#<connId>` | `PRESENCE#ONLINE` | `<userId>#<lastSeenAt>` | TTL on `lastSeenAt + 60s` |
| FeedEvent | `FEED#<userId>` | `EV#<reverseTs>` | — | — | Trim to 50 newest by reverse timestamp |
| TeamRoom | `ROOM#<id>` | `TEAMS#<teamId>` | — | — | Sub-row: members[], color, name |
| TeamRatingRow | `TEAM-RATING#<lang>` | `RANK#<6-digit-rank>` | `TEAM-RATING#<userId>` | `<lang>` | One per (lang, team-mode) |

### GSI strategy

- `GSI1` reused. **No new GSI** added in this phase.
- Public guild discovery → `GSI1PK = GUILD#PUBLIC#<slug-prefix>` with `begins_with` for autocomplete (top 100 guilds; not full-text search).
- "My guilds" → `GSI1PK = USER#<userId>` filtered SK `begins_with 'GUILD#'`.
- "Online users" → `GSI1PK = PRESENCE#ONLINE` ordered by `<userId>#<lastSeenAt>`.

### Zod schemas (`shared/src/schemas/social.ts`)

```ts
export const FriendStatus = z.enum(['pending', 'accepted', 'blocked']);
export const FriendEdge = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  status: FriendStatus,
  createdAt: z.string().datetime(),
  acceptedAt: z.string().datetime().optional(),
});

export const GuildVisibility = z.enum(['public', 'private']);
export const GuildRole = z.enum(['owner', 'mod', 'member']);
export const Guild = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(32),
  slug: z.string().regex(/^[a-z0-9-]{3,32}$/),
  visibility: GuildVisibility,
  ownerId: z.string(),
  description: z.string().max(500),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export const GuildMember = z.object({
  guildId: z.string().uuid(),
  userId: z.string(),
  role: GuildRole,
  joinedAt: z.string().datetime(),
});

export const Team = z.object({
  id: z.string(), // 'A' | 'B' | 'C' | 'D'
  name: z.string().min(1).max(24),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  members: z.array(z.string()).min(1).max(2),
});
export const TeamRoomConfig = z.object({
  roomId: z.string(),
  mode: z.literal('team'),
  teams: z.array(Team).min(2).max(4),
  rated: z.boolean().default(true),
});

export const FeedEventType = z.enum([
  'raced', 'joined_guild', 'left_guild', 'won_tournament',
  'daily_completed', 'achievement_unlocked', 'pb_set',
]);
export const FeedEvent = z.object({
  userId: z.string(),
  eventId: z.string().uuid(),
  type: FeedEventType,
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});
```

## API surface

### HTTP

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users/search?q=jo` | Handle prefix search (cap 25 results) |
| `GET` | `/me/friends` | List accepted friends + presence |
| `GET` | `/me/friends/requests` | Incoming pending requests |
| `POST` | `/friends/:userId/request` | Send |
| `POST` | `/friends/:userId/accept` | Accept |
| `DELETE` | `/friends/:userId` | Remove or decline |
| `POST` | `/users/:userId/block` | Block |
| `POST` | `/guilds` | Create |
| `GET` | `/guilds?q=foo&visibility=public` | Discovery |
| `GET` | `/guilds/:id` | Detail |
| `GET` | `/guilds/:id/members` | Roster |
| `GET` | `/guilds/:id/leaderboard?lang=ts` | Members ranked by current Elo |
| `POST` | `/guilds/:id/invites` | Create invite code |
| `POST` | `/guilds/join/:code` | Redeem invite |
| `DELETE` | `/guilds/:id/members/:userId` | Kick (owner/mod) or self-leave |
| `PATCH` | `/guilds/:id` | Update name/desc/visibility (owner) |
| `POST` | `/guilds/:id/transfer` | Transfer ownership |
| `GET` | `/users/:userId/feed` | Public activity feed |
| `POST` | `/rooms` *(extended)* | accepts `mode: 'team'` + `teams[]` |

### WebSocket extensions

- `PRESENCE_PING` — server-side, every 30 s, refreshes a connection's `Presence` row's `lastSeenAt`.
- `FRIEND_ONLINE` / `FRIEND_OFFLINE` — pushed to subscribers (the user's own connections).
- Guild chat reuses room WS with `roomKind: 'guild'`; the WS connect handler authenticates membership via the `GuildMember` row.

## Lambda layout

```
lambdas/src/http/social/
  search.ts
  friends/{request,accept,remove,block,list,requestsList}.ts
  guilds/{create,list,get,members,leaderboard,update,transfer,leave}.ts
  guilds/invites/{create,redeem}.ts
  feed/{get,append}.ts
lambdas/src/ws/presence/
  ping.ts
  onConnect.ts             # writes Presence row
  onDisconnect.ts          # deletes Presence row
lambdas/src/stream/
  onRaceFinished.ts        # extended: appends FeedEvent('raced'), updates team rating if mode=team
  onGuildMemberChange.ts   # maintains memberCount on Guild
```

## Presence model (deep dive)

This is the only piece of net-new infrastructure complexity. Choices considered:

1. **DDB-only with TTL** — chosen.
2. ElastiCache Redis — explicitly rejected: would force VPC-attached Lambdas (cold start >> 300 ms).
3. AppSync subscriptions — rejected: out of architectural scope (no AppSync today).

### Algorithm

- On WS `$connect`: write `Presence` row with `lastSeenAt = now`, TTL `now + 60 s`.
- On `PRESENCE_PING` (every 30 s): update `lastSeenAt`, extend TTL.
- On `$disconnect`: delete the row immediately.
- On read of "is X online?": `Query` partition `PRESENCE#<X>` with `Limit=1`. Empty = offline.
- DDB Streams on the table fire `INSERT`/`REMOVE` for `PRESENCE#*` items; a small Lambda fanouts `FRIEND_ONLINE` / `FRIEND_OFFLINE` to the user's friends' WS connections.

### Cost guardrails

- Each connected user → 2 DDB writes/min (PING) → 2880/day → ~$0.002/user-day. Acceptable up to 5k MAU before this becomes worth optimising.
- Fanout cost: friends-of-friends events scale with `connections × friends`. Cap broadcast at "≤ 200 friends" before falling back to a periodic 1-min poll for users above that threshold.

## Team-race scoring

Two teams `A`, `B`. Each player finishes with `(wpm_i, acc_i, finishedAt_i)`.

```
teamScore(team) = sum_over_members( wpm_i * acc_i )       # acc_i is 0..1
winner = argmax(teamScore)
```

Tiebreak: lower `max(finishedAt)` wins.

### Team Elo

Separate ledger from solo Elo. Each team-race produces one delta per player applied to their **team-rating** ledger (entity `TeamRatingRow`). Formula: standard Elo with K=24, expected outcome computed from `teamRating(A) = mean(member ratings) + 50 * (size_diff bonus)`. Players retain their own per-language team-rating.

### Why not use the same Elo as solo?

- Solo Elo measures individual skill at typing under pressure. Team Elo measures coordination + carry potential. Mixing them creates farming incentives (4-player team rolls a 1v1 lobby).
- Two ledgers cost one extra row per race; trivial.

## Frontend

### Components

- `<FriendsList>` — sortable by online/offline, name, current rating.
- `<FriendsOnlineWidget>` — homepage card; max 8 avatars + overflow count.
- `<GuildPage>` — header (banner colour from name hash), members, leaderboard tab, chat tab.
- `<GuildSearchBar>` — debounced 250 ms, hits `/guilds` discovery.
- `<TeamSetup>` — host-side picker; drag-and-drop players into team slots.
- `<TeamRaceHud>` — replaces `<RaceHud>` when `mode = 'team'`; shows two/four bars instead of N lanes.
- `<ActivityFeed>` — virtualised list, infinite-scroll, used on profile and guild pages.

### XState additions

`presenceActor` — sibling to `wsActor`, owns its own connection just for presence pings. Started by `app` machine, not `room` machine, so presence persists across pages.

```
states: offline → connecting → online → reconnecting → offline
events:  CONNECT, PING_OK, PING_FAIL, DISCONNECT
context: { connId, lastPing }
```

`teamRoomMachine` — variant of `roomMachine` for `mode = 'team'`. Same states, extra context `teams: Team[]`, plus a `TEAM_PROGRESS` event type from the cursor flush.

### Routing

```
web/src/app/friends/page.tsx
web/src/app/guilds/page.tsx
web/src/app/guilds/[slug]/page.tsx
web/src/app/guilds/[slug]/leaderboard/page.tsx
web/src/app/feed/page.tsx                 # global friend feed
```

## Acceptance criteria

- [ ] Friend request lifecycle works in both directions; declining removes both edges.
- [ ] Blocked users cannot send a friend request, cannot see each other's profile, and are removed from each other's guilds (mutual leave).
- [ ] Guild creation enforces unique slug (case-insensitive); 409 on collision.
- [ ] A guild's `memberCount` matches the count of `GuildMember` rows after any join/leave (verified by a periodic reconciliation cron, alarmed if drift > 1%).
- [ ] Presence transitions visible to a friend within ≤5 s of disconnect (worst case = TTL + fanout latency).
- [ ] Team-race finalization writes exactly one team-rating row update per player, in one `TransactWriteItems` along with the race history rows.
- [ ] Feed shows only events the viewer is allowed to see (private guild events suppressed for non-members).
- [ ] Search is rate-limited to 5 rps per user (return 429 above).
- [ ] All new endpoints have Zod input + output schemas wired into `withHttp`.

## Test plan

### Unit

- `social/edges.ts` — symmetric write logic, idempotent re-accept.
- `social/presence.ts` — TTL math, "online if any connection".
- `team/scoring.ts` — tiebreak edge cases.
- `team/elo.ts` — team Elo with size mismatch.

### Integration (DDB local)

- Concurrent friend-request + block: block must win, request must be auto-cancelled.
- Guild owner leaves while another member also leaves: ownership-transfer determinism (eldest mod, else eldest member).
- 100-message guild chat with one offline member rejoining after restart: messages delivered in order via the existing chat backlog query.

### E2E

- Two browsers: A friend-requests B, B accepts, A creates a 2v2 team room with B, race finishes, both feeds and team leaderboards update.

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Presence row write storm at peak hour | 30 s ping interval + TTL keeps load bounded; alarm at >100 wcu/min sustained. |
| Guild member count drift on stream-handler retry | `onGuildMemberChange` uses an `ADD` `memberCount :delta` atomic counter with idempotency token in the change event. |
| Search hot partition for very common prefixes | Pre-compute "top 100 guilds" cache in CloudFront with 60 s TTL on `/guilds?q=` results. |
| Block + friend-request race | Both writes use `ConditionExpression` against the *opposite* edge's status; block wins by virtue of being checked second. Test covers both orderings. |
| Team-Elo griefing (forming a team to tank) | Tag matches with `expectedDelta`; if `|actualDelta - expectedDelta| > 200` and one team had members from the same guild, flag for moderation. Phase 07 anti-cheat rules apply. |

## Migration / rollout

1. Ship presence + friends only (no guilds, no team races) behind `ENABLE_SOCIAL=true`.
2. After 1 week of presence stability, enable guilds.
3. Team races last (depends on team Elo, which depends on `RatingRow` schema being unchanged).
4. Backfill: every existing user gets an empty friends list lazily (no migration row needed).

## Rollback

- Each capability has an independent flag: `ENABLE_FRIENDS`, `ENABLE_GUILDS`, `ENABLE_TEAM_RACES`, `ENABLE_PRESENCE`.
- Disabling presence stops the stream-handler fanout and lets TTL evict rows naturally.
- Disabling guilds hides routes; existing `Guild`/`GuildMember` rows remain inert.

## Estimate

12 dev-days. ~3 d social graph, 3 d guilds, 2 d presence + feed, 3 d team races, 1 d tests/Playwright.
