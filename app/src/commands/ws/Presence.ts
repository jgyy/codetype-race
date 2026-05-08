import { Command, type CommandHandler } from "../../bus/Command";

export interface PresenceWriteSink {
    put(userId: string, connectionId: string): Promise<void>;
    deleteByConnection(connectionId: string): Promise<void>;
    userIdByConnection(connectionId: string): Promise<string | null>;
    touch(userId: string, connectionId: string): Promise<void>;
}

/* ------------------- ConnectPresence ---------------------------------- */

export interface ConnectPresenceInput {
    userId: string;
    connectionId: string;
}

export class ConnectPresenceCommand extends Command<void> {
    constructor(public readonly input: ConnectPresenceInput) {
        super();
    }
}

export class ConnectPresenceHandler
    implements CommandHandler<ConnectPresenceCommand> {
    constructor(private readonly sink: PresenceWriteSink) { }
    async execute(c: ConnectPresenceCommand): Promise<void> {
        await this.sink.put(c.input.userId, c.input.connectionId);
    }
}

/* ------------------- DisconnectPresence ------------------------------- */

export class DisconnectPresenceCommand extends Command<void> {
    constructor(public readonly connectionId: string) {
        super();
    }
}

export class DisconnectPresenceHandler
    implements CommandHandler<DisconnectPresenceCommand> {
    constructor(private readonly sink: PresenceWriteSink) { }
    async execute(c: DisconnectPresenceCommand): Promise<void> {
        await this.sink.deleteByConnection(c.connectionId);
    }
}

/* ------------------- TouchPresence ------------------------------------ */

export class TouchPresenceCommand extends Command<void> {
    constructor(public readonly connectionId: string) {
        super();
    }
}

export class TouchPresenceHandler
    implements CommandHandler<TouchPresenceCommand> {
    constructor(private readonly sink: PresenceWriteSink) { }
    async execute(c: TouchPresenceCommand): Promise<void> {
        const userId = await this.sink.userIdByConnection(c.connectionId);
        if (!userId) return;
        await this.sink.touch(userId, c.connectionId);
    }
}
