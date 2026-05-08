# Phase 04 — Frontend Finite State Machine

## Goal

Replace the implicit state management in `RoomClient.tsx` with an explicit XState machine that owns:
- WebSocket lifecycle
- Room phase transitions (lobby → countdown → racing → finished)
- Throttled cursor uploads
- Reconnection logic

`RoomClient.tsx` becomes a dumb renderer that switches on `state.value`.

## Motivation

- Race-condition bugs in real-time UIs hide in `useEffect` chains. An FSM makes invalid transitions impossible by construction.
- Exhaustiveness checking on `state.matches(...)` catches unhandled phases at compile time.
- Side effects (timers, WS, throttling) become *invoked actors* — testable in isolation.

## Scope

### In
- `web/src/lib/machines/roomMachine.ts` — XState v5 machine.
- `web/src/lib/machines/roomMachine.test.ts` — machine-only tests with mocked actors.
- `web/src/lib/actors/wsActor.ts` — wraps WebSocket as a callback actor.
- `web/src/lib/actors/countdownActor.ts` — emits 3, 2, 1, GO.
- `web/src/lib/actors/cursorThrottleActor.ts` — batches cursor positions to ≤20Hz.
- New components in `web/src/components/lobby/`: `Lobby.tsx`, `PlayerList.tsx`, `JoinCodeBadge.tsx`, `StartButton.tsx`.
- Refactor `web/src/app/room/RoomClient.tsx` to consume `useRoomMachine`.
- Delete dead state hooks/effects in old RoomClient.

### Out
- No new features.
- No backend changes.
- Practice mode has its own (smaller) machine in Phase 05.

## State chart

```
idle
  └─ CONNECT → connecting
connecting
  ├─ WS_OPEN → lobby
  └─ WS_ERROR → error
lobby
  ├─ ROOM_UPDATE → lobby (assign players)
  ├─ START_RECEIVED → countdown
  ├─ WS_CLOSE → reconnecting
  └─ LEAVE → idle
countdown
  ├─ TICK → countdown (decrement)
  ├─ COUNTDOWN_DONE → racing
  └─ WS_CLOSE → reconnecting
racing
  ├─ KEY_PRESS → racing (advance position; emit cursor)
  ├─ FINISHED_LOCALLY → racing.waiting
  ├─ ALL_FINISHED → finished
  └─ WS_CLOSE → reconnecting
finished
  ├─ REMATCH → connecting
  └─ LEAVE → idle
reconnecting
  ├─ WS_OPEN → lobby (reconcile via state snapshot)
  └─ MAX_RETRIES → error
error
  └─ RETRY → connecting
```

## Context shape

```ts
interface RoomContext {
  roomId: string;
  joinCode: string | null;
  selfId: string;
  players: Player[];
  spectators: Player[];
  snippet: Snippet | null;
  myPosition: number;
  theirPositions: Record<string, number>;
  countdownValue: number;
  myStartedAt: number | null;
  results: RaceResult[] | null;
  error: { code: string; message: string } | null;
  retryCount: number;
}
```

## File: `web/src/lib/machines/roomMachine.ts`

