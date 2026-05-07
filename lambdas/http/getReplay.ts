import { z } from "zod";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ReplayResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { rooms } from "../src/repos/RoomRepo";
import { REPLAY_BUCKET, s3 } from "../src/s3";

const EmptyBody = z.object({}).passthrough();
const URL_TTL_SECONDS = 300;

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
  const roomId = ctx.pathParameters.roomId;
  if (!roomId) throw Errors.BadRequest("roomId required");

  const room = await rooms.getMeta(roomId);
  if (!room) throw Errors.NotFound("room");
  const key = (room as any).replay_key as string | undefined;
  if (!key) throw Errors.NotFound("replay");

  const cmd = new GetObjectCommand({ Bucket: REPLAY_BUCKET, Key: key });
  const downloadUrl = await getSignedUrl(s3, cmd, { expiresIn: URL_TTL_SECONDS });
  return ReplayResponseSchema.parse({ download_url: downloadUrl, key });
});
