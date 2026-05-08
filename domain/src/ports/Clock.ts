export interface Clock {
  now(): Date;
  /** Convenience for code that wants epoch ms (Date.now() shape). */
  epochMs(): number;
}
