export const roomPK = (roomId: string) => `ROOM#${roomId}`;
export const roomMetaSK = () => "META";
export const playerSK = (displayName: string) => `PLAYER#${displayName}`;
export const connSK = (connectionId: string) => `CONN#${connectionId}`;
export const resultSK = (finishedAt: number, displayName: string) =>
    `RESULT#${finishedAt}#${displayName}`;

export const snippetPK = (snippetId: string) => `SNIPPET#${snippetId}`;

export const pendingQueuePK = () => "QUEUE#SNIPPETS#PENDING";
export const pendingQueueSK = (submittedAt: number, snippetId: string) =>
    `SUBMITTED#${submittedAt}#${snippetId}`;

export const submitCounterSK = (date: string) => `SUBMIT_DAY#${date}`;

export const userPK = (userId: string) => `USER#${userId}`;
export const userProfileSK = () => "PROFILE";
export const userRaceSK = (finishedAt: number, roomId: string) =>
    `RACE#${finishedAt}#${roomId}`;

const RATING_PAD_WIDTH = 6;
const RATING_BIAS = 999_999;
export const ratingSortKey = (rating: number, userId: string) => {
    const inverted = Math.max(0, RATING_BIAS - Math.floor(rating));
    return `RATING#${String(inverted).padStart(RATING_PAD_WIDTH, "0")}#${userId}`;
};

export const dailyPK = (date: string) => `DAILY#${date}`;
export const dailyMetaSK = () => "META";
export const dailyUserSK = (userId: string) => `USER#${userId}`;
const WPM_PAD_WIDTH = 5;
const WPM_BIAS = 99_999;
export const dailyRunSK = (wpm: number, userId: string) => {
    const inverted = Math.max(0, WPM_BIAS - Math.floor(wpm));
    return `RUN#${String(inverted).padStart(WPM_PAD_WIDTH, "0")}#${userId}`;
};
export const leaderboardGlobalPK = () => "LEADERBOARD#GLOBAL";
export const leaderboardLangPK = (language: string) =>
    `LEADERBOARD#LANG#${language}`;

export const codeGSI1PK = (code: string) => `CODE#${code}`;
export const connGSI1PK = (connectionId: string) => `CONN#${connectionId}`;
export const langGSI1PK = (language: string) => `LANG#${language}`;
export const snippetDiffGSI1SK = (difficulty: number, snippetId: string) =>
    `DIFF#${difficulty}#SNIPPET#${snippetId}`;
export const snippetDiffPrefix = (difficulty: number) =>
    `DIFF#${difficulty}#`;
export const hostGSI1PK = (hostId: string) => `HOST#${hostId}`;
export const finishedGSI1SK = (finishedAt: number) => `FINISHED#${finishedAt}`;

export const seasonPK = (id: string) => `SEASON#${id}`;
export const seasonMetaSK = () => "META";
export const seasonStatusGSI1PK = (status: string) => `SEASON#STATUS#${status}`;
export const seasonLbPK = (id: string, lang: string) =>
    `SEASON#${id}#LB#${lang}`;
const SEASON_RANK_PAD = 6;
export const seasonLbSK = (rank: number) =>
    `RANK#${String(rank).padStart(SEASON_RANK_PAD, "0")}`;

export const tournPK = (id: string) => `TOURN#${id}`;
export const tournMetaSK = () => "META";
export const tournStatusGSI1PK = (status: string) =>
    `TOURN#STATUS#${status}`;
export const tournEntrantSK = (userId: string) => `ENTRANT#${userId}`;
export const tournUserGSI1SK = (startsAt: string) => `TOURN#${startsAt}`;
export const tournMatchSK = (round: number, slot: number) =>
    `MATCH#${round}#${slot}`;
export const tournMatchStatusGSI1PK = (tournId: string, status: string) =>
    `TOURN#${tournId}#MATCH#STATUS#${status}`;
export const tournMatchStatusGSI1SK = (round: number, slot: number) =>
    `${round}#${slot}`;
export const tournConnSK = (connectionId: string) =>
    `CONN#${connectionId}`;

export const friendEdgeSK = (otherUserId: string) =>
    `FRIEND#${otherUserId}`;
export const friendRequestInboxSK = (fromUserId: string, ts: string) =>
    `FREQ#${fromUserId}#${ts}`;
