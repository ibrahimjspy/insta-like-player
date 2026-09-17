import { describe, expect, it } from "vitest";

import { isUserSlideChange } from "./useFeedActiveSlide";

describe("isUserSlideChange", () => {
  it("ignores the first active clip after mount", () => {
    expect(isUserSlideChange(null, "a-0")).toBe(false);
  });

  it("detects scrolling to a different clip", () => {
    expect(isUserSlideChange("a-0", "b-1")).toBe(true);
  });

  it("ignores missing ids and repeats", () => {
    expect(isUserSlideChange("a-0", null)).toBe(false);
    expect(isUserSlideChange("a-0", "a-0")).toBe(false);
    expect(isUserSlideChange(null, null)).toBe(false);
  });
});
