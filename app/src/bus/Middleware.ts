export type BusMessage = { kind: string };

export type Next<R = unknown> = (msg: BusMessage) => Promise<R>;

export type Middleware = (
    msg: BusMessage,
    next: Next,
) => Promise<unknown>;

export function compose(
    middlewares: readonly Middleware[],
    terminal: Next,
): Next {
    if (middlewares.length === 0) return terminal;
    return middlewares.reduceRight<Next>(
        (downstream, mw) =>
            (msg) =>
                mw(msg, downstream),
        terminal,
    );
}
