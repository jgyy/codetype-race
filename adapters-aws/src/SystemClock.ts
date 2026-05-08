import type { Clock } from "@codetype/domain";

export class SystemClock implements Clock {
    now(): Date {
        return new Date();
    }
    epochMs(): number {
        return Date.now();
    }
}
