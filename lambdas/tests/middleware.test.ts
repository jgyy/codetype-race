import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  withHttp,
  withWs,
  withWsLifecycle,
} from "../src/middleware";
import { AppError, Errors } from "../src/AppError";

const Body = z.object({ name: z.string() });

function httpEvent(opts: {
  body?: string;
  routeKey?: string;
  userId?: string;
  pathParameters?: Record<string, string>;
}) {
  return {
    body: opts.body,
    routeKey: opts.routeKey ?? "POST /test",
    pathParameters: opts.pathParameters,
    requestContext: {
      requestId: "req-1",
      http: { method: "POST", path: "/test" },
      authorizer: opts.userId
        ? { jwt: { claims: { sub: opts.userId } } }
        : undefined,
    },
  } as any;
}

describe("withHttp", () => {
  test("valid input returns 200 with parsed body", async () => {
    const h = withHttp(Body, async (input) => ({ hi: input.name }));
    const res: any = await h(httpEvent({ body: JSON.stringify({ name: "x" }) }));
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({ hi: "x" });
  });

  test("schema failure returns 400 with validation envelope", async () => {
    const h = withHttp(Body, async () => ({ ok: true }));
    const res: any = await h(httpEvent({ body: JSON.stringify({}) }));
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error.code).toBe("BAD_REQUEST");
    expect(parsed.error.details).toBeDefined();
  });

  test("malformed JSON returns 400 BAD_REQUEST", async () => {
    const h = withHttp(Body, async () => ({ ok: true }));
    const res: any = await h(httpEvent({ body: "{not json" }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("BAD_REQUEST");
  });

  test("AppError mapped to its status and code", async () => {
    const h = withHttp(Body, async () => {
      throw Errors.NotFound("widget");
    });
    const res: any = await h(httpEvent({ body: JSON.stringify({ name: "x" }) }));
    expect(res.statusCode).toBe(404);
    const parsed = JSON.parse(res.body);
    expect(parsed.error.code).toBe("NOT_FOUND");
    expect(parsed.error.message).toContain("widget");
  });

  test("unknown error becomes 500 INTERNAL", async () => {
    const h = withHttp(Body, async () => {
      throw new Error("kaboom");
    });
    const res: any = await h(httpEvent({ body: JSON.stringify({ name: "x" }) }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error.code).toBe("INTERNAL");
  });

  test("ctx.userId is populated from JWT claims.sub", async () => {
    let seen: string | undefined;
    const h = withHttp(Body, async (_input, ctx) => {
      seen = ctx.userId;
      return {};
    });
    await h(httpEvent({ body: JSON.stringify({ name: "x" }), userId: "u-1" }));
    expect(seen).toBe("u-1");
  });

  test("logs include requestId/route/status/ms", async () => {
    const lines: string[] = [];
    const orig = console.log;
    console.log = (s: string) => lines.push(String(s));
    try {
      const h = withHttp(Body, async () => ({}));
      await h(httpEvent({ body: JSON.stringify({ name: "x" }) }));
    } finally {
      console.log = orig;
    }
    const entry = JSON.parse(lines[0]!);
    expect(entry.requestId).toBe("req-1");
    expect(entry.route).toBe("POST /test");
    expect(entry.status).toBe(200);
    expect(typeof entry.ms).toBe("number");
  });
});

function wsEvent(body: string | undefined) {
  return {
    body,
    requestContext: {
      requestId: "req-ws",
      connectionId: "c-1",
      routeKey: "$default",
    },
  } as any;
}

describe("withWs", () => {
  test("valid message yields 200", async () => {
    const Schema = z.object({ action: z.literal("ping") });
    const h = withWs(Schema, async () => {});
    const res = await h(wsEvent(JSON.stringify({ action: "ping" })));
    expect(res.statusCode).toBe(200);
  });

  test("invalid message yields 400 envelope", async () => {
    const Schema = z.object({ action: z.literal("ping") });
    const h = withWs(Schema, async () => {});
    const res = await h(wsEvent(JSON.stringify({ action: "wat" })));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe("BAD_REQUEST");
  });

  test("AppError thrown by handler maps cleanly", async () => {
    const Schema = z.object({ action: z.literal("ping") });
    const h = withWs(Schema, async () => {
      throw new AppError("RATE_LIMITED", 429, "slow down");
    });
    const res = await h(wsEvent(JSON.stringify({ action: "ping" })));
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body).error.code).toBe("RATE_LIMITED");
  });
});

describe("withWsLifecycle", () => {
  test("forwards handler result", async () => {
    const h = withWsLifecycle(async () => ({ statusCode: 200, body: "ok" }));
    const res = await h(wsEvent(undefined));
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("ok");
  });
  test("throws translate to error envelope", async () => {
    const h = withWsLifecycle(async () => {
      throw Errors.Forbidden();
    });
    const res = await h(wsEvent(undefined));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe("FORBIDDEN");
  });
});
