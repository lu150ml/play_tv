import { describe, expect, it } from "vitest";

import { isNewerBuild } from "./updateService";

describe("isNewerBuild", () => {
  it("detects a newer Android versionCode", () => {
    expect(isNewerBuild(2, 3)).toBe(true);
  });

  it("ignores the installed and older builds", () => {
    expect(isNewerBuild(2, 2)).toBe(false);
    expect(isNewerBuild(2, 1)).toBe(false);
  });
});
