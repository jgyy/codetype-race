/**
 * UnitOfWork — atomic multi-row write coordination.
 *
 * A command that needs all-or-nothing semantics across multiple
 * adapter operations opens a UoW; participating adapters enqueue
 * tx items into it instead of writing through directly. At end of
 * the unit, a single transactional flush either commits everything
 * or rolls back.
 *
 * The item shape is intentionally opaque (`unknown`) — the domain
 * port doesn't know about DDB Update/Put, but adapters do, and only
 * the matching flush implementation interprets the queued items.
 *
 * Usage:
 *   const uow = new UnitOfWork();
 *   adapter1.enqueueIntoUow(uow, ...);
 *   adapter2.enqueueIntoUow(uow, ...);
 *   await uow.flush(sendTransaction);
 */
export interface UnitOfWork {
    enqueue(item: unknown): void;
    items(): readonly unknown[];
    flush(sender: (items: unknown[]) => Promise<void>): Promise<void>;
}
