import { z } from "zod";

export const IDEMPOTENCY_HEADER = "Idempotency-Key" as const;

export const IdempotencyKeySchema = z.string().uuid();

export const IdempotencyResultSchema = z.object({
    commandId: z.string().uuid(),
    userId: z.string(),
    status: z.enum(["ok", "error"]),
    httpStatus: z.number().int().min(100).max(599),
    body: z.unknown(),
    storedAt: z.string().datetime(),
    ttl: z.number().int().nonnegative(),
});
export type IdempotencyResult = z.infer<typeof IdempotencyResultSchema>;

export const IDEMPOTENT_REPLAY_HEADER = "X-Idempotent-Replay" as const;
