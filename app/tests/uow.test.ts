import { describe, expect, test } from "bun:test";
import { InMemoryUnitOfWork } from "../src";

describe("InMemoryUnitOfWork", () => {
    test("flush invokes sender with all enqueued items in order", async () => {
        const uow = new InMemoryUnitOfWork();
        uow.enqueue({ a: 1 });
        uow.enqueue({ b: 2 });
        uow.enqueue({ c: 3 });
        let captured: unknown[] | null = null;
        await uow.flush(async (items) => {
            captured = items;
        });
        expect(captured).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    });

    test("empty flush is a no-op", async () => {
        const uow = new InMemoryUnitOfWork();
        let called = false;
        await uow.flush(async () => {
            called = true;
        });
        expect(called).toBe(false);
    });

    test("double flush throws", async () => {
        const uow = new InMemoryUnitOfWork();
        uow.enqueue({});
        await uow.flush(async () => { });
        await expect(uow.flush(async () => { })).rejects.toThrow(/already flushed/);
    });

    test("enqueue after flush throws", async () => {
        const uow = new InMemoryUnitOfWork();
        await uow.flush(async () => { });
        expect(() => uow.enqueue({})).toThrow(/cannot enqueue/);
    });
});
