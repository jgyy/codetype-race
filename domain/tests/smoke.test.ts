import { describe, expect, test } from "bun:test";
import { DOMAIN_PACKAGE } from "../src/index";

describe("@codetype/domain scaffold", () => {
  test("package marker is exported", () => {
    expect(DOMAIN_PACKAGE).toBe("@codetype/domain");
  });
});
