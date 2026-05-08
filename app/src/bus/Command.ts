const PHANTOM_RESULT = "__phantom_result__";

export abstract class Command<TResult = unknown> {
    declare readonly [PHANTOM_RESULT]: () => TResult;
    get kind(): string {
        return this.constructor.name;
    }
}

export abstract class Query<TResult = unknown> {
    declare readonly [PHANTOM_RESULT]: () => TResult;
    get kind(): string {
        return this.constructor.name;
    }
}

export type ResultOf<C> = C extends { [PHANTOM_RESULT]: () => infer R }
    ? R
    : never;

export interface CommandHandler<C extends Command<unknown>> {
    execute(command: C): Promise<ResultOf<C>>;
}

export interface QueryHandler<Q extends Query<unknown>> {
    execute(query: Q): Promise<ResultOf<Q>>;
}
