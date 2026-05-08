import { z } from "zod";
import { CurrentSeasonResponseSchema } from "@codetype/shared/tournaments";
import { withHttp } from "../../src/middleware";
import { seasons } from "../../src/repos/SeasonRepo";

const DAY_MS = 24 * 60 * 60 * 1000;
const EmptyBody = z.object({}).passthrough();

export const handler = withHttp(EmptyBody, async () => {
    const active = await seasons.listByStatus("active");
    if (active.length === 0) {
        return CurrentSeasonResponseSchema.parse({
            season: null,
            daysRemaining: null,
        });
    }
    // If multiple are active (shouldn't happen), pick the latest startsAt.
    active.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const season = active[0]!;
    const remainingMs = new Date(season.endsAt).getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(remainingMs / DAY_MS));
    return CurrentSeasonResponseSchema.parse({ season, daysRemaining });
});
