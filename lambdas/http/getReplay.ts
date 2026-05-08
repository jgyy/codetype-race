import { z } from "zod";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ReplayResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { REPLAY_BUCKET, s3 } from "../src/s3";
import { GetReplayKeyQuery, queryBus } from "./_container";

const EmptyBody = z.object({}).passthrough();
const URL_TTL_SECONDS = 300;

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const roomId = ctx.pathParameters.roomId;
    if (!roomId) throw Errors.BadRequest("roomId required");
    try {
        const { key } = await queryBus.execute(new GetReplayKeyQuery(roomId));
        const cmd = new GetObjectCommand({ Bucket: REPLAY_BUCKET, Key: key });
        const downloadUrl = await getSignedUrl(s3, cmd, {
            expiresIn: URL_TTL_SECONDS,
        });
        return ReplayResponseSchema.parse({ download_url: downloadUrl, key });
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