```ts
import { setup, assign, fromCallback } from 'xstate';
import type { WsClientMsg, WsServerMsg, Room } from '@codetype/shared/schemas';

export const roomMachine = setup({
  types: {} as {
    context: RoomContext;
    events:
      | { type: 'CONNECT'; roomId: string; selfId: string; token: string }
      | { type: 'WS_OPEN' }
      | { type: 'WS_MSG'; msg: WsServerMsg }
      | { type: 'WS_CLOSE' }
      | { type: 'KEY_PRESS'; char: string }
      | { type: 'FINISHED_LOCALLY' }
      | { type: 'REMATCH' }
      | { type: 'LEAVE' }
      | { type: 'RETRY' };
    input: { roomId: string; selfId: string; token: string };
  },
  actors: {
    ws: wsActor,
    countdown: countdownActor,
    cursorThrottle: cursorThrottleActor,
  },
  guards: {
    allFinished: ({ context }) =>
      context.players.every((p) => context.theirPositions[p.userId] >= context.snippet!.text.length),
    canRetry: ({ context }) => context.retryCount < 5,
  },
  actions: {
    /* assign helpers */
  },
}).createMachine({
  id: 'room',
  initial: 'idle',
  context: ({ input }) => ({ /* defaults */ }),
  states: {
    idle: { on: { CONNECT: 'connecting' } },
    connecting: { invoke: { src: 'ws', input: ({ context }) => ({ ... }) }, on: { WS_OPEN: 'lobby', WS_CLOSE: 'reconnecting' } },
    lobby: { /* ... */ },
    countdown: { invoke: { src: 'countdown' }, /* ... */ },
    racing: {
      invoke: { src: 'cursorThrottle' },
      on: {
        KEY_PRESS: { actions: 'advancePosition' },
        WS_MSG: [{ guard: 'allFinished', target: 'finished' }, { actions: 'updateOthers' }],
      },
    },
    finished: { on: { REMATCH: 'connecting', LEAVE: 'idle' } },
    reconnecting: { /* exponential backoff */ },
    error: { on: { RETRY: 'connecting' } },
  },
});
```

## File: `web/src/lib/machines/useRoomMachine.ts`

```ts
import { useMachine } from '@xstate/react';
import { roomMachine } from './roomMachine.js';

export function useRoomMachine(input: { roomId: string; selfId: string; token: string }) {
  const [state, send] = useMachine(roomMachine, { input });
  return { state, send };
}
```

## File: `web/src/app/room/RoomClient.tsx` (target shape)

```tsx
'use client';
export function RoomClient({ roomId, selfId, token }: Props) {
  const { state, send } = useRoomMachine({ roomId, selfId, token });

  if (state.matches('idle') || state.matches('connecting')) return <Connecting />;
  if (state.matches('lobby')) return <Lobby ctx={state.context} send={send} />;
  if (state.matches('countdown')) return <Countdown value={state.context.countdownValue} />;
  if (state.matches('racing')) return <Race ctx={state.context} send={send} />;
  if (state.matches('finished')) return <Podium ctx={state.context} send={send} />;
  if (state.matches('reconnecting')) return <Reconnecting retry={state.context.retryCount} />;
  if (state.matches('error')) return <ErrorView err={state.context.error!} send={send} />;
  return null;
}
```

## Acceptance criteria

- [ ] No `useState`/`useEffect` for room phase, players, positions, or WS lifecycle in `RoomClient.tsx`.
- [ ] Hot-reload safety: machine survives Fast Refresh without duplicate WS connections.
- [ ] WebSocket reconnection works automatically after server-side connection drop.
- [ ] Cursor messages throttled to ≤20Hz regardless of keystroke speed.
- [ ] Countdown is driven by `countdownActor`, not a `setTimeout` in a component.
- [ ] `state.matches(...)` is exhaustively handled in `RoomClient.tsx` (TS will flag if not).
- [ ] Existing happy-path race works end-to-end.

## Test plan

- `roomMachine.test.ts` (XState's built-in test helpers):
  - `idle → connecting → lobby` on CONNECT + WS_OPEN.
  - `lobby → countdown → racing` on START_RECEIVED + COUNTDOWN_DONE.
  - `racing → finished` when `allFinished` guard fires.
  - `* → reconnecting → lobby` on WS_CLOSE then WS_OPEN.
  - `reconnecting → error` after 5 retries.
- Component tests for `Lobby`, `Podium` rendering against synthesized contexts.
- E2E (Playwright, lands in Phase 08): full race.

## Risks / mitigations

- **Risk:** XState v5 actor API churn.
  - **Mitigation:** pin to a specific minor; document upgrade path.
- **Risk:** WS actor reconnect loop hammers server.
  - **Mitigation:** exponential backoff (1s, 2s, 4s, 8s, 16s, then `error`). Spec'd in `reconnecting` state.
- **Risk:** Stale `theirPositions` after reconnect.
  - **Mitigation:** on WS_OPEN in `reconnecting`, server sends a `state-snapshot` message that machine assigns into context.

## Estimate

5–6 days.
