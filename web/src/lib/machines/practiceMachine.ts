import { assign, fromPromise, setup } from "xstate";
import { getRandomSnippet, postPracticeRun } from "@/lib/api";

export interface PracticeSnippet {
  snippet_id: string;
  language: string;
  title: string;
  code: string;
  difficulty?: number;
}

export interface PracticeResult {
  finished_at: number;
  gross_wpm: number;
  net_wpm: number;
  accuracy: number;
  scaled_wpm: number;
  saved: boolean;
}

export interface PracticeContext {
  filters: { language?: string; difficulty?: number };
  snippet: PracticeSnippet | null;
  startedAt: number | null;
  save: boolean;
  result: PracticeResult | null;
  error: string | null;
}

export interface PracticeInput {
  language?: string;
  difficulty?: number;
}

export type PracticeEvent =
  | { type: "TYPED"; progress: number; chars_typed: number; errors: number }
  | { type: "STARTED" }
  | { type: "FINISH"; chars_typed: number; errors: number }
  | { type: "RETRY" }
  | { type: "TOGGLE_SAVE"; save: boolean };

export const practiceMachine = setup({
  types: {
    context: {} as PracticeContext,
    events: {} as PracticeEvent,
    input: {} as PracticeInput,
  },
  actors: {
    fetchSnippet: fromPromise<PracticeSnippet, PracticeInput>(
      async ({ input }) => {
        const s = await getRandomSnippet({
          language: input.language,
          difficulty: input.difficulty,
        });
        return s as PracticeSnippet;
      },
    ),
    submitRun: fromPromise<
      PracticeResult,
      {
        snippet_id: string;
        chars_typed: number;
        errors: number;
        duration_ms: number;
        save: boolean;
      }
    >(async ({ input }) => {
      const r = await postPracticeRun(input);
      return r;
    }),
  },
  actions: {
    setSnippet: assign(({ event }) => ({
      snippet: (event as any).output as PracticeSnippet,
    })),
    setError: assign(({ event }) => ({
      error: ((event as any).error?.message ?? "error") as string,
    })),
    setStartedAt: assign({ startedAt: () => Date.now() }),
    setResult: assign(({ event }) => ({
      result: (event as any).output as PracticeResult,
    })),
    toggleSave: assign({
      save: ({ event }) =>
        event.type === "TOGGLE_SAVE" ? event.save : true,
    }),
    resetForRetry: assign({
      snippet: null,
      result: null,
      error: null,
      startedAt: null,
    }),
  },
}).createMachine({
  id: "practice",
  initial: "loading",
  context: ({ input }) => ({
    filters: { language: input.language, difficulty: input.difficulty },
    snippet: null,
    startedAt: null,
    save: true,
    result: null,
    error: null,
  }),
  states: {
    loading: {
      invoke: {
        src: "fetchSnippet",
        input: ({ context }) => context.filters,
        onDone: { target: "ready", actions: "setSnippet" },
        onError: { target: "error", actions: "setError" },
      },
    },
    ready: {
      on: {
        TYPED: { target: "racing", actions: "setStartedAt" },
        TOGGLE_SAVE: { actions: "toggleSave" },
      },
    },
    racing: {
      on: {
        FINISH: "submitting",
        TOGGLE_SAVE: { actions: "toggleSave" },
      },
    },
    submitting: {
      invoke: {
        src: "submitRun",
        input: ({ context, event }) => {
          const e = event as PracticeEvent;
          if (e.type !== "FINISH") {
            return {
              snippet_id: context.snippet?.snippet_id ?? "",
              chars_typed: 0,
              errors: 0,
              duration_ms: 1,
              save: context.save,
            };
          }
          const duration = Math.max(1, Date.now() - (context.startedAt ?? Date.now()));
          return {
            snippet_id: context.snippet!.snippet_id,
            chars_typed: e.chars_typed,
            errors: e.errors,
            duration_ms: duration,
            save: context.save,
          };
        },
        onDone: { target: "finished", actions: "setResult" },
        onError: { target: "error", actions: "setError" },
      },
    },
    finished: {
      on: {
        RETRY: { target: "loading", actions: "resetForRetry" },
        TOGGLE_SAVE: { actions: "toggleSave" },
      },
    },
    error: {
      on: { RETRY: { target: "loading", actions: "resetForRetry" } },
    },
  },
});
