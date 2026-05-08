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

// Phase 09 — Tournaments & Seasons
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

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(rand: () => number = Math.random): string {
    let out = "";
    for (let i = 0; i < 6; i++) {
        out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
    }
    return out;
}
