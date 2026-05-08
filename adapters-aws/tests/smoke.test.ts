import { describe, expect, test } from "bun:test";
import { ADAPTERS_AWS_PACKAGE } from "../src/index";

describe("@codetype/adapters-aws scaffold", () => {
  test("package marker is exported", () => {
    expect(ADAPTERS_AWS_PACKAGE).toBe("@codetype/adapters-aws");
  });
});
