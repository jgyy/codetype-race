export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export function requireAdmin(ctx: { userId?: string; groups: string[] }): void {
  if (!ctx.userId) throw Errors.Unauthorized();
  if (!ctx.groups.includes("admin")) throw Errors.Forbidden();
}

export function requireMod(ctx: { userId?: string; groups: string[] }): void {
  if (!ctx.userId) throw Errors.Unauthorized();
  if (!ctx.groups.includes("admin") && !ctx.groups.includes("mod")) {
    throw Errors.Forbidden();
  }
}

export function requireTournamentsEnabled(): void {
  if (process.env.ENABLE_TOURNAMENTS !== "true") {
    throw new AppError(
      "FEATURE_DISABLED",
      503,
      "tournaments are disabled",
    );
  }
}

export function requireFriendsEnabled(): void {
  if (process.env.ENABLE_FRIENDS !== "true") {
    throw new AppError("FEATURE_DISABLED", 503, "friends are disabled");
  }
}

export function requirePresenceEnabled(): void {
  if (process.env.ENABLE_PRESENCE !== "true") {
    throw new AppError("FEATURE_DISABLED", 503, "presence is disabled");
  }
}

export function requireGuildsEnabled(): void {
  if (process.env.ENABLE_GUILDS !== "true") {
    throw new AppError("FEATURE_DISABLED", 503, "guilds are disabled");
  }
}

export function requireProgressionEnabled(): void {
  if (process.env.ENABLE_PROGRESSION !== "true") {
    throw new AppError("FEATURE_DISABLED", 503, "progression is disabled");
  }
}

export const Errors = {
  Unauthorized: () => new AppError("UNAUTHORIZED", 401, "unauthorized"),
  NotFound: (what: string) =>
    new AppError("NOT_FOUND", 404, `${what} not found`),
  Forbidden: () => new AppError("FORBIDDEN", 403, "forbidden"),
  RateLimited: () => new AppError("RATE_LIMITED", 429, "rate limited"),
  BadRequest: (msg: string, details?: unknown) =>
    new AppError("BAD_REQUEST", 400, msg, details),
  Conflict: (msg: string) => new AppError("CONFLICT", 409, msg),
  Internal: (msg = "internal error") =>
    new AppError("INTERNAL", 500, msg),
};
