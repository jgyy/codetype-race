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
function withStream(handler2) {
  return async (event) => {
    const requestId = event.Records[0]?.eventID ?? "stream";
    const start = Date.now();
    try {
      await handler2(event);
      log({
        requestId,
        route: "stream:broadcast",
        status: 200,
        ms: Date.now() - start
      });
    } catch (err) {
      const appErr = toAppError(err);
      log({
        requestId,
        route: "stream:broadcast",
        status: appErr.status,
        ms: Date.now() - start,
        code: appErr.code,
        err: appErr.message
      });
      throw err;
    }
  };
}

// src/repos/MatchRepo.ts
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

// ../shared/src/ddb-keys.ts
var roomPK = (roomId) => `ROOM#${roomId}`;
var roomMetaSK = () => "META";
var playerSK = (displayName) => `PLAYER#${displayName}`;
var resultSK = (finishedAt, displayName) => `RESULT#${finishedAt}#${displayName}`;
var userPK = (userId) => `USER#${userId}`;
var codeGSI1PK = (code) => `CODE#${code}`;
var connGSI1PK = (connectionId) => `CONN#${connectionId}`;
var hostGSI1PK = (hostId) => `HOST#${hostId}`;
var finishedGSI1SK = (finishedAt) => `FINISHED#${finishedAt}`;
var tournPK = (id) => `TOURN#${id}`;
var tournMetaSK = () => "META";
var tournStatusGSI1PK = (status) => `TOURN#STATUS#${status}`;
var tournEntrantSK = (userId) => `ENTRANT#${userId}`;
var tournUserGSI1SK = (startsAt) => `TOURN#${startsAt}`;
var tournMatchSK = (round, slot) => `MATCH#${round}#${slot}`;
var tournMatchStatusGSI1PK = (tournId, status) => `TOURN#${tournId}#MATCH#STATUS#${status}`;
var tournMatchStatusGSI1SK = (round, slot) => `${round}#${slot}`;
var tournConnSK = (connectionId) => `CONN#${connectionId}`;

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

// src/repos/MatchRepo.ts
var MatchRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async put(match) {
    await this.client.send(
      new PutCommand({
        TableName: TABLE,
        Item: this.toItem(match)
      })
    );
  }
  async putIfAbsent(match) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: TABLE,
          Item: this.toItem(match),
          ConditionExpression: "attribute_not_exists(SK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        throw Errors.Conflict(
          `match ${match.round}#${match.slot} exists`
        );
      }
      throw e;
    }
  }
  toItem(m) {
    return {
      PK: tournPK(m.tournId),
      SK: tournMatchSK(m.round, m.slot),
      GSI1PK: tournMatchStatusGSI1PK(m.tournId, m.status),
      GSI1SK: tournMatchStatusGSI1SK(m.round, m.slot),
      ...m
    };
  }
  async get(tournId, round, slot) {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          PK: tournPK(tournId),
          SK: tournMatchSK(round, slot)
        }
      })
    );
    return r.Item ?? null;
  }
  async listAll(tournId) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": tournPK(tournId),
          ":sk": "MATCH#"
        }
      })
    );
    return r.Items ?? [];
  }
  async listByStatus(tournId, status) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": tournMatchStatusGSI1PK(tournId, status)
        }
      })
    );
    return r.Items ?? [];
  }
  async transitionStatus(tournId, round, slot, from, to, extra = {}) {
    const sets = ["#s = :to", "GSI1PK = :gsi"];
    const values = {
      ":from": from,
      ":to": to,
      ":gsi": tournMatchStatusGSI1PK(tournId, to)
    };
    const names = { "#s": "status" };
    let i = 0;
    for (const [k, v] of Object.entries(extra)) {
      const n = `#x${i}`;
      const ph = `:x${i}`;
      sets.push(`${n} = ${ph}`);
      names[n] = k;
      values[ph] = v;
      i++;
    }
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: {
            PK: tournPK(tournId),
            SK: tournMatchSK(round, slot)
          },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ConditionExpression: "#s = :from",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values
        })
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }
  async advanceWinner(args) {
    const playerAttr = args.parentSlotIndex === 0 ? "players[0]" : "players[1]";
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: TABLE,
                Key: {
                  PK: tournPK(args.tournId),
                  SK: tournMatchSK(
                    args.childRound,
                    args.childSlot
                  )
                },
                UpdateExpression: "SET #s = :done, GSI1PK = :gsi, winnerId = :w, completedAt = :c",
                ConditionExpression: "#s = :live AND winnerId = :w",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":done": "done",
                  ":live": "live",
                  ":w": args.winnerId,
                  ":c": args.completedAt,
                  ":gsi": tournMatchStatusGSI1PK(
                    args.tournId,
                    "done"
                  )
                }
              }
            },
            {
              Update: {
                TableName: TABLE,
                Key: {
                  PK: tournPK(args.tournId),
                  SK: tournMatchSK(
                    args.parentRound,
                    args.parentSlot
                  )
                },
                UpdateExpression: `SET ${playerAttr} = :w`,
                ConditionExpression: `attribute_not_exists(${playerAttr}) OR ${playerAttr} = :null`,
                ExpressionAttributeValues: {
                  ":w": args.winnerId,
                  ":null": null
                }
              }
            }
          ]
        })
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      if (e.name === "TransactionCanceledException") {
        return false;
      }
      throw e;
    }
  }
};
var matches = new MatchRepo();

