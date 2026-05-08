import { DomainError } from "@codetype/domain";
import { Command, type CommandHandler } from "../../bus/Command";

export interface QuestDefLite {
    id: string;
    target: number;
    xp: number;
}

export interface QuestProgressLite {
    progress: number;
    claimed: boolean;
}

export interface QuestsSink {
    getProgress(
        userId: string,
        rotationId: string,
        questId: string,
    ): Promise<QuestProgressLite | null>;
    /** Returns false on race-conflict (already claimed). */
    claim(userId: string, rotationId: string, def: QuestDefLite): Promise<boolean>;
}

export interface ClaimQuestInput {
    userId: string;
    rotationId: string;
    def: QuestDefLite;
}

export interface ClaimQuestResult {
    claimed: true;
    quest_id: string;
    xp_awarded: number;
}

export class ClaimQuestCommand extends Command<ClaimQuestResult> {
    constructor(public readonly input: ClaimQuestInput) {
        super();
    }
}

export class ClaimQuestHandler implements CommandHandler<ClaimQuestCommand> {
    constructor(private readonly quests: QuestsSink) { }

    async execute(c: ClaimQuestCommand): Promise<ClaimQuestResult> {
        const { userId, rotationId, def } = c.input;
        const progress = await this.quests.getProgress(userId, rotationId, def.id);
        if (!progress) throw new DomainError("quest.progress_not_found", 404);
        if (progress.claimed) {
            throw new DomainError("quest.already_claimed", 409);
        }
        if (progress.progress < def.target) {
            throw new DomainError("quest.not_complete", 409);
        }
        const ok = await this.quests.claim(userId, rotationId, def);
        if (!ok) throw new DomainError("quest.claim_conflict", 409);
        return { claimed: true, quest_id: def.id, xp_awarded: def.xp };
    }
}
