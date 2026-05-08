// ../shared/src/decay.ts
var DEFAULT_DECAY_FACTOR = 0.25;
var DEFAULT_DECAY_TARGET = 1200;
function applyDecay(rating, factor = DEFAULT_DECAY_FACTOR, target = DEFAULT_DECAY_TARGET) {
  if (factor < 0 || factor > 1) {
    throw new Error(`decay factor out of range [0,1]: ${factor}`);
  }
  return Math.round(rating + factor * (target - rating));
}

// ../shared/src/ddb-keys.ts
var userPK = (userId) => `USER#${userId}`;
var userProfileSK = () => "PROFILE";
var userRaceSK = (finishedAt, roomId) => `RACE#${finishedAt}#${roomId}`;
var RATING_PAD_WIDTH = 6;
var RATING_BIAS = 999999;
var ratingSortKey = (rating, userId) => {
  const inverted = Math.max(0, RATING_BIAS - Math.floor(rating));
  return `RATING#${String(inverted).padStart(RATING_PAD_WIDTH, "0")}#${userId}`;
};
var leaderboardGlobalPK = () => "LEADERBOARD#GLOBAL";
var leaderboardLangPK = (language) => `LEADERBOARD#LANG#${language}`;
var seasonPK = (id) => `SEASON#${id}`;
var seasonMetaSK = () => "META";
var seasonStatusGSI1PK = (status) => `SEASON#STATUS#${status}`;
var seasonLbPK = (id, lang) => `SEASON#${id}#LB#${lang}`;
var SEASON_RANK_PAD = 6;
var seasonLbSK = (rank) => `RANK#${String(rank).padStart(SEASON_RANK_PAD, "0")}`;

// src/repos/SeasonRepo.ts
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

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

// src/repos/SeasonRepo.ts
var SeasonRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async create(season) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: seasonPK(season.id),
            SK: seasonMetaSK(),
            GSI1PK: seasonStatusGSI1PK(season.status),
            GSI1SK: season.startsAt,
            ...season
          },
          ConditionExpression: "attribute_not_exists(PK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        throw Errors.Conflict(`season ${season.id} already exists`);
      }
      throw e;
    }
  }
  async get(id) {
    const r = await this.client.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: seasonPK(id), SK: seasonMetaSK() }
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
          ":pk": seasonStatusGSI1PK(status)
        }
      })
    );
    return r.Items ?? [];
  }
  /**
   * CAS status transition. Returns false if the current status doesn't match
   * `from` (another invocation already moved it).
   */
  async transitionStatus(id, from, to) {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: seasonPK(id), SK: seasonMetaSK() },
          UpdateExpression: "SET #s = :to, GSI1PK = :gsi",
          ConditionExpression: "#s = :from",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":from": from,
            ":to": to,
            ":gsi": seasonStatusGSI1PK(to)
          }
        })
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }
  /**
   * Write a frozen leaderboard row. Uses attribute_not_exists so an already-
   * archived season's leaderboard is read-only (acceptance criterion).
   */
  async putLeaderboardRow(row) {
    try {
      await this.client.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: seasonLbPK(row.seasonId, row.language),
            SK: seasonLbSK(row.rank),
            ...row
          },
          ConditionExpression: "attribute_not_exists(PK)"
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        throw Errors.Conflict(
          `leaderboard row ${row.seasonId}/${row.language}/${row.rank} already frozen`
        );
      }
      throw e;
    }
  }
  async getLeaderboard(seasonId, language, limit = 100) {
    const r = await this.client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": seasonLbPK(seasonId, language)
        },
        Limit: limit
      })
    );
    return r.Items ?? [];
  }
};
var seasons = new SeasonRepo();

