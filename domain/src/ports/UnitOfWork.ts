export interface UnitOfWork {
    enqueue(item: unknown): void;
    items(): readonly unknown[];
    flush(sender: (items: unknown[]) => Promise<void>): Promise<void>;
}
