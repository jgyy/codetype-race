import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ReplayUploadUrlResponseSchema } from "@codetype/shared/schemas";
import { DomainError } from "@codetype/domain";
import { withHttp } from "../src/middleware";
import { AppError, Errors } from "../src/AppError";
import { REPLAY_BUCKET, s3 } from "../src/s3";
import { commandBus, ReserveReplayUploadCommand } from "./_container";

const EmptyBody = z.object({}).passthrough();
const URL_TTL_SECONDS = 300;

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
    const roomId = ctx.pathParameters.roomId;
    if (!roomId) throw Errors.BadRequest("roomId required");
    try {
        const { key } = await commandBus.dispatch(
            new ReserveReplayUploadCommand({ roomId }),
        );
        const cmd = new PutObjectCommand({
            Bucket: REPLAY_BUCKET,
            Key: key,
            ContentType: "application/json",
        });
        const uploadUrl = await getSignedUrl(s3, cmd, {
            expiresIn: URL_TTL_SECONDS,
        });
        return ReplayUploadUrlResponseSchema.parse({
            upload_url: uploadUrl,
            key,
        });
    } catch (e) {
        if (e instanceof DomainError) {
            throw new AppError(e.code, e.status, e.message, e.details);
        }
        throw e;
    }
});
