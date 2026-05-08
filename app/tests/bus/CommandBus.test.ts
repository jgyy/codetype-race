import { describe, expect, test } from "bun:test";
import { Command, CommandBus, type CommandHandler } from "../../src";

class EchoCommand extends Command<string> {
    constructor(public readonly value: string) {
        super();
    }
}

class EchoHandler implements CommandHandler<EchoCommand> {
    async execute(c: EchoCommand) {
        return c.value.toUpperCase();
    }
}

describe("CommandBus", () => {
    test("dispatches to registered handler", async () => {
        const bus = new CommandBus().register(EchoCommand, new EchoHandler());
        expect(await bus.dispatch(new EchoCommand("hi"))).toBe("HI");
    });

    test("throws when no handler registered", async () => {
        const bus = new CommandBus();
        await expect(bus.dispatch(new EchoCommand("x"))).rejects.toThrow(
            /no handler/,
        );
    });

    test("middleware runs in registration order, outermost first", async () => {
        const trace: string[] = [];
        const bus = new CommandBus()
            .use(async (msg, next) => {
                trace.push("a-pre");
                const r = await next(msg);
                trace.push("a-post");
                return r;
            })
            .use(async (msg, next) => {
                trace.push("b-pre");
                const r = await next(msg);
                trace.push("b-post");
                return r;
            })
            .register(EchoCommand, new EchoHandler());
        await bus.dispatch(new EchoCommand("x"));
        expect(trace).toEqual(["a-pre", "b-pre", "b-post", "a-post"]);
    });
});
