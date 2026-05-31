import { describe, expect, it } from "vitest";

import { buildYtDlpArgs, classifyOutputs, isUnavailable } from "@/lib/sync";

describe("buildYtDlpArgs", () => {
  const args = buildYtDlpArgs("https://www.instagram.com/reel/ABC/", "/media/ABC.%(ext)s");

  it("passes the url and output template", () => {
    expect(args[0]).toBe("https://www.instagram.com/reel/ABC/");
    expect(args).toContain("-o");
    expect(args[args.indexOf("-o") + 1]).toBe("/media/ABC.%(ext)s");
  });

  it("requests metadata, thumbnail and mp4 merge", () => {
    expect(args).toContain("--write-info-json");
    expect(args).toContain("--write-thumbnail");
    expect(args).toContain("--merge-output-format");
    expect(args[args.indexOf("--merge-output-format") + 1]).toBe("mp4");
  });

  it("omits cookies when none provided", () => {
    expect(args).not.toContain("--cookies");
  });

  it("appends cookies when provided", () => {
    const withCookies = buildYtDlpArgs("url", "tmpl", "/data/cookies.txt");
    expect(withCookies).toContain("--cookies");
    expect(withCookies[withCookies.indexOf("--cookies") + 1]).toBe("/data/cookies.txt");
  });
});

describe("classifyOutputs", () => {
  it("classifies video, thumbnail and info for a shortcode", () => {
    const files = ["ABC123.mp4", "ABC123.jpg", "ABC123.info.json"];
    expect(classifyOutputs(files, "ABC123")).toEqual({
      video: "ABC123.mp4",
      thumb: "ABC123.jpg",
      info: "ABC123.info.json",
    });
  });

  it("ignores files belonging to other shortcodes", () => {
    const files = ["OTHER.mp4", "ABC1234.mp4", "ABC123.mp4"];
    expect(classifyOutputs(files, "ABC123").video).toBe("ABC123.mp4");
  });

  it("returns undefined for missing outputs", () => {
    expect(classifyOutputs(["ABC123.info.json"], "ABC123")).toEqual({
      video: undefined,
      thumb: undefined,
      info: "ABC123.info.json",
    });
  });

  it("recognises alternative video and image extensions", () => {
    const result = classifyOutputs(["ABC123.webm", "ABC123.webp"], "ABC123");
    expect(result.video).toBe("ABC123.webm");
    expect(result.thumb).toBe("ABC123.webp");
  });
});

describe("isUnavailable", () => {
  it("flags deleted / private / login-gated content", () => {
    expect(isUnavailable("The post is not available")).toBe(true);
    expect(isUnavailable("Login required to view this")).toBe(true);
    expect(isUnavailable("This account is private")).toBe(true);
    expect(isUnavailable("Content has been removed")).toBe(true);
    expect(isUnavailable("HTTP Error 404: Not Found")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isUnavailable("NOT AVAILABLE")).toBe(true);
  });

  it("returns false for transient / generic errors", () => {
    expect(isUnavailable("Temporary network failure")).toBe(false);
    expect(isUnavailable("yt-dlp exited with code 1")).toBe(false);
  });
});
