import { z } from "zod";
import { withHttp } from "../../src/middleware";
import { requireProgressionEnabled } from "../../src/AppError";
import {
    ALL_RULES,
} from "@codetype/shared/progression/rules";

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

export const handler = withHttp(EmptyBody, async () => {
    requireProgressionEnabled();
    const items = ALL_RULES.filter((r) => !r.def.hidden).map((r) => ({
        id: r.def.id,
        title: r.def.title,
        description: r.def.description,
        category: r.def.category,
        tier: r.def.tier,
        hidden: r.def.hidden,
        xp: r.def.xp,
    }));
    return CatalogResponseSchema.parse({ achievements: items });
});
