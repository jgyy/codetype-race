import { describe, expect, test } from "bun:test";
import { APP_PACKAGE, DOMAIN_PACKAGE } from "../src/index";

describe("@codetype/app scaffold", () => {
  test("re-exports domain marker", () => {
    expect(DOMAIN_PACKAGE).toBe("@codetype/domain");
    expect(APP_PACKAGE).toBe("@codetype/app");
  });
});
