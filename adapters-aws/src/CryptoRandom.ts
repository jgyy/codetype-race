import { v7 as uuidv7 } from "uuid";
import { generateRoomCode } from "@codetype/shared/ddb-keys";
import type { Random } from "@codetype/domain";

export class CryptoRandom implements Random {
    uuid(): string {
        return uuidv7();
    }
    float(): number {
        return Math.random();
    }
    joinCode(): string {
        return generateRoomCode();
    }
}
