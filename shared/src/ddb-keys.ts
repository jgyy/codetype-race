export const roomPK = (roomId: string) => `ROOM#${roomId}`;
export const roomMetaSK = () => "META";
export const playerSK = (displayName: string) => `PLAYER#${displayName}`;
export const connSK = (connectionId: string) => `CONN#${connectionId}`;
export const resultSK = (finishedAt: number, displayName: string) =>
  `RESULT#${finishedAt}#${displayName}`;

export const snippetPK = (snippetId: string) => `SNIPPET#${snippetId}`;

export const codeGSI1PK = (code: string) => `CODE#${code}`;
export const connGSI1PK = (connectionId: string) => `CONN#${connectionId}`;
export const langGSI1PK = (language: string) => `LANG#${language}`;
// Snippets are indexed on GSI1 by language (PK) with a sort key that
// embeds difficulty so consumers can range-scan by language and filter
// by difficulty in a single query (`begins_with(GSI1SK, "DIFF#3#")`).
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
