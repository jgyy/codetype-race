import { DomainError } from "@codetype/domain";
import { PinnedAchievementsRequestSchema } from "@codetype/shared/progression/achievements";
import { RULES_BY_ID } from "@codetype/shared/progression/rules";
import { withHttp } from "../../src/middleware";
import { AppError, Errors, requireProgressionEnabled } from "../../src/AppError";
import { commandBus, PinAchievementsCommand } from "../_container";

const KNOWN_RULE_IDS = new Set(Object.keys(RULES_BY_ID));

export const handler = withHttp(
    PinnedAchievementsRequestSchema,
    async (input, ctx) => {
        requireProgressionEnabled();
        if (!ctx.userId) throw Errors.Unauthorized();
        try {
            const result = await commandBus.dispatch(
                new PinAchievementsCommand({
                    userId: ctx.userId,
                    slots: input.slots,
                    knownIds: KNOWN_RULE_IDS,
                }),
            );
            return result;
        } catch (e) {
            if (e instanceof DomainError) {
                throw new AppError(e.code, e.status, e.message, e.details);
            }
            throw e;
        }
    },
);