// src/repos/UserRepo.ts
import {
  GetCommand as GetCommand2,
  PutCommand as PutCommand2,
  QueryCommand as QueryCommand2,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand as UpdateCommand2
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException as ConditionalCheckFailedException2 } from "@aws-sdk/client-dynamodb";
var STARTING_RATING = 1e3;
var UserRepo = class {
  constructor(client2 = ddb) {
    this.client = client2;
  }
  async getProfile(userId) {
    const r = await this.client.send(
      new GetCommand2({
        TableName: TABLE,
        Key: { PK: userPK(userId), SK: userProfileSK() }
      })
    );
    return r.Item ?? null;
  }
  async getOrCreate(userId, displayName) {
    const existing = await this.getProfile(userId);
    if (existing) return existing;
    const profile = {
      user_id: userId,
      display_name: displayName,
      rating: STARTING_RATING,
      races_completed: 0,
      races_won: 0,
      best_wpm: {},
      created_at: Date.now()
    };
    try {
      await this.client.send(
        new PutCommand2({
          TableName: TABLE,
          Item: { PK: userPK(userId), SK: userProfileSK(), ...profile },
          ConditionExpression: "attribute_not_exists(PK)"
        })
      );
      await this.client.send(
        new PutCommand2({
          TableName: TABLE,
          Item: {
            PK: leaderboardGlobalPK(),
            SK: ratingSortKey(profile.rating, userId),
            user_id: userId,
            display_name: displayName,
            rating: profile.rating
          }
        })
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) {
        const again = await this.getProfile(userId);
        if (again) return again;
      }
      throw e;
    }
    return profile;
  }
  async listRecentRaces(userId, limit = 20) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": userPK(userId),
          ":sk": "RACE#"
        },
        ScanIndexForward: false,
        Limit: limit
      })
    );
    return r.Items ?? [];
  }
  async applyRaceResults(roomId, language, participants) {
    const now = Date.now();
    const items = [];
    const applied = [];
    for (const p of participants) {
      const newRating = p.profile.rating + p.delta;
      const isWin = p.finishOrder === 1;
      const bestForLang = p.profile.best_wpm?.[language] ?? 0;
      const newBest = Math.max(bestForLang, p.scaledWpm);
      items.push({
        Update: {
          TableName: TABLE,
          Key: { PK: userPK(p.userId), SK: userProfileSK() },
          UpdateExpression: "SET rating = :r, races_completed = races_completed + :one, races_won = races_won + :w, best_wpm.#lang = :best",
          ExpressionAttributeNames: { "#lang": language },
          ExpressionAttributeValues: {
            ":r": newRating,
            ":one": 1,
            ":w": isWin ? 1 : 0,
            ":best": newBest
          }
        }
      });
      items.push({
        Put: {
          TableName: TABLE,
          Item: {
            PK: userPK(p.userId),
            SK: userRaceSK(p.finishOrder === 0 ? now : now, roomId),
            room_id: roomId,
            finished_at: now,
            display_name: p.displayName,
            language,
            scaled_wpm: p.scaledWpm,
            net_wpm: p.netWpm,
            gross_wpm: p.grossWpm,
            accuracy: p.accuracy,
            rating_delta: p.delta,
            rating_after: newRating
          }
        }
      });
      items.push({
        Delete: {
          TableName: TABLE,
          Key: {
            PK: leaderboardGlobalPK(),
            SK: ratingSortKey(p.profile.rating, p.userId)
          }
        }
      });
      items.push({
        Put: {
          TableName: TABLE,
          Item: {
            PK: leaderboardGlobalPK(),
            SK: ratingSortKey(newRating, p.userId),
            user_id: p.userId,
            display_name: p.displayName,
            rating: newRating
          }
        }
      });
      items.push({
        Delete: {
          TableName: TABLE,
          Key: {
            PK: leaderboardLangPK(language),
            SK: ratingSortKey(p.profile.rating, p.userId)
          }
        }
      });
      items.push({
        Put: {
          TableName: TABLE,
          Item: {
            PK: leaderboardLangPK(language),
            SK: ratingSortKey(newRating, p.userId),
            user_id: p.userId,
            display_name: p.displayName,
            rating: newRating
          }
        }
      });
      applied.push({
        userId: p.userId,
        displayName: p.displayName,
        oldRating: p.profile.rating,
        newRating,
        delta: p.delta
      });
    }
    items.push({
      Update: {
        TableName: TABLE,
        Key: { PK: `ROOM#${roomId}`, SK: "META" },
        UpdateExpression: "SET elo_applied = :t",
        ConditionExpression: "attribute_not_exists(elo_applied)",
        ExpressionAttributeValues: { ":t": true }
      }
    });
    await this.client.send(new TransactWriteCommand({ TransactItems: items }));
    return applied;
  }
  async listLeaderboard(pk, limit = 100) {
    const r = await this.client.send(
      new QueryCommand2({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: "attribute_not_exists(flagged) OR flagged = :falseVal",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":sk": "RATING#",
          ":falseVal": false
        },
        Limit: limit
      })
    );
    return r.Items ?? [];
  }
  async pageProfiles(startKey, limit = 100) {
    const r = await this.client.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "SK = :sk AND begins_with(PK, :pk)",
        ExpressionAttributeValues: {
          ":sk": "PROFILE",
          ":pk": "USER#"
        },
        ExclusiveStartKey: startKey,
        Limit: limit
      })
    );
    return {
      items: r.Items ?? [],
      nextKey: r.LastEvaluatedKey
    };
  }
  async applyDecayToProfile(userId, newRating, seasonId) {
    try {
      await this.client.send(
        new UpdateCommand2({
          TableName: TABLE,
          Key: { PK: userPK(userId), SK: userProfileSK() },
          UpdateExpression: "SET rating = :r, decayAppliedFor = :sid",
          ConditionExpression: "attribute_not_exists(decayAppliedFor) OR decayAppliedFor <> :sid",
          ExpressionAttributeValues: {
            ":r": newRating,
            ":sid": seasonId
          }
        })
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException2) return false;
      throw e;
    }
  }
};
var users = new UserRepo();

