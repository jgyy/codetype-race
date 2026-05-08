import type { UnitOfWork } from "@codetype/domain";

/**
 * Default UnitOfWork: in-memory queue, single flush.
 *
 * Throws if flushed more than once — UoWs are single-use; reuse is
 * a programming error that would silently re-send already-applied
 * items.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
    private buf: unknown[] = [];
    private flushed = false;

    enqueue(item: unknown): void {
        if (this.flushed) {
            throw new Error("UnitOfWork: cannot enqueue after flush");
        }
        this.buf.push(item);
    }

    items(): readonly unknown[] {
        return this.buf;
    }

    async flush(sender: (items: unknown[]) => Promise<void>): Promise<void> {
        if (this.flushed) {
            throw new Error("UnitOfWork: already flushed");
        }
        this.flushed = true;
        if (this.buf.length === 0) return;
        const items = this.buf;
        this.buf = [];
        await sender(items);
    }
}
