import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  DynamoDBStreamEvent,
} from "aws-lambda";
import { ZodError, type ZodSchema } from "zod";
import { AppError, Errors } from "./AppError";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

interface LogEntry {
  requestId: string;
  route: string;
  status: number;
  ms: number;
  code?: string;
  err?: string;
}

function log(entry: LogEntry) {
  // Structured single-line JSON for CloudWatch Logs Insights friendliness.
  console.log(JSON.stringify(entry));
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return Errors.BadRequest("validation failed", err.flatten());
  }
  if (err instanceof SyntaxError) {
    return Errors.BadRequest("invalid json");
  }
  return Errors.Internal(err instanceof Error ? err.message : "unknown error");
}

function errorBody(err: AppError) {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
}

export interface HttpCtx {
  requestId: string;
  route: string;
  userId?: string;
  groups: string[];
  pathParameters: Record<string, string | undefined>;
  queryStringParameters: Record<string, string | undefined>;
}

/**
 * Cognito surfaces group membership in the JWT as `cognito:groups`, but
 * the claim type varies (string array, comma-separated string, or
 * absent). Normalize to a plain string[].
 */
function extractGroups(claims: Record<string, unknown> | undefined): string[] {
  const raw = claims?.["cognito:groups"];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

type HttpEvent =
  | APIGatewayProxyEventV2
  | APIGatewayProxyEventV2WithJWTAuthorizer<Record<string, unknown>>;

export function withHttp<I, O>(
  inputSchema: ZodSchema<I>,
  handler: (input: I, ctx: HttpCtx) => Promise<O>,
): (event: HttpEvent) => Promise<APIGatewayProxyResultV2> {
  return async (event) => {
    const requestId = event.requestContext.requestId;
    const route = event.routeKey ?? `${event.requestContext.http?.method ?? "?"} ${event.requestContext.http?.path ?? "?"}`;
    const start = Date.now();
    try {
      const raw = event.body ? JSON.parse(event.body) : {};
      const input = inputSchema.parse(raw);
      const claims = (event as APIGatewayProxyEventV2WithJWTAuthorizer<Record<string, unknown>>)
        .requestContext?.authorizer?.jwt?.claims as Record<string, unknown> | undefined;
      const userId = claims?.sub as string | undefined;
      const groups = extractGroups(claims);
      const out = await handler(input, {
        requestId,
        route,
        userId,
        groups,
        pathParameters: event.pathParameters ?? {},
        queryStringParameters: event.queryStringParameters ?? {},
      });
      log({ requestId, route, status: 200, ms: Date.now() - start });
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(out),
      };
    } catch (err) {
      const appErr = toAppError(err);
      log({
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
        body: JSON.stringify(errorBody(appErr)),
      };
    }
  };
}

export interface WsCtx {
  connectionId: string;
  requestId: string;
  routeKey: string;
}

interface WsResult {
  statusCode: number;
  body: string;
}

/**
 * Wrap a WS message handler with parsing/validation/logging. The WS handler
 * receives the validated input plus the connection context. Errors are
 * mapped to a status code and an `{error:{code,message}}` body for
 * symmetry with HTTP — API Gateway WS forwards this to the client.
 */
export function withWs<I>(
  inputSchema: ZodSchema<I>,
  handler: (input: I, ctx: WsCtx) => Promise<void>,
): (event: APIGatewayProxyWebsocketEventV2) => Promise<WsResult> {
  return async (event) => {
    const requestId = event.requestContext.requestId;
    const routeKey = event.requestContext.routeKey;
    const connectionId = event.requestContext.connectionId;
    const start = Date.now();
    try {
      const raw = event.body ? JSON.parse(event.body) : {};
      const input = inputSchema.parse(raw);
      await handler(input, { connectionId, requestId, routeKey });
      log({ requestId, route: routeKey, status: 200, ms: Date.now() - start });
      return { statusCode: 200, body: "ok" };
    } catch (err) {
      const appErr = toAppError(err);
      log({
        requestId,
        route: routeKey,
        status: appErr.status,
        ms: Date.now() - start,
        code: appErr.code,
        err: appErr.message,
      });
      return {
        statusCode: appErr.status,
        body: JSON.stringify(errorBody(appErr)),
      };
    }
  };
}

/**
 * Wrap WS connect/disconnect (no body) and lifecycle handlers that read
 * query strings, headers, or just need structured logging.
 */
export function withWsLifecycle(
  handler: (
    event: APIGatewayProxyWebsocketEventV2,
    ctx: WsCtx,
  ) => Promise<WsResult>,
): (event: APIGatewayProxyWebsocketEventV2) => Promise<WsResult> {
  return async (event) => {
    const requestId = event.requestContext.requestId;
    const routeKey = event.requestContext.routeKey;
    const connectionId = event.requestContext.connectionId;
    const start = Date.now();
    try {
      const result = await handler(event, { connectionId, requestId, routeKey });
      log({
        requestId,
        route: routeKey,
        status: result.statusCode,
        ms: Date.now() - start,
      });
      return result;
    } catch (err) {
      const appErr = toAppError(err);
      log({
        requestId,
        route: routeKey,
        status: appErr.status,
        ms: Date.now() - start,
        code: appErr.code,
        err: appErr.message,
      });
      return {
        statusCode: appErr.status,
        body: JSON.stringify(errorBody(appErr)),
      };
    }
  };
}

/**
 * DDB stream wrapper — no input schema, just structured logging and
 * crash isolation per invocation.
 */
export function withStream(
  handler: (event: DynamoDBStreamEvent) => Promise<void>,
): (event: DynamoDBStreamEvent) => Promise<void> {
  return async (event) => {
    const requestId = event.Records[0]?.eventID ?? "stream";
    const start = Date.now();
    try {
      await handler(event);
      log({
        requestId,
        route: "stream:broadcast",
        status: 200,
        ms: Date.now() - start,
      });
    } catch (err) {
      const appErr = toAppError(err);
      log({
        requestId,
        route: "stream:broadcast",
        status: appErr.status,
        ms: Date.now() - start,
        code: appErr.code,
        err: appErr.message,
      });
      throw err; // let Lambda retry per the event source config
    }
  };
}
