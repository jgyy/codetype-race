export const roomPK = (roomId: string) => `ROOM#${roomId}`;
export const roomMetaSK = () => "META";
export const playerSK = (displayName: string) => `PLAYER#${displayName}`;
export const connSK = (connectionId: string) => `CONN#${connectionId}`;
export const resultSK = (finishedAt: number, displayName: string) =>
    `RESULT#${finishedAt}#${displayName}`;

export const snippetPK = (snippetId: string) => `SNIPPET#${snippetId}`;

// User profile + race history live under USER#<sub>. Profile uses
// SK="PROFILE"; per-race rows use SK="RACE#<finishedAt>#<roomId>" so a
// reverse-sort query returns most recent first.
export const userPK = (userId: string) => `USER#${userId}`;
export const userProfileSK = () => "PROFILE";
export const userRaceSK = (finishedAt: number, roomId: string) =>
    `RACE#${finishedAt}#${roomId}`;

// Leaderboards use inverse-padded ratings as the SK so DDB's lex sort
// puts the highest rating first when scanning forward. PAD_WIDTH=6 gives
// us headroom for ratings up to 999_999.
const RATING_PAD_WIDTH = 6;
const RATING_BIAS = 999_999;
export const ratingSortKey = (rating: number, userId: string) => {
    const inverted = Math.max(0, RATING_BIAS - Math.floor(rating));
    return `RATING#${String(inverted).padStart(RATING_PAD_WIDTH, "0")}#${userId}`;
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

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(rand: () => number = Math.random): string {
    let out = "";
    for (let i = 0; i < 6; i++) {
        out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
    }
    return out;
}
