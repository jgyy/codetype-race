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

// src/repos/ConnectionRepo.ts
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

// ../shared/src/ddb-keys.ts
var roomPK = (roomId) => `ROOM#${roomId}`;
var roomMetaSK = () => "META";
var playerSK = (displayName) => `PLAYER#${displayName}`;
var connSK = (connectionId) => `CONN#${connectionId}`;
var resultSK = (finishedAt, displayName) => `RESULT#${finishedAt}#${displayName}`;
var codeGSI1PK = (code) => `CODE#${code}`;
var connGSI1PK = (connectionId) => `CONN#${connectionId}`;
var hostGSI1PK = (hostId) => `HOST#${hostId}`;
var finishedGSI1SK = (finishedAt) => `FINISHED#${finishedAt}`;

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

// src/metrics.ts
var NAMESPACE = "Codetype";
function emit(entry) {
  const dims = entry.dimensions ?? {};
  const dimensionKeys = Object.keys(dims);
  const line = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: dimensionKeys.length > 0 ? [dimensionKeys] : [[]],
          Metrics: [{ Name: entry.name, Unit: entry.unit }]
        }
      ]
    },
    ...dims,
    [entry.name]: entry.value
  };
  console.log(JSON.stringify(line));
}
var metrics = {
  raceFinished: (durationMs) => {
    emit({ name: "RaceFinished", unit: "Count", value: 1 });
    emit({ name: "RaceDurationMs", unit: "Milliseconds", value: durationMs });
  },
  antiCheatFlag: (code) => emit({
    name: "AntiCheatFlag",
    unit: "Count",
    value: 1,
    dimensions: { signal: code }
  }),
  chatRateLimited: () => emit({ name: "ChatRateLimited", unit: "Count", value: 1 }),
  wsReconnect: () => emit({ name: "WsReconnect", unit: "Count", value: 1 })
};

// src/repos/ConnectionRepo.ts
var TTL_SECONDS = 30;
var CHAT_WINDOW_MS = 1e4;
var CHAT_MAX_PER_WINDOW = 5;
var ConnectionRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async put(roomId, connectionId, displayName, role = "racer") {
    const now = Date.now();
    await this.client.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: roomPK(roomId),
          SK: connSK(connectionId),
          GSI1PK: connGSI1PK(connectionId),
          GSI1SK: roomPK(roomId),
          connection_id: connectionId,
          display_name: displayName,
          joined_at: now,
          ttl: Math.floor(now / 1e3) + TTL_SECONDS,
          role
        }
      })
    );
  }
  async byConnectionId(connectionId) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": connGSI1PK(connectionId) },
        Limit: 1
      })
    );
    return r.Items?.[0] ?? null;
  }
  async listByRoom(roomId) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": roomPK(roomId), ":sk": "CONN#" }
      })
    );
    return (r.Items ?? []).map((i) => i.connection_id);
  }
  async delete(pk, sk) {
    await this.client.send(
      new DeleteCommand({ TableName: TABLE, Key: { PK: pk, SK: sk } })
    );
  }
  async consumeChatToken(roomId, connectionId) {
    const conn = await this.byConnectionId(connectionId);
    if (!conn) throw Errors.NotFound("connection");
    const now = Date.now();
    const row = conn;
    const windowStart = row.rate_window_start ?? 0;
    const count = row.rate_count ?? 0;
    const expired = now - windowStart > CHAT_WINDOW_MS;
    const nextStart = expired ? now : windowStart;
    const nextCount = expired ? 1 : count + 1;
    if (nextCount > CHAT_MAX_PER_WINDOW) {
      metrics.chatRateLimited();
      throw Errors.RateLimited();
    }
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: roomPK(roomId), SK: connSK(connectionId) },
          UpdateExpression: "SET rate_window_start = :ws, rate_count = :rc",
          ConditionExpression: "(attribute_not_exists(rate_window_start) AND attribute_not_exists(rate_count)) OR (rate_window_start = :oldStart AND rate_count = :oldCount)",
          ExpressionAttributeValues: {
            ":ws": nextStart,
            ":rc": nextCount,
            ":oldStart": windowStart,
            ":oldCount": count
          }
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        throw Errors.RateLimited();
      }
      throw e;
    }
  }
  async touch(roomId, connectionId) {
    await this.client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: roomPK(roomId), SK: connSK(connectionId) },
        UpdateExpression: "SET #ttl = :t",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":t": Math.floor(Date.now() / 1e3) + TTL_SECONDS
        }
      })
    );
  }
};
var connections = new ConnectionRepo();

