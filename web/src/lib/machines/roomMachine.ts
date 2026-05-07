import { setup, assign, sendTo, type AnyEventObject } from "xstate";
import { wsActor } from "../actors/wsActor";
import { countdownActor } from "../actors/countdownActor";
import { cursorThrottleActor } from "../actors/cursorThrottleActor";

export interface PlayerState {
  display_name: string;
  progress: number;
  finished_at?: number;
  scaled_wpm?: number;
  net_wpm?: number;
  gross_wpm?: number;
  accuracy?: number;
  role?: "racer" | "spectator";
}

export interface RatingDelta {
  user_id: string;
  display_name: string;
  delta: number;
  rating_after: number;
}

export interface RoomContext {
  code: string;
  displayName: string;
  isHost: boolean;
  role: "racer" | "spectator";
  snippetCode: string;
  status: "lobby" | "countdown" | "running" | "finished";
  startedAt: number | null;
  players: Record<string, PlayerState>;
  countdownValue: number;
  ratings: Record<string, RatingDelta>;
  error: { code: string; message: string } | null;
  retryCount: number;
}

export interface RoomInput {
  code: string;
  displayName: string;
  isHost: boolean;
  role?: "racer" | "spectator";
  snippetCode: string;
  status?: "lobby" | "countdown" | "running" | "finished";
  startedAt?: number | null;
}

export type RoomEvent =
  | { type: "WS_OPEN" }
  | { type: "WS_CLOSE" }
  | { type: "WS_ERROR"; message: string }
  | { type: "WS_MSG"; msg: any }
  | { type: "TICK"; value: number }
  | { type: "COUNTDOWN_DONE" }
  | { type: "TYPED"; progress: number; chars_typed: number; errors: number }
  | {
      type: "CURSOR_FLUSH";
      progress: number;
      chars_typed: number;
      errors: number;
    }
  | { type: "FINISH_LOCALLY"; chars_typed: number; errors: number }
  | { type: "HOST_START" }
  | { type: "REMATCH" }
  | { type: "LEAVE" }
  | { type: "RETRY" };

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = RETRY_DELAYS.length;

const isStatusCountdownOrRunning = (msg: any) =>
  msg?.type === "room-event" &&
  msg.event === "status" &&
  (msg.payload?.status === "countdown" || msg.payload?.status === "running");

