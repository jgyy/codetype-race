// ../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);

// ../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// src/AppError.ts
var AppError = class extends Error {
  constructor(code, status = 400, message, details) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "AppError";
  }
};
var Errors = {
  Unauthorized: () => new AppError("UNAUTHORIZED", 401, "unauthorized"),
  NotFound: (what) => new AppError("NOT_FOUND", 404, `${what} not found`),
  Forbidden: () => new AppError("FORBIDDEN", 403, "forbidden"),
  RateLimited: () => new AppError("RATE_LIMITED", 429, "rate limited"),
  BadRequest: (msg, details) => new AppError("BAD_REQUEST", 400, msg, details),
  Conflict: (msg) => new AppError("CONFLICT", 409, msg),
  Internal: (msg = "internal error") => new AppError("INTERNAL", 500, msg)
};

// src/middleware.ts
function log(entry) {
  console.log(JSON.stringify(entry));
}
function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return Errors.BadRequest("validation failed", err.flatten());
  }
  if (err instanceof SyntaxError) {
    return Errors.BadRequest("invalid json");
  }
  return Errors.Internal(err instanceof Error ? err.message : "unknown error");
}
function errorBody(err) {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...err.details !== void 0 ? { details: err.details } : {}
    }
  };
}
function withWsLifecycle(handler2) {
  return async (event) => {
    const requestId = event.requestContext.requestId;
    const routeKey = event.requestContext.routeKey;
    const connectionId = event.requestContext.connectionId;
    const start = Date.now();
    try {
      const result = await handler2(event, { connectionId, requestId, routeKey });
      log({
        requestId,
        route: routeKey,
        status: result.statusCode,
        ms: Date.now() - start
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
        err: appErr.message
      });
      return {
        statusCode: appErr.status,
        body: JSON.stringify(errorBody(appErr))
      };
    }
  };
}

// src/repos/TournConnectionRepo.ts
import {
  DeleteCommand,
  PutCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";

// ../shared/src/ddb-keys.ts
var connGSI1PK = (connectionId) => `CONN#${connectionId}`;
var tournPK = (id) => `TOURN#${id}`;
var tournConnSK = (connectionId) => `CONN#${connectionId}`;

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

// src/repos/TournConnectionRepo.ts
var TTL_SECONDS = 60;
var TournConnectionRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async put(tournId, connectionId, userId) {
    const now = Date.now();
    await this.client.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: tournPK(tournId),
          SK: tournConnSK(connectionId),
          GSI1PK: connGSI1PK(connectionId),
          GSI1SK: tournPK(tournId),
          connection_id: connectionId,
          tourn_id: tournId,
          user_id: userId,
          joined_at: now,
          ttl: Math.floor(now / 1e3) + TTL_SECONDS
        }
      })
    );
  }
  /**
   * Find which tournament a connection belongs to. Used by $disconnect
   * which only receives the connectionId. Returns null when the conn is
   * not tournament-scoped (e.g. a casual-room connection).
   */
  async byConnectionId(connectionId) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": connGSI1PK(connectionId),
          ":sk": "TOURN#"
        },
        Limit: 1
      })
    );
    return r.Items?.[0] ?? null;
  }
  async listByTournament(tournId) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": tournPK(tournId),
          ":sk": "CONN#"
        }
      })
    );
    return (r.Items ?? []).map((i) => i.connection_id);
  }
  /** List connections for a specific user inside a tournament (for MATCH_READY). */
  async listByUserInTournament(tournId, userId) {
    const all = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: "user_id = :uid",
        ExpressionAttributeValues: {
          ":pk": tournPK(tournId),
          ":sk": "CONN#",
          ":uid": userId
        }
      })
    );
    return (all.Items ?? []).map((i) => i.connection_id);
  }
  async delete(tournId, connectionId) {
    await this.client.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: {
          PK: tournPK(tournId),
          SK: tournConnSK(connectionId)
        }
      })
    );
  }
};
var tournConnections = new TournConnectionRepo();

// ws/tourn/disconnect.ts
var handler = withWsLifecycle(async (_event, ctx) => {
  const row = await tournConnections.byConnectionId(ctx.connectionId);
  if (row) await tournConnections.delete(row.tourn_id, ctx.connectionId);
  return { statusCode: 200, body: "disconnected" };
});
export {
  handler
};
