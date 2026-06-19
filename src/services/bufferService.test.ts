import { describe, expect, it } from "vitest";

import { getBufferedAheadSeconds, hasEnoughStartupBuffer } from "./bufferService";

describe("bufferService", () => {
  it("calculates buffered seconds ahead of the current time", () => {
    const buffered = createBufferedRanges([
      [0, 4],
      [10, 30]
    ]);

    expect(getBufferedAheadSeconds(buffered, 12)).toBe(18);
  });

  it("returns zero when no buffered range covers current time", () => {
    const buffered = createBufferedRanges([[10, 30]]);

    expect(getBufferedAheadSeconds(buffered, 4)).toBe(0);
  });

  it("detects enough startup buffer", () => {
    const buffered = createBufferedRanges([[0, 12]]);

    expect(hasEnoughStartupBuffer(buffered, 4, 8)).toBe(true);
    expect(hasEnoughStartupBuffer(buffered, 4, 9)).toBe(false);
  });
});

function createBufferedRanges(ranges: Array<[number, number]>) {
  return {
    length: ranges.length,
    start: (index: number) => ranges[index]?.[0] ?? 0,
    end: (index: number) => ranges[index]?.[1] ?? 0
  };
}
