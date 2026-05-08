export interface Broadcaster {
    postTo(connectionId: string, payload: unknown): Promise<boolean>;
}