// src/repos/TournamentRepo.ts
import {
  GetCommand as GetCommand2,
  PutCommand as PutCommand2,
  QueryCommand as QueryCommand2,
  UpdateCommand as UpdateCommand2,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException as ConditionalCheckFailedException2 } from "@aws-sdk/client-dynamodb";
var TournamentRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async create(t) {
    try {
      await this.client.send(
        new PutCommand2({
          TableName: TABLE,
          Item: {
            PK: tournPK(t.id),
            SK: tournMetaSK(),
            GSI1PK: tournStatusGSI1PK(t.status),
            GSI1SK: t.startsAt,
            ...t
          },
          ConditionExpression: "attribute_not_exists(PK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
        throw Errors.Conflict(`tournament ${t.id} already exists`);
      }
      throw e;
    }
  }
  async get(id) {
    const r = await this.client.send(
      new GetCommand2({
        TableName: TABLE,
        Key: { PK: tournPK(id), SK: tournMetaSK() }
      })
    );
    return r.Item ?? null;
  }
  async listByStatus(status) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": tournStatusGSI1PK(status)
        }
      })
    );
    return r.Items ?? [];
  }
  async transitionStatus(id, from, to, extra = {}) {
    const sets = ["#s = :to", "GSI1PK = :gsi"];
    const values = {
      ":from": from,
      ":to": to,
      ":gsi": tournStatusGSI1PK(to)
    };
    const names = { "#s": "status" };
    let i = 0;
    for (const [k, v] of Object.entries(extra)) {
      const n = `#x${i}`;
      const ph = `:x${i}`;
      sets.push(`${n} = ${ph}`);
      names[n] = k;
      values[ph] = v;
      i++;
    }
    try {
      await this.client.send(
        new UpdateCommand2({
          TableName: TABLE,
          Key: { PK: tournPK(id), SK: tournMetaSK() },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ConditionExpression: "#s = :from",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values
        })
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) return false;
      throw e;
    }
  }
  async addEntrant(entrant) {
    try {
      await this.client.send(
        new PutCommand2({
          TableName: TABLE,
          Item: {
            PK: tournPK(entrant.tournId),
            SK: tournEntrantSK(entrant.userId),
            // user-side GSI1 for "my tournaments"
            GSI1PK: userPK(entrant.userId),
            GSI1SK: tournUserGSI1SK(entrant.registeredAt),
            ...entrant
          },
          ConditionExpression: "attribute_not_exists(SK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
        throw Errors.Conflict("already registered");
      }
      throw e;
    }
  }
  async removeEntrant(tournId, userId) {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: {
            PK: tournPK(tournId),
            SK: tournEntrantSK(userId)
          },
          ConditionExpression: "attribute_exists(SK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
        throw Errors.NotFound("entrant");
      }
      throw e;
    }
  }
  async listEntrants(tournId) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": tournPK(tournId),
          ":sk": "ENTRANT#"
        }
      })
    );
    return r.Items ?? [];
  }
  async setEntrantSeed(tournId, userId, seedRank) {
    await this.client.send(
      new UpdateCommand2({
        TableName: TABLE,
        Key: {
          PK: tournPK(tournId),
          SK: tournEntrantSK(userId)
        },
        UpdateExpression: "SET seedRank = :s",
        ExpressionAttributeValues: { ":s": seedRank }
      })
    );
  }
  async markEliminated(tournId, userId, when) {
    await this.client.send(
      new UpdateCommand2({
        TableName: TABLE,
        Key: {
          PK: tournPK(tournId),
          SK: tournEntrantSK(userId)
        },
        UpdateExpression: "SET eliminatedAt = :w",
        ExpressionAttributeValues: { ":w": when }
      })
    );
  }
};
var tournaments = new TournamentRepo();

