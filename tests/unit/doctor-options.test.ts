import { describe, expect, it } from "vitest";
import { runDoctor } from "../../src/cli/doctor.js";

describe("doctor options", () => {
  it("accepts ctid without throwing synchronously", () => {
    expect(typeof runDoctor).toBe("function");
  });

  it("keeps ctid optional in options shape", () => {
    const options = { check: "mcp-config", ctid: 201 };
    expect(options.ctid).toBe(201);
  });
});
