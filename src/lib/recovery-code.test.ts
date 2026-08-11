import { describe, expect, it } from "vitest";
import { generateRecoveryCode } from "./recovery-code.server";

describe("generateRecoveryCode", () => {
  it("keeps the prefix and returns eight digits", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateRecoveryCode("1234")).toMatch(/^1234\d{4}$/);
    }
  });
});
