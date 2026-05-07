import { describe, expect, test } from "bun:test";
import { createActor, fromCallback } from "xstate";
import { roomMachine } from "../src/lib/machines/roomMachine";

const noop = fromCallback(() => () => { });

const baseInput = {
    code: "ABCDEF",
    displayName: "alice",
    isHost: true,
    snippetCode: "hello",
};

function spawn(overrides: Partial<typeof baseInput> = {}) {
    const machine = roomMachine.provide({
        actors: {
            ws: noop as any,
            countdown: noop as any,
            cursorThrottle: noop as any,
        },
    });
    const actor = createActor(machine, { input: { ...baseInput, ...overrides } });
    actor.start();
    return actor;
}

describe("roomMachine", () => {
    test("seeds self into players on entry", () => {
        const actor = spawn();
        const ctx = actor.getSnapshot().context;
        expect(ctx.players["alice"]?.display_name).toBe("alice");
    });

    test("connecting -> lobby on WS_OPEN with status=lobby", () => {
        const actor = spawn();
        expect(actor.getSnapshot().matches("connecting")).toBe(true);
        actor.send({ type: "WS_OPEN" });
        expect(actor.getSnapshot().matches("lobby")).toBe(true);
    });

    test("connecting -> countdown when bootstrap status is countdown", () => {
        const actor = spawn({});
        actor.send({
            type: "WS_MSG",
            msg: {
                type: "room-event",
                event: "status",
                payload: { status: "countdown", started_at: Date.now() + 5000 },
            },
        });
        actor.send({ type: "WS_OPEN" });
        expect(actor.getSnapshot().matches("countdown")).toBe(true);
    });

    test("lobby -> countdown on status room-event", () => {
        const actor = spawn();
        actor.send({ type: "WS_OPEN" });
        actor.send({
            type: "WS_MSG",
            msg: {
                type: "room-event",
                event: "status",
                payload: { status: "countdown", started_at: Date.now() + 1000 },
            },
        });
        expect(actor.getSnapshot().matches("countdown")).toBe(true);
    });

    test("countdown -> racing on COUNTDOWN_DONE", () => {
        const actor = spawn();
        actor.send({ type: "WS_OPEN" });
        actor.send({
            type: "WS_MSG",
            msg: {
                type: "room-event",
                event: "status",
                payload: { status: "countdown", started_at: Date.now() + 1000 },
            },
        });
        actor.send({ type: "COUNTDOWN_DONE" });
        expect(actor.getSnapshot().matches("racing")).toBe(true);
    });

    test("racing -> finished when all players have finished_at", () => {
        const actor = spawn();
        actor.send({ type: "WS_OPEN" });
        actor.send({
            type: "WS_MSG",
            msg: {
                type: "room-event",
                event: "join",
                payload: { display_name: "bob" },
            },
        });
        actor.send({
            type: "WS_MSG",
            msg: {
                type: "room-event",
                event: "status",
                payload: { status: "countdown", started_at: Date.now() + 100 },
            },
        });
        actor.send({ type: "COUNTDOWN_DONE" });
        expect(actor.getSnapshot().matches("racing")).toBe(true);

        actor.send({
            type: "WS_MSG",
            msg: {
                type: "finish",
                display_name: "alice",
                finished_at: Date.now(),
                gross_wpm: 60,
                net_wpm: 58,
                accuracy: 0.97,
                scaled_wpm: 56,
            },
        });
        actor.send({
            type: "WS_MSG",
            msg: {
                type: "finish",
                display_name: "bob",
                finished_at: Date.now() + 1,
                gross_wpm: 70,
                net_wpm: 68,
                accuracy: 0.99,
                scaled_wpm: 66,
            },
        });
        expect(actor.getSnapshot().matches("finished")).toBe(true);
    });

    test("WS_CLOSE from lobby goes to reconnecting and bumps retry", () => {
        const actor = spawn();
        actor.send({ type: "WS_OPEN" });
        actor.send({ type: "WS_CLOSE" });
        const snap = actor.getSnapshot();
        expect(snap.matches("reconnecting")).toBe(true);
        expect(snap.context.retryCount).toBe(1);
    });

    test("error state on WS_ERROR captures message", () => {
        const actor = spawn();
        actor.send({ type: "WS_ERROR", message: "boom" });
        const snap = actor.getSnapshot();
        expect(snap.matches("error")).toBe(true);
        expect(snap.context.error?.message).toBe("boom");
    });

    test("RETRY from error returns to connecting and resets retry count", () => {
        const actor = spawn();
        actor.send({ type: "WS_ERROR", message: "boom" });
        actor.send({ type: "RETRY" });
        const snap = actor.getSnapshot();
        expect(snap.matches("connecting")).toBe(true);
        expect(snap.context.retryCount).toBe(0);
        expect(snap.context.error).toBeNull();
    });

    test("WS_MSG cursor updates that player's progress", () => {
        const actor = spawn();
        actor.send({ type: "WS_OPEN" });
        actor.send({
            type: "WS_MSG",
            msg: { type: "cursor", display_name: "bob", progress: 0.42 },
        });
        const ctx = actor.getSnapshot().context;
        expect(ctx.players["bob"]?.progress).toBeCloseTo(0.42);
    });
});
