import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyEventV2WithJWTAuthorizer,
    APIGatewayProxyResultV2,
} from "aws-lambda";
import { ZodError, type ZodSchema, z } from "zod";
import {
    IDEMPOTENCY_HEADER,
    IDEMPOTENT_REPLAY_HEADER,
    IdempotencyKeySchema,
} from "@codetype/shared/schemas/idempotency";
import type { RaceCommandBus } from "@codetype/domain/RaceCommandBus";
import type { CommandPayload } from "@codetype/domain/RaceCommandBus";
import type { Clock } from "@codetype/domain/ports";
import { AppError, Errors } from "./AppError";

const CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function findHeader(
    headers: Record<string, string | undefined> | undefined,
    name: string,
): string | undefined {
    if (!headers) return undefined;
    const lc = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === lc) return v ?? undefined;
    }
    return undefined;
}

function structuredLog(entry: Record<string, unknown>) {
    console.log(JSON.stringify(entry));
}

function toAppError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof ZodError) {
        return Errors.BadRequest("validation failed", err.flatten());
    }
    if (err instanceof SyntaxError) return Errors.BadRequest("invalid json");
    return Errors.Internal(err instanceof Error ? err.message : "unknown error");
}

export interface RaceCommandCtx {
    requestId: string;
    route: string;
    userId: string;
    commandId: string;
    correlationId: string;
}

type HttpEvent =
    | APIGatewayProxyEventV2
    | APIGatewayProxyEventV2WithJWTAuthorizer<Record<string, unknown>>;

export interface RaceCommandHandlerArgs<I, O> {
    inputSchema: ZodSchema<I>;
    bus: RaceCommandBus;
    clock: Clock;
    newOutboxId: () => string;
    raceId: (input: I, ctx: RaceCommandCtx) => string;
    build: (input: I, ctx: RaceCommandCtx) => Promise<CommandPayload<O>>;
}

/**
 * HTTP wrapper for race-event-sourced commands. Reads Idempotency-Key,
 * delegates to RaceCommandBus, surfaces replay via the X-Idempotent-Replay
 * response header. Returns the handler's `result` body.
 */
export function withRaceCommand<I, O>(
    args: RaceCommandHandlerArgs<I, O>,
): (event: HttpEvent) => Promise<APIGatewayProxyResultV2> {
    return async (event) => {
        const requestId = event.requestContext.requestId;
        const route =
            event.routeKey ??
            `${event.requestContext.http?.method ?? "?"} ${event.requestContext.http?.path ?? "?"}`;
        const start = Date.now();
        try {
            const claims = (
                event as APIGatewayProxyEventV2WithJWTAuthorizer<
                    Record<string, unknown>
                >
            ).requestContext?.authorizer?.jwt?.claims as
                | Record<string, unknown>
                | undefined;
            const userId = claims?.sub as string | undefined;
            if (!userId) throw Errors.Unauthorized();

            const headerVal = findHeader(
                event.headers as Record<string, string | undefined> | undefined,
                IDEMPOTENCY_HEADER,
            );
            if (!headerVal) {
                throw new AppError(
                    "idempotency.missing",
                    400,
                    `${IDEMPOTENCY_HEADER} header is required`,
                );
            }
            const commandId = (() => {
                try {
                    return IdempotencyKeySchema.parse(headerVal);
                } catch (e) {
                    throw new AppError(
                        "idempotency.invalid",
                        400,
                        `${IDEMPOTENCY_HEADER} must be a UUID`,
                    );
                }
            })();

            const raw = event.body ? JSON.parse(event.body) : {};
            const input = args.inputSchema.parse(raw);
            const ctx: RaceCommandCtx = {
                requestId,
                route,
                userId,
                commandId,
                correlationId: requestId,
            };

            const out = await args.bus.dispatch({
                userId,
                commandId,
                raceId: args.raceId(input, ctx),
                correlationId: ctx.correlationId,
                newOutboxId: args.newOutboxId,
                clock: args.clock,
                handler: () => args.build(input, ctx),
            });

            structuredLog({
                requestId,
                route,
                status: out.httpStatus,
                ms: Date.now() - start,
                replay: out.replay,
                eventCount: out.events.length,
            });

            return {
                statusCode: out.httpStatus,
                headers: {
                    ...CORS_HEADERS,
                    ...(out.replay ? { [IDEMPOTENT_REPLAY_HEADER]: "true" } : {}),
                },
                body: JSON.stringify(out.result),
            };
        } catch (err) {
            const appErr = toAppError(err);
            structuredLog({
                requestId,
                route,
                status: appErr.status,
                ms: Date.now() - start,
                code: appErr.code,
                err: appErr.message,
            });
            return {
                statusCode: appErr.status,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    error: {
                        code: appErr.code,
                        message: appErr.message,
                        ...(appErr.details !== undefined
                            ? { details: appErr.details }
                            : {}),
                    },
                }),
            };
        }
    };
}

export const CreateRaceRequestSchema = z.object({
    raceId: z.string().uuid(),
    snippetId: z.string().min(1),
    displayName: z.string().min(1).max(24),
});
export type CreateRaceRequest = z.infer<typeof CreateRaceRequestSchema>;
