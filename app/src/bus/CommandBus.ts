import {
    Command,
    type CommandHandler,
    type ResultOf,
} from "./Command";
import { compose, type Middleware } from "./Middleware";

export class CommandBus {
    private handlers = new Map<string, CommandHandler<Command<unknown>>>();
    private middleware: Middleware[] = [];

    register<C extends Command<unknown>>(
        ctor: new (...args: never[]) => C,
        handler: CommandHandler<C>,
    ): this {
        this.handlers.set(
            ctor.name,
            handler as CommandHandler<Command<unknown>>,
        );
        return this;
    }

    use(mw: Middleware): this {
        this.middleware.push(mw);
        return this;
    }

    async dispatch<C extends Command<unknown>>(command: C): Promise<ResultOf<C>> {
        const chain = compose(this.middleware, async (msg) => {
            const h = this.handlers.get(msg.kind);
            if (!h) {
                throw new Error(`CommandBus: no handler for ${msg.kind}`);
            }
            return h.execute(msg as Command<unknown>);
        });
        return (await chain(command)) as ResultOf<C>;
    }
}