// src/repos/RoomRepo.ts
import {
  GetCommand,
  PutCommand as PutCommand2,
  QueryCommand as QueryCommand2,
  UpdateCommand as UpdateCommand2
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException as ConditionalCheckFailedException2 } from "@aws-sdk/client-dynamodb";
var RoomRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async create(room, seedPlayers = []) {
    try {
      await this.client.send(
        new PutCommand2({
          TableName: TABLE,
          Item: {
            PK: roomPK(room.room_id),
            SK: roomMetaSK(),
            GSI1PK: codeGSI1PK(room.code),
            GSI1SK: roomPK(room.room_id),
            ...room
          },
          ConditionExpression: "attribute_not_exists(PK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
        throw Errors.Conflict("room already exists");
      }
      throw e;
    }
    for (const p of seedPlayers) {
      await this.addPlayer(room.room_id, p);
    }
  }
  async recordReplay(roomId, replayKey) {
    await this.client.send(
      new UpdateCommand2({
        TableName: TABLE,
        Key: { PK: roomPK(roomId), SK: roomMetaSK() },
        UpdateExpression: "SET replay_key = :k",
        ExpressionAttributeValues: { ":k": replayKey }
      })
    );
  }
  async listPlayers(roomId) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": roomPK(roomId),
          ":sk": "PLAYER#"
        }
      })
    );
    return r.Items ?? [];
  }
  async getMeta(roomId) {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: roomPK(roomId), SK: roomMetaSK() }
      })
    );
    return r.Item ?? null;
  }
  async getByCode(code) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
        Limit: 1
      })
    );
    return r.Items?.[0] ?? null;
  }
  async isCodeTaken(code) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": codeGSI1PK(code) },
        Limit: 1
      })
    );
    return (r.Items?.length ?? 0) > 0;
  }
  async countPlayers(roomId) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": roomPK(roomId),
          ":sk": "PLAYER#"
        },
        Select: "COUNT"
      })
    );
    return r.Count ?? 0;
  }
  async addPlayer(roomId, player) {
    try {
      await this.client.send(
        new PutCommand2({
          TableName: TABLE,
          Item: {
            PK: roomPK(roomId),
            SK: playerSK(player.display_name),
            ...player
          },
          ConditionExpression: "attribute_not_exists(SK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
        throw Errors.Conflict("display_name taken");
      }
      throw e;
    }
  }
  async markPlayerDnf(roomId, displayName) {
    try {
      await this.client.send(
        new UpdateCommand2({
          TableName: TABLE,
          Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
          UpdateExpression: "SET is_dnf = :t",
          ConditionExpression: "attribute_exists(SK) AND attribute_not_exists(finished_at)",
          ExpressionAttributeValues: { ":t": true }
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) return;
      throw e;
    }
  }
  async updateProgress(roomId, displayName, progress, charsTyped, errors) {
    await this.client.send(
      new UpdateCommand2({
        TableName: TABLE,
        Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
        UpdateExpression: "SET progress = :p, chars_typed = :c, errors = :e",
        ExpressionAttributeValues: {
          ":p": progress,
          ":c": charsTyped,
          ":e": errors
        }
      })
    );
  }
  async startCountdown(roomId, startedAt) {
    try {
      await this.client.send(
        new UpdateCommand2({
          TableName: TABLE,
          Key: { PK: roomPK(roomId), SK: roomMetaSK() },
          UpdateExpression: "SET #s = :countdown, started_at = :ts, version = version + :one",
          ConditionExpression: "#s = :lobby",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":countdown": "countdown",
            ":lobby": "lobby",
            ":ts": startedAt,
            ":one": 1
          }
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
        throw Errors.Conflict("already started");
      }
      throw e;
    }
  }
  async recordFinish(input) {
    const {
      roomId,
      hostId,
      displayName,
      finishedAt,
      charsTyped,
      errors,
      grossWpm,
      netWpm,
      accuracy,
      scaledWpm,
      flagged,
      flags
    } = input;
    try {
      await this.client.send(
        new UpdateCommand2({
          TableName: TABLE,
          Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
          UpdateExpression: "SET finished_at = :f, gross_wpm = :g, net_wpm = :n, accuracy = :a, scaled_wpm = :s, progress = :p",
          ConditionExpression: "attribute_not_exists(finished_at)",
          ExpressionAttributeValues: {
            ":f": finishedAt,
            ":g": grossWpm,
            ":n": netWpm,
            ":a": accuracy,
            ":s": scaledWpm,
            ":p": 1
          }
        })
      );
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException2)) throw e;
    }
    await this.client.send(
      new PutCommand2({
        TableName: TABLE,
        Item: {
          PK: roomPK(roomId),
          SK: resultSK(finishedAt, displayName),
          GSI1PK: hostGSI1PK(hostId),
          GSI1SK: finishedGSI1SK(finishedAt),
          room_id: roomId,
          display_name: displayName,
          finished_at: finishedAt,
          gross_wpm: grossWpm,
          net_wpm: netWpm,
          accuracy,
          scaled_wpm: scaledWpm,
          chars_typed: charsTyped,
          errors,
          ...flagged ? { flagged: true, flags: flags ?? [] } : {}
        }
      })
    );
  }
};
var rooms = new RoomRepo();

// ws/disconnect.ts
var handler = withWsLifecycle(async (_event, ctx) => {
  const conn = await connections.byConnectionId(ctx.connectionId);
  if (!conn) return { statusCode: 200, body: "noop" };
  await connections.delete(conn.PK, conn.SK);
  const roomId = conn.PK.slice("ROOM#".length);
  await rooms.markPlayerDnf(roomId, conn.display_name);
  return { statusCode: 200, body: "ok" };
});
export {
  handler
};
