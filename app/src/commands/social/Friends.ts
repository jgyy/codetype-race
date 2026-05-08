import { Command, type CommandHandler } from "../../bus/Command";

export interface FriendsSink {
    sendRequest(actorId: string, targetId: string): Promise<void>;
    accept(actorId: string, requesterId: string): Promise<void>;
    block(actorId: string, targetId: string): Promise<void>;
    remove(actorId: string, targetId: string): Promise<void>;
}

export type FriendActionStatus = "pending" | "accepted" | "blocked" | "removed";

export interface FriendActionResult {
    status: FriendActionStatus;
}

export interface FriendActionInput {
    actorId: string;
    targetId: string;
}

export class SendFriendRequestCommand extends Command<FriendActionResult> {
    constructor(public readonly input: FriendActionInput) {
        super();
    }
}

export class AcceptFriendRequestCommand extends Command<FriendActionResult> {
    constructor(public readonly input: FriendActionInput) {
        super();
    }
}

export class BlockUserCommand extends Command<FriendActionResult> {
    constructor(public readonly input: FriendActionInput) {
        super();
    }
}

export class RemoveFriendCommand extends Command<FriendActionResult> {
    constructor(public readonly input: FriendActionInput) {
        super();
    }
}

export class SendFriendRequestHandler
    implements CommandHandler<SendFriendRequestCommand> {
    constructor(private readonly sink: FriendsSink) { }
    async execute(c: SendFriendRequestCommand): Promise<FriendActionResult> {
        await this.sink.sendRequest(c.input.actorId, c.input.targetId);
        return { status: "pending" };
    }
}

export class AcceptFriendRequestHandler
    implements CommandHandler<AcceptFriendRequestCommand> {
    constructor(private readonly sink: FriendsSink) { }
    async execute(c: AcceptFriendRequestCommand): Promise<FriendActionResult> {
        await this.sink.accept(c.input.actorId, c.input.targetId);
        return { status: "accepted" };
    }
}

export class BlockUserHandler implements CommandHandler<BlockUserCommand> {
    constructor(private readonly sink: FriendsSink) { }
    async execute(c: BlockUserCommand): Promise<FriendActionResult> {
        await this.sink.block(c.input.actorId, c.input.targetId);
        return { status: "blocked" };
    }
}

export class RemoveFriendHandler implements CommandHandler<RemoveFriendCommand> {
    constructor(private readonly sink: FriendsSink) { }
    async execute(c: RemoveFriendCommand): Promise<FriendActionResult> {
        await this.sink.remove(c.input.actorId, c.input.targetId);
        return { status: "removed" };
    }
}