// cron/rolloverSeasons.ts
var PROFILE_PAGE_SIZE = 100;
var TOP_N_LEADERBOARD = 1e3;
async function rolloverSeasons(ctx) {
  const out = { rolled: [], decayed: 0, snapshotted: 0 };
  const active = await seasons.listByStatus("active");
  for (const s of active) {
    if (new Date(s.endsAt).getTime() > ctx.now.getTime()) continue;
    const moved = await seasons.transitionStatus(
      s.id,
      "active",
      "finalizing"
    );
    if (!moved) continue;
    out.snapshotted += await snapshotLeaderboard(s);
    out.decayed += await decayAllProfiles(s);
    await seasons.transitionStatus(s.id, "finalizing", "archived");
    out.rolled.push(s.id);
    await ensureNextSeason(s, ctx.now);
  }
  return out;
}
async function snapshotLeaderboard(season) {
  const top = await users.listLeaderboard(
    leaderboardGlobalPK(),
    TOP_N_LEADERBOARD
  );
  let written = 0;
  for (let i = 0; i < top.length; i++) {
    const row = top[i];
    try {
      await seasons.putLeaderboardRow({
        seasonId: season.id,
        language: "*",
        rank: i + 1,
        userId: row.user_id,
        displayName: row.display_name,
        rating: row.rating,
        racesPlayed: 0
      });
      written++;
    } catch {
    }
  }
  return written;
}
async function decayAllProfiles(season) {
  let decayed = 0;
  let nextKey;
  const factor = season.decayFactor ?? DEFAULT_DECAY_FACTOR;
  const target = season.decayTarget ?? DEFAULT_DECAY_TARGET;
  do {
    const page = await users.pageProfiles(nextKey, PROFILE_PAGE_SIZE);
    for (const p of page.items) {
      const newRating = applyDecay(p.rating, factor, target);
      const ok = await users.applyDecayToProfile(
        p.user_id,
        newRating,
        season.id
      );
      if (ok) decayed++;
    }
    nextKey = page.nextKey;
  } while (nextKey);
  return decayed;
}
var SEASON_DAYS = 90;
async function ensureNextSeason(prev, now) {
  const [year, sn] = prev.id.split("-S");
  let nextYear = Number(year);
  let nextN = Number(sn) + 1;
  if (nextN > 9) {
    nextN = 1;
    nextYear += 1;
  }
  const nextId = `${nextYear}-S${nextN}`;
  const existing = await seasons.get(nextId);
  if (existing) return;
  const startsAt = new Date(prev.endsAt);
  const endsAt = new Date(startsAt.getTime() + SEASON_DAYS * 864e5);
  await seasons.create({
    id: nextId,
    status: "upcoming",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    decayFactor: prev.decayFactor,
    decayTarget: prev.decayTarget
  });
}
var handler = async () => {
  const start = Date.now();
  const result = await rolloverSeasons({ now: /* @__PURE__ */ new Date() });
  console.log(
    JSON.stringify({
      feature: "tournaments",
      route: "cron:rolloverSeasons",
      status: 200,
      ms: Date.now() - start,
      ...result
    })
  );
};
export {
  handler,
  rolloverSeasons
};
