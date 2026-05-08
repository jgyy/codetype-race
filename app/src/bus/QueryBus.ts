import {
    Query,
    type QueryHandler,
    type ResultOf,
} from "./Command";
import { compose, type Middleware } from "./Middleware";

export class QueryBus {
    private handlers = new Map<string, QueryHandler<Query<unknown>>>();
    private middleware: Middleware[] = [];

    register<Q extends Query<unknown>>(
        ctor: new (...args: never[]) => Q,
        handler: QueryHandler<Q>,
    ): this {
        this.handlers.set(
            ctor.name,
            handler as QueryHandler<Query<unknown>>,
        );
        return this;
    }

    use(mw: Middleware): this {
        this.middleware.push(mw);
        return this;
    }

    async execute<Q extends Query<unknown>>(query: Q): Promise<ResultOf<Q>> {
        const chain = compose(this.middleware, async (msg) => {
            const h = this.handlers.get(msg.kind);
            if (!h) {
                throw new Error(`QueryBus: no handler for ${msg.kind}`);
            }
            return h.execute(msg as Query<unknown>);
        });
        return (await chain(query)) as ResultOf<Q>;
    }
}
