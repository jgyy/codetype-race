import { z } from "zod";
import { ALL_RULES } from "@codetype/shared/progression/rules";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../../src/middleware";
import { AppError, requireProgressionEnabled } from "../../src/AppError";
import { GetAchievementCatalogQuery, queryBus } from "../_container";

const EmptyBody = z.object({}).passthrough();

const CatalogResponseSchema = z.object({
    achievements: z.array(
        z.object({
            id: z.string(),
            title: z.string(),
            description: z.string(),
            category: z.string(),
            tier: z.string(),
            hidden: z.boolean(),
            xp: z.number().int(),
        }),
    ),
});

const ALL_DEFS = ALL_RULES.map((r) => ({
    id: r.def.id,
    title: r.def.title,
    description: r.def.description,
    category: r.def.category,
    tier: r.def.tier,
    hidden: r.def.hidden,
    xp: r.def.xp,
}));

export const handler = withHttp(EmptyBody, async () => {
    requireProgressionEnabled();
    try {
        const result = await queryBus.execute(
            new GetAchievementCatalogQuery(ALL_DEFS),
        );
        return CatalogResponseSchema.parse(result);
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