export const friendRequestInboxPrefix = () => "FREQ#";
export const friendEdgePrefix = () => "FRIEND#";

export const presencePK = (userId: string) => `PRESENCE#${userId}`;
export const presenceConnSK = (connectionId: string) =>
    `CONN#${connectionId}`;
export const presenceOnlineGSI1PK = () => "PRESENCE#ONLINE";
export const presenceOnlineGSI1SK = (userId: string, lastSeenAt: number) =>
    `${userId}#${lastSeenAt}`;
export const presenceConnLookupGSI1PK = (connectionId: string) =>
    `PRESENCE-CONN#${connectionId}`;

export const handleBucketLength = 3;
export function handleBucket(handleLower: string): string {
    const trimmed = handleLower.replace(/[^a-z0-9]/g, "");
    return trimmed.slice(0, handleBucketLength).padEnd(handleBucketLength, "_");
}
export const userHandleGSI1PK = (handleLower: string) =>
    `USER#HANDLE#${handleBucket(handleLower)}`;
export const userHandleGSI1SK = (handleLower: string, userId: string) =>
    `${handleLower}#${userId}`;

// Activity feed: reverse-ts SK gives newest-first on a plain Query.
const FEED_TS_PAD = 16;
const FEED_TS_BIAS = Number.MAX_SAFE_INTEGER;
export const feedPK = (userId: string) => `FEED#${userId}`;
export const feedSK = (createdAtMs: number, eventId: string) => {
    const inverted = Math.max(0, FEED_TS_BIAS - Math.floor(createdAtMs));
    return `EV#${String(inverted).padStart(FEED_TS_PAD, "0")}#${eventId}`;
};

export const teamRoomSK = (teamId: string) => `TEAMS#${teamId}`;
export const teamRoomPrefix = () => "TEAMS#";

const TEAM_RATING_PAD_WIDTH = 6;
const TEAM_RATING_BIAS = 999_999;
export const teamRatingPK = (language: string) => `TEAM-RATING#${language}`;
export const teamRatingSK = (rating: number, userId: string) => {
    const inverted = Math.max(0, TEAM_RATING_BIAS - Math.floor(rating));
    return `RATING#${String(inverted).padStart(TEAM_RATING_PAD_WIDTH, "0")}#${userId}`;
};
export const teamRatingUserGSI1PK = (userId: string) => `TEAM-RATING#${userId}`;
export const teamRatingUserGSI1SK = (language: string) => language;

export const guildPK = (guildId: string) => `GUILD#${guildId}`;
export const guildMetaSK = () => "META";
export const guildMemberSK = (userId: string) => `MEMBER#${userId}`;
export const guildMemberPrefix = () => "MEMBER#";
export const guildInviteSK = (code: string) => `INVITE#${code}`;
export const guildInvitePrefix = () => "INVITE#";

export const guildSlugPK = (slugLower: string) => `GUILD#SLUG#${slugLower}`;

export const guildPublicGSI1PK = (slugLower: string) =>
    `GUILD#PUBLIC#${handleBucket(slugLower)}`;
export const guildPublicGSI1SK = (slugLower: string, guildId: string) =>
    `${slugLower}#${guildId}`;

export const userGuildGSI1PK = (userId: string) => `USER#${userId}`;
export const userGuildGSI1SK = (guildId: string, joinedAt: string) =>
    `GUILD#${guildId}#${joinedAt}`;

export const inviteCodeGSI1PK = (code: string) => `INVITE#${code}`;
export const inviteCodeGSI1SK = (guildId: string) => `GUILD#${guildId}`;

// Phase 11 — progression (XP / achievements / quests)
const REVERSE_TS_BASE = 9_999_999_999_999;
export const xpLedgerPK = (userId: string) => `XP#${userId}`;
export const xpLedgerSK = (epochMs: number, eventId: string) => {
    const inv = Math.max(0, REVERSE_TS_BASE - epochMs);
    return `EV#${String(inv).padStart(13, "0")}#${eventId}`;
};
export const xpSummarySK = () => "XP#SUMMARY";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(rand: () => number = Math.random): string {
    let out = "";
    for (let i = 0; i < 6; i++) {
        out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
    }
    return out;
}
