import { DomainError } from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

export interface AchievementsSink {
    listForUser(userId: string): Promise<Array<{ achievement_id: string }>>;
    setPinned(userId: string, slots: string[]): Promise<void>;
}

export interface PinAchievementsInput {
    userId: string;
    slots: string[];
    /** Pre-validated set of known achievement ids — edge passes the keyset. */
    knownIds: ReadonlySet<string>;
}

export interface PinAchievementsResult {
    pinned: string[];
}

export class PinAchievementsCommand extends Command<PinAchievementsResult> {
    constructor(public readonly input: PinAchievementsInput) {
        super();
    }
}

export class PinAchievementsHandler
    implements CommandHandler<PinAchievementsCommand> {
    constructor(private readonly achievements: AchievementsSink) { }

    async execute(c: PinAchievementsCommand): Promise<PinAchievementsResult> {
        const { userId, slots, knownIds } = c.input;
        if (new Set(slots).size !== slots.length) {
            throw new DomainError("pin.duplicate_ids", 400);
        }
        for (const id of slots) {
            if (!knownIds.has(id)) {
                throw new DomainError(
                    "pin.unknown_achievement",
                    400,
                    `unknown achievement: ${id}`,
                );
            }
        }
        const owned = new Set(
            (await this.achievements.listForUser(userId)).map(
                (u) => u.achievement_id,
            ),
        );
        for (const id of slots) {
            if (!owned.has(id)) {
                throw new DomainError(
                    "pin.not_unlocked",
                    409,
                    `not unlocked: ${id}`,
                );
            }
        }
        await this.achievements.setPinned(userId, slots);
        return { pinned: slots };
    }
}
