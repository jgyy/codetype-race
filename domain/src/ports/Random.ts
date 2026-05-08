export interface Random {
  /** RFC 4122 v7 UUID (time-ordered). */
  uuid(): string;
  /** Float in [0, 1). */
  float(): number;
  /** 6-char A-Z 0-9 join code. */
  joinCode(): string;
}
