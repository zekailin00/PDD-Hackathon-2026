import { describe, expect, it } from "vitest";
import { can, resolveRole, voters } from "../pdd/role-policy";

describe("role policy", () => {
  it("fails unknown roles closed", () => {
    expect(resolveRole("admin")).toEqual(resolveRole("observer"));
    expect(can("admin", "run")).toBe(false);
  });

  it("merges overrides per power", () => {
    expect(resolveRole("design", { design: { vote: false } })).toMatchObject({ vote: false, steer: true });
  });

  it("never waits on observers", () => {
    expect(voters([{ userId: "z", role: "observer" }, { userId: "a", role: "qa" }])).toEqual(["a"]);
  });
});