export const roomMachine = setup({
  types: {
    context: {} as RoomContext,
    events: {} as RoomEvent,
    input: {} as RoomInput,
  },
  actors: {
    ws: wsActor,
    countdown: countdownActor,
    cursorThrottle: cursorThrottleActor,
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < MAX_RETRIES,
    msgIsStatusGo: ({ event }) =>
      event.type === "WS_MSG" && isStatusCountdownOrRunning(event.msg),
    raceFinished: ({ context }) => {
      // Spectators don't have a finished_at; only racers gate the
      // transition to `finished`.
      const racers = Object.values(context.players).filter(
        (p) => (p.role ?? "racer") === "racer",
      );
      if (racers.length === 0) return false;
      return racers.every((p) => p.finished_at !== undefined);
    },
  },
  delays: {
    retryDelay: ({ context }) =>
      RETRY_DELAYS[Math.min(context.retryCount, RETRY_DELAYS.length - 1)],
  },
  actions: {
    seedSelf: assign(({ context }) => ({
      players: {
        ...context.players,
        [context.displayName]:
          context.players[context.displayName] ?? {
            display_name: context.displayName,
            progress: 0,
            role: context.role,
          },
      },
    })),
    resetRetries: assign({ retryCount: 0 }),
    bumpRetry: assign({
      retryCount: ({ context }) => context.retryCount + 1,
    }),
    applyMsg: assign(({ context, event }) => {
      if (event.type !== "WS_MSG") return {};
      const m = event.msg;
      if (m?.type === "cursor") {
        const name = m.display_name as string;
        return {
          players: {
            ...context.players,
            [name]: {
              ...(context.players[name] ?? { display_name: name, progress: 0 }),
              display_name: name,
              progress: m.progress as number,
            },
          },
        };
      }
      if (m?.type === "room-event" && m.event === "status") {
        return {
          status: m.payload?.status ?? context.status,
          startedAt: m.payload?.started_at ?? context.startedAt,
        };
      }
      if (m?.type === "room-event" && m.event === "join") {
        const name = m.payload?.display_name as string | undefined;
        if (!name) return {};
        return {
          players: {
            ...context.players,
            [name]: context.players[name] ?? {
              display_name: name,
              progress: 0,
            },
          },
        };
      }
      if (m?.type === "room-event" && m.event === "leave") {
        const name = m.payload?.display_name as string | undefined;
        if (!name) return {};
        const next = { ...context.players };
        delete next[name];
        return { players: next };
      }
      if (m?.type === "ratings") {
        const next: Record<string, any> = { ...context.ratings };
        for (const e of m.entries ?? []) {
          next[e.display_name] = e;
        }
        return { ratings: next };
      }
      if (m?.type === "finish") {
        const name = m.display_name as string;
        return {
          players: {
            ...context.players,
            [name]: {
              ...(context.players[name] ?? { display_name: name, progress: 1 }),
              display_name: name,
              progress: 1,
              finished_at: m.finished_at,
              scaled_wpm: m.scaled_wpm,
              net_wpm: m.net_wpm,
              gross_wpm: m.gross_wpm,
              accuracy: m.accuracy,
            },
          },
        };
      }
      return {};
    }),
    updateCountdown: assign({
      countdownValue: ({ event }) =>
        event.type === "TICK" ? event.value : 0,
    }),
    setError: assign({
      error: ({ event }) => {
        if (event.type === "WS_ERROR")
          return { code: "WS_ERROR", message: event.message };
        return { code: "UNKNOWN", message: "unknown error" };
      },
    }),
    clearError: assign({ error: null }),
    forwardCursorToThrottle: sendTo("cursorThrottle", ({ event }) => {
      if (event.type !== "TYPED")
        return { type: "noop" } as AnyEventObject;
      return {
        type: "CURSOR",
        progress: event.progress,
        chars_typed: event.chars_typed,
        errors: event.errors,
      };
    }),
    sendThrottledCursorToWs: sendTo("ws", ({ event }) => {
      if (event.type !== "CURSOR_FLUSH")
        return { type: "noop" } as AnyEventObject;
      return {
        type: "SEND_CURSOR",
        progress: event.progress,
        chars_typed: event.chars_typed,
        errors: event.errors,
      };
    }),
    sendStartToWs: sendTo("ws", { type: "SEND_START" }),
    sendFinishToWs: sendTo("ws", ({ event }) => {
      if (event.type !== "FINISH_LOCALLY")
        return { type: "noop" } as AnyEventObject;
      return {
        type: "SEND_FINISH",
        chars_typed: event.chars_typed,
        errors: event.errors,
      };
    }),
  },
}).createMachine({
  id: "room",
  initial: "connecting",
  context: ({ input }) => ({
    code: input.code,
    displayName: input.displayName,
    isHost: input.isHost,
    role: input.role ?? "racer",
    snippetCode: input.snippetCode,
    status: input.status ?? "lobby",
    startedAt: input.startedAt ?? null,
    players: {},
    countdownValue: 0,
    ratings: {},
    error: null,
    retryCount: 0,
  }),
  entry: "seedSelf",
  on: {
    LEAVE: { target: ".idle" },
  },
  states: {
    idle: {},
    connecting: {
      invoke: {
        id: "ws",
        src: "ws",
        input: ({ context }) => ({
          code: context.code,
          displayName: context.displayName,
          role: context.role,
        }),
      },
      on: {
        WS_OPEN: [
          {
            guard: ({ context }) =>
              context.status === "countdown" || context.status === "running",
            target: "countdown",
            actions: "resetRetries",
          },
          { target: "lobby", actions: "resetRetries" },
        ],
        WS_CLOSE: { target: "reconnecting" },
        WS_ERROR: { target: "error", actions: "setError" },
        WS_MSG: { actions: "applyMsg" },
      },
    },
    lobby: {
      invoke: {
        id: "ws",
        src: "ws",
        input: ({ context }) => ({
          code: context.code,
          displayName: context.displayName,
          role: context.role,
        }),
      },
      on: {
        WS_MSG: [
          {
            guard: "msgIsStatusGo",
            target: "countdown",
            actions: "applyMsg",
          },
          { actions: "applyMsg" },
        ],
        HOST_START: { actions: "sendStartToWs" },
        WS_CLOSE: { target: "reconnecting" },
        WS_ERROR: { target: "error", actions: "setError" },
      },
    },
    countdown: {
      invoke: [
        {
          id: "ws",
          src: "ws",
          input: ({ context }) => ({
            code: context.code,
            displayName: context.displayName,
          }),
        },
        {
          id: "countdown",
          src: "countdown",
          input: ({ context }) => ({
            startedAt: context.startedAt ?? Date.now() + 3000,
          }),
        },
      ],
      on: {
        TICK: { actions: "updateCountdown" },
        COUNTDOWN_DONE: { target: "racing" },
        WS_MSG: { actions: "applyMsg" },
        WS_CLOSE: { target: "reconnecting" },
        WS_ERROR: { target: "error", actions: "setError" },
      },
    },
    racing: {
      invoke: [
        {
          id: "ws",
          src: "ws",
          input: ({ context }) => ({
            code: context.code,
            displayName: context.displayName,
          }),
        },
        { id: "cursorThrottle", src: "cursorThrottle" },
      ],
      always: { guard: "raceFinished", target: "finished" },
      on: {
        TYPED: { actions: "forwardCursorToThrottle" },
        CURSOR_FLUSH: { actions: "sendThrottledCursorToWs" },
        FINISH_LOCALLY: { actions: "sendFinishToWs" },
        WS_MSG: { actions: "applyMsg" },
        WS_CLOSE: { target: "reconnecting" },
        WS_ERROR: { target: "error", actions: "setError" },
      },
    },
    finished: {
      on: {
        REMATCH: {
          target: "connecting",
          actions: ["clearError", "resetRetries"],
        },
      },
    },
    reconnecting: {
      entry: "bumpRetry",
      after: {
        retryDelay: [
          { guard: "canRetry", target: "connecting" },
          { target: "error", actions: "setError" },
        ],
      },
      on: {
        RETRY: { target: "connecting" },
      },
    },
    error: {
      on: {
        RETRY: {
          target: "connecting",
          actions: ["clearError", "resetRetries"],
        },
      },
    },
  },
});
