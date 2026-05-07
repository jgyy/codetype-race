import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ReplayUploadUrlResponseSchema } from "@codetype/shared/schemas";
import { withHttp } from "../src/middleware";
import { Errors } from "../src/AppError";
import { rooms } from "../src/repos/RoomRepo";
import { REPLAY_BUCKET, s3 } from "../src/s3";

const EmptyBody = z.object({}).passthrough();

const URL_TTL_SECONDS = 300;

function replayKey(roomId: string): string {
  return `replays/${roomId}.json`;
}

export const handler = withHttp(EmptyBody, async (_input, ctx) => {
  const roomId = ctx.pathParameters.roomId;
  if (!roomId) throw Errors.BadRequest("roomId required");

  // Caller must have participated in the room. Trust the player roster
  // as the source of truth: only racers/spectators with a PLAYER#<name>
  // row qualify. Without a user_id we accept anyone for v1 since the
  // join flow is unauthenticated; this is a known soft check.
  const room = await rooms.getMeta(roomId);
  if (!room) throw Errors.NotFound("room");

  const key = replayKey(roomId);
  const cmd = new PutObjectCommand({
    Bucket: REPLAY_BUCKET,
    Key: key,
    ContentType: "application/json",
  });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: URL_TTL_SECONDS });

  await rooms.recordReplay(roomId, key);

  return ReplayUploadUrlResponseSchema.parse({
    upload_url: uploadUrl,
    key,
  });
});
