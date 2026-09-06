import { describe, expect, it, vi } from "vitest";
import { startPlayback } from "./playback";

const blocked = () => Object.assign(new Error("Gesture required"), { name: "NotAllowedError" });

describe("initial playback", () => {
  it("starts with sound when allowed", async () => {
    const video = { muted: true, play: vi.fn().mockResolvedValue(undefined) };
    expect(await startPlayback(video, false, () => true)).toBe(true);
    expect(video.muted).toBe(false);
    expect(video.play).toHaveBeenCalledTimes(1);
  });
  it("falls back to muted video when permission blocks sound", async () => {
    const video = { muted: false, play: vi.fn().mockRejectedValueOnce(blocked()).mockResolvedValue(undefined) };
    expect(await startPlayback(video, false, () => true)).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(2);
  });
  it("respects intentional mute", async () => {
    const video = { muted: false, play: vi.fn().mockResolvedValue(undefined) };
    await startPlayback(video, true, () => true);
    expect(video.muted).toBe(true);
  });
  it("does not restart an inactive video after a late rejection", async () => {
    let current = true;
    const video = { muted: false, play: vi.fn().mockImplementation(async () => { current = false; throw blocked(); }) };
    expect(await startPlayback(video, false, () => current)).toBe(false);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);
  });
  it("does not treat media failures as sound permission failures", async () => {
    const error = Object.assign(new Error("Unsupported media"), { name: "NotSupportedError" });
    const video = { muted: false, play: vi.fn().mockRejectedValue(error) };
    await expect(startPlayback(video, false, () => true)).rejects.toBe(error);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);
  });
});
