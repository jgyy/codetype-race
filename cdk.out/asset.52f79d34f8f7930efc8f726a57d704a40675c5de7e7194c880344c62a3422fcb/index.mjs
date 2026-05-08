// src/repos/TournamentRepo.ts
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

// ../shared/src/ddb-keys.ts
var userPK = (userId) => `USER#${userId}`;
var tournPK = (id) => `TOURN#${id}`;
var tournMetaSK = () => "META";
var tournStatusGSI1PK = (status) => `TOURN#STATUS#${status}`;
var tournEntrantSK = (userId) => `ENTRANT#${userId}`;
var tournUserGSI1SK = (startsAt) => `TOURN#${startsAt}`;
var tournMatchSK = (round, slot) => `MATCH#${round}#${slot}`;
var tournMatchStatusGSI1PK = (tournId, status) => `TOURN#${tournId}#MATCH#STATUS#${status}`;
var tournMatchStatusGSI1SK = (round, slot) => `${round}#${slot}`;

// src/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({});
var ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});
var TABLE = process.env.TABLE_NAME;

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

// src/repos/TournamentRepo.ts
var TournamentRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async create(t) {
    try {
      await this.client.send(
        new PutCommand({
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
      if (e instanceof ConditionalCheckFailedException) {
        throw Errors.Conflict(`tournament ${t.id} already exists`);
      }
      throw e;
    }
  }
  async get(id) {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: tournPK(id), SK: tournMetaSK() }
      })
    );
    return r.Item ?? null;
  }
  async listByStatus(status) {
    const r = await this.client.send(
      new QueryCommand({
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
        new UpdateCommand({
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
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }
  async addEntrant(entrant) {
    try {
      await this.client.send(
        new PutCommand({
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
      if (e instanceof ConditionalCheckFailedException) {
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
      if (e instanceof ConditionalCheckFailedException) {
        throw Errors.NotFound("entrant");
      }
      throw e;
    }
  }
  async listEntrants(tournId) {
    const r = await this.client.send(
      new QueryCommand({
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
      new UpdateCommand({
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
      new UpdateCommand({
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

// src/repos/MatchRepo.ts
import {
  GetCommand as GetCommand2,
  PutCommand as PutCommand2,
  QueryCommand as QueryCommand2,
  UpdateCommand as UpdateCommand2,
  TransactWriteCommand
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException as ConditionalCheckFailedException2 } from "@aws-sdk/client-dynamodb";
var MatchRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async put(match) {
    await this.client.send(
      new PutCommand2({
        TableName: TABLE,
        Item: this.toItem(match)
      })
    );
  }
  async putIfAbsent(match) {
    try {
      await this.client.send(
        new PutCommand2({
          TableName: TABLE,
          Item: this.toItem(match),
          ConditionExpression: "attribute_not_exists(SK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
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
      new GetCommand2({
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
      new QueryCommand2({
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
      new QueryCommand2({
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
        new UpdateCommand2({
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
      if (e instanceof ConditionalCheckFailedException2) return false;
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
      if (e instanceof ConditionalCheckFailedException2) return false;
      if (e.name === "TransactionCanceledException") {
        return false;
      }
      throw e;
    }
  }
};
var matches = new MatchRepo();

// ../shared/src/seeding.ts
var VALID_SIZES = [4, 8, 16, 32, 64];
function isValidSize(n) {
  return VALID_SIZES.includes(n);
}
function rankEntrants(entrants) {
  return [...entrants].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}
function bracketSeedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const next = [];
    const pairTotal = order.length * 2 + 1;
    for (const seed of order) {
      next.push(seed);
      next.push(pairTotal - seed);
    }
    order = next;
  }
  return order;
}
function seedFirstRound(entrants, size) {
  if (entrants.length > size) {
    throw new Error(
      `entrants ${entrants.length} exceeds tournament size ${size}`
    );
  }
  const ranked = rankEntrants(entrants);
  const seedToEntrant = /* @__PURE__ */ new Map();
  ranked.forEach((e, i) => seedToEntrant.set(i + 1, e));
  const order = bracketSeedOrder(size);
  const matches2 = [];
  for (let i = 0; i < size; i += 2) {
    const seedA = order[i];
    const seedB = order[i + 1];
    const a = seedToEntrant.get(seedA) ?? null;
    const b = seedToEntrant.get(seedB) ?? null;
    const slotA = a ? { userId: a.userId, seedRank: seedA } : { userId: null, seedRank: null };
    const slotB = b ? { userId: b.userId, seedRank: seedB } : { userId: null, seedRank: null };
    matches2.push({
      slot: i / 2,
      players: [slotA, slotB],
      isBye: !a || !b
    });
  }
  return matches2;
}
function totalRounds(size) {
  return Math.log2(size);
}
function firstRoundIndex(size) {
  return totalRounds(size) - 1;
}

// src/orchestration/seedTournament.ts
async function seedTournament(args) {
  if (!isValidSize(args.size)) {
    throw new Error(`invalid tournament size ${args.size}`);
  }
  const now = (args.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
  const entrants = await args.tournaments.listEntrants(args.tournId);
  const inputs = entrants.map((e) => ({
    userId: e.userId,
    rating: e.snapshotRating
  }));
  const round = firstRoundIndex(args.size);
  const firstRound = seedFirstRound(inputs, args.size);
  const written = [];
  for (const m of firstRound) {
    const isBye = m.isBye;
    const players = [
      m.players[0].userId,
      m.players[1].userId
    ];
    const winnerId = isBye ? m.players[0].userId ?? m.players[1].userId ?? null : null;
    const match = {
      tournId: args.tournId,
      round,
      slot: m.slot,
      status: isBye ? "bye" : "pending",
      players,
      winnerId,
      roomId: null,
      scheduledAt: args.startsAt,
      completedAt: isBye ? now : null,
      flagged: false
    };
    await args.matches.put(match);
    written.push(match);
  }
  for (const m of firstRound) {
    for (const p of m.players) {
      if (p.userId && p.seedRank !== null) {
        await args.tournaments.setEntrantSeed(
          args.tournId,
          p.userId,
          p.seedRank
        );
      }
    }
  }
  return written;
}

// cron/advanceTournaments.ts
async function advanceTournaments(now) {
  const out = { seeded: [], promoted: [] };
  const reg = await tournaments.listByStatus("registering");
  for (const t of reg) {
    if (new Date(t.registrationClosesAt).getTime() > now.getTime()) {
      continue;
    }
    const moved = await tournaments.transitionStatus(
      t.id,
      "registering",
      "seeding"
    );
    if (!moved) continue;
    try {
      await seedTournament({
        tournId: t.id,
        size: t.size,
        startsAt: t.startsAt,
        matches,
        tournaments
      });
      await tournaments.transitionStatus(t.id, "seeding", "running");
      out.seeded.push(t.id);
    } catch (err) {
      console.error("seedTournament failed", t.id, err);
    }
  }
  const seedingNow = await tournaments.listByStatus("seeding");
  for (const t of seedingNow) {
    const ok = await tournaments.transitionStatus(
      t.id,
      "seeding",
      "running"
    );
    if (ok) out.promoted.push(t.id);
  }
  return out;
}
var handler = async () => {
  const start = Date.now();
  const result = await advanceTournaments(/* @__PURE__ */ new Date());
  console.log(
    JSON.stringify({
      feature: "tournaments",
      route: "cron:advanceTournaments",
      status: 200,
      ms: Date.now() - start,
      ...result
    })
  );
};
export {
  advanceTournaments,
  handler
};
