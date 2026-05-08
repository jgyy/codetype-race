export interface Clock {
    now(): Date;
    epochMs(): number;
}
