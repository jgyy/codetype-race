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