// src/repos/RoomRepo.ts
import {
  GetCommand as GetCommand3,
  PutCommand as PutCommand3,
  QueryCommand as QueryCommand3,
  UpdateCommand as UpdateCommand3
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException as ConditionalCheckFailedException3 } from "@aws-sdk/client-dynamodb";
var RoomRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async create(room, seedPlayers = []) {
    try {
      await this.client.send(
        new PutCommand3({
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
      if (e instanceof ConditionalCheckFailedException3) {
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
      new UpdateCommand3({
        TableName: TABLE,
        Key: { PK: roomPK(roomId), SK: roomMetaSK() },
        UpdateExpression: "SET replay_key = :k",
        ExpressionAttributeValues: { ":k": replayKey }
      })
    );
  }
  async listPlayers(roomId) {
    const r = await this.client.send(
      new QueryCommand3({
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
      new GetCommand3({
        TableName: TABLE,
        Key: { PK: roomPK(roomId), SK: roomMetaSK() }
      })
    );
    return r.Item ?? null;
  }
  async getByCode(code) {
    const r = await this.client.send(
      new QueryCommand3({
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
      new QueryCommand3({
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
      new QueryCommand3({
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
        new PutCommand3({
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
      if (e instanceof ConditionalCheckFailedException3) {
        throw Errors.Conflict("display_name taken");
      }
      throw e;
    }
  }
  async markPlayerDnf(roomId, displayName) {
    try {
      await this.client.send(
        new UpdateCommand3({
          TableName: TABLE,
          Key: { PK: roomPK(roomId), SK: playerSK(displayName) },
          UpdateExpression: "SET is_dnf = :t",
          ConditionExpression: "attribute_exists(SK) AND attribute_not_exists(finished_at)",
          ExpressionAttributeValues: { ":t": true }
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException3) return;
      throw e;
    }
  }
  async updateProgress(roomId, displayName, progress, charsTyped, errors) {
    await this.client.send(
      new UpdateCommand3({
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
        new UpdateCommand3({
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
      if (e instanceof ConditionalCheckFailedException3) {
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
        new UpdateCommand3({
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
      if (!(e instanceof ConditionalCheckFailedException3)) throw e;
    }
    await this.client.send(
      new PutCommand3({
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

// src/repos/TournConnectionRepo.ts
import {
  DeleteCommand as DeleteCommand2,
  PutCommand as PutCommand4,
  QueryCommand as QueryCommand4
} from "@aws-sdk/lib-dynamodb";
var TTL_SECONDS = 60;
var TournConnectionRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async put(tournId, connectionId, userId) {
    const now = Date.now();
    await this.client.send(
      new PutCommand4({
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
      new QueryCommand4({
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
      new QueryCommand4({
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
      new QueryCommand4({
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
      new DeleteCommand2({
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

// src/orchestration/advanceMatch.ts
async function advanceMatch(args) {
  const now = (args.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
  const child = await args.matches.get(args.tournId, args.round, args.slot);
  if (!child) return { advanced: false };
  if (child.status === "done") return { advanced: false };
  if (child.status !== "live" && child.status !== "bye") {
    return { advanced: false };
  }
  if (args.round === 0) {
    const ok2 = await args.matches.transitionStatus(
      args.tournId,
      0,
      args.slot,
      child.status,
      "done",
      { winnerId: args.winnerId, completedAt: now }
    );
    if (!ok2) return { advanced: false };
    await args.tournaments.transitionStatus(
      args.tournId,
      "running",
      "finished",
      { winnerId: args.winnerId }
    );
    return {
      advanced: true,
      finished: true,
      winnerId: args.winnerId
    };
  }
  const parentRound = args.round - 1;
  const parentSlot = Math.floor(args.slot / 2);
  const parentSlotIndex = args.slot % 2;
  const ok = await args.matches.advanceWinner({
    tournId: args.tournId,
    childRound: args.round,
    childSlot: args.slot,
    winnerId: args.winnerId,
    parentRound,
    parentSlot,
    parentSlotIndex,
    completedAt: now
  });
  if (!ok) return { advanced: false };
  const parent = await args.matches.get(
    args.tournId,
    parentRound,
    parentSlot
  );
  return { advanced: true, parent: parent ?? void 0, winnerId: args.winnerId };
}

// src/wsClient.ts
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException
} from "@aws-sdk/client-apigatewaymanagementapi";
var endpoint = process.env.WS_ENDPOINT;
var wsClient = endpoint ? new ApiGatewayManagementApiClient({ endpoint }) : null;
async function postTo(connectionId, payload) {
  if (!wsClient) throw new Error("WS_ENDPOINT not set");
  try {
    await wsClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload))
      })
    );
    return true;
  } catch (e) {
    if (e instanceof GoneException) return false;
    throw e;
  }
}

// src/orchestration/bracketBroadcast.ts
async function broadcastBracketUpdate(args) {
  const conns = await args.repo.listByTournament(args.tournId);
  const msg = {
    type: "BRACKET_UPDATE",
    tournId: args.tournId,
    match: args.match
  };
  const results = await Promise.all(
    conns.map((id) => postTo(id, msg).catch(() => false))
  );
  return results.filter(Boolean).length;
}
async function broadcastMatchDone(args) {
  const conns = await args.repo.listByTournament(args.tournId);
  const msg = {
    type: "MATCH_DONE",
    tournId: args.tournId,
    round: args.round,
    slot: args.slot,
    winnerId: args.winnerId
  };
  await Promise.all(conns.map((id) => postTo(id, msg).catch(() => false)));
}
async function broadcastTournamentFinished(args) {
  const conns = await args.repo.listByTournament(args.tournId);
  const msg = {
    type: "TOURNAMENT_FINISHED",
    tournId: args.tournId,
    winnerId: args.winnerId
  };
  await Promise.all(conns.map((id) => postTo(id, msg).catch(() => false)));
}

// stream/onRaceFinished.ts
function parseFinish(record) {
  const keys = record.dynamodb?.Keys;
  const newImg = record.dynamodb?.NewImage;
  const pk = keys?.PK?.S;
  const sk = keys?.SK?.S;
  if (!pk?.startsWith("ROOM#")) return null;
  if (!sk?.startsWith("PLAYER#")) return null;
  if (!newImg?.finished_at?.N) return null;
  return {
    roomId: pk.slice("ROOM#".length),
    displayName: newImg.display_name?.S ?? "",
    finishedAt: Number(newImg.finished_at.N),
    isWinner: false
    // determined below by reading room state
  };
}
function parseTournMatchKey(raw) {
  if (!raw) return null;
  const parts = raw.split("#");
  if (parts.length !== 3) return null;
  const round = Number(parts[1]);
  const slot = Number(parts[2]);
  if (!Number.isFinite(round) || !Number.isFinite(slot)) return null;
  return { tournId: parts[0], round, slot };
}
var handler = withStream(async (event) => {
  const finishes = event.Records.map(parseFinish).filter(
    (f) => f !== null
  );
  if (finishes.length === 0) return;
  const byRoom = /* @__PURE__ */ new Map();
  for (const f of finishes) {
    if (!byRoom.has(f.roomId)) byRoom.set(f.roomId, []);
    byRoom.get(f.roomId).push(f);
  }
  for (const [roomId, _events] of byRoom.entries()) {
    const room = await rooms.getMeta(roomId);
    if (!room) continue;
    const matchKey = parseTournMatchKey(
      room.tourn_match_key
    );
    if (!matchKey) continue;
    const players = await rooms.listPlayers(roomId);
    const finished = players.filter((p) => p.finished_at);
    if (finished.length === 0) continue;
    finished.sort((a, b) => (a.finished_at ?? 0) - (b.finished_at ?? 0));
    const winner = finished[0];
    if (!winner.user_id) continue;
    await matches.transitionStatus(
      matchKey.tournId,
      matchKey.round,
      matchKey.slot,
      "pending",
      "live"
    );
    const result = await advanceMatch({
      tournId: matchKey.tournId,
      round: matchKey.round,
      slot: matchKey.slot,
      winnerId: winner.user_id,
      matches,
      tournaments
    });
    if (!result.advanced) continue;
    const updated = await matches.get(
      matchKey.tournId,
      matchKey.round,
      matchKey.slot
    );
    if (updated) {
      await broadcastBracketUpdate({
        repo: tournConnections,
        tournId: matchKey.tournId,
        match: updated
      });
    }
    await broadcastMatchDone({
      repo: tournConnections,
      tournId: matchKey.tournId,
      round: matchKey.round,
      slot: matchKey.slot,
      winnerId: winner.user_id
    });
    if (result.finished) {
      await broadcastTournamentFinished({
        repo: tournConnections,
        tournId: matchKey.tournId,
        winnerId: winner.user_id
      });
    }
  }
});
export {
  handler
};
