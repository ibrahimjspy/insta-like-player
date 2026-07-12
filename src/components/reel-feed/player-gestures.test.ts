import { describe, expect, it } from "vitest";

import {
  classifyTapZone,
  clampSeekTime,
  formatScrubTime,
  progressFromPointer,
} from "./player-gestures";

describe("classifyTapZone", () => {
  it("maps left / center / right with default side ratio", () => {
    // width 100, left=0, sideRatio 0.35 → back <35, forward >65
    expect(classifyTapZone(10, 0, 100)).toBe("back");
    expect(classifyTapZone(34.9, 0, 100)).toBe("back");
    expect(classifyTapZone(50, 0, 100)).toBe("center");
    expect(classifyTapZone(65.1, 0, 100)).toBe("forward");
    expect(classifyTapZone(99, 0, 100)).toBe("forward");
  });

  it("respects bounds offset and custom side ratio", () => {
    expect(classifyTapZone(120, 100, 200, 0.25)).toBe("back"); // 10% into slide
    expect(classifyTapZone(200, 100, 200, 0.25)).toBe("center");
    expect(classifyTapZone(280, 100, 200, 0.25)).toBe("forward");
  });

  it("falls back to center on invalid geometry", () => {
    expect(classifyTapZone(50, 0, 0)).toBe("center");
    expect(classifyTapZone(Number.NaN, 0, 100)).toBe("center");
  });
});

describe("clampSeekTime", () => {
  it("seeks within bounds", () => {
    expect(clampSeekTime(10, -5, 60)).toBe(5);
    expect(clampSeekTime(10, 5, 60)).toBe(15);
  });

  it("clamps to start and end", () => {
    expect(clampSeekTime(2, -5, 60)).toBe(0);
    expect(clampSeekTime(58, 5, 60)).toBe(60);
  });

  it("returns null when duration is unknown", () => {
    expect(clampSeekTime(10, 5, 0)).toBeNull();
    expect(clampSeekTime(10, 5, Number.NaN)).toBeNull();
  });
});

describe("progressFromPointer", () => {
  it("maps pointer X to 0–1", () => {
    expect(progressFromPointer(0, 0, 100)).toBe(0);
    expect(progressFromPointer(50, 0, 100)).toBe(0.5);
    expect(progressFromPointer(100, 0, 100)).toBe(1);
  });

  it("clamps outside the track", () => {
    expect(progressFromPointer(-20, 0, 100)).toBe(0);
    expect(progressFromPointer(140, 0, 100)).toBe(1);
  });
});

describe("formatScrubTime", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatScrubTime(0)).toBe("0:00");
    expect(formatScrubTime(5)).toBe("0:05");
    expect(formatScrubTime(65)).toBe("1:05");
    expect(formatScrubTime(612)).toBe("10:12");
  });

  it("guards bad input", () => {
    expect(formatScrubTime(-3)).toBe("0:00");
    expect(formatScrubTime(Number.NaN)).toBe("0:00");
  });
});
