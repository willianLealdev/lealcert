import { describe, expect, it } from "vitest";
import { swHasPsbio } from "../lib/safeweb";

describe("swHasPsbio", () => {
  it.each([
    { encontrado: true },
    { Encontrado: "true" },
    { resultado: 1 },
    { Biometria: "sim" },
    { status: "ENCONTRADO" },
    { Status: "Encontrado" },
    { statusCode: 200 },
  ])("recognizes a positive Safeweb response: %o", (result) => {
    expect(swHasPsbio(result)).toBe(true);
  });

  it("does not approve a negative response", () => {
    expect(swHasPsbio({ encontrado: false, status: "NAO_ENCONTRADO" })).toBe(false);
  });
});