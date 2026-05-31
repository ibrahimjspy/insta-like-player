import path from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "@/lib/config";
import { contentTypeFor, parseByteRange, resolveMediaPath } from "@/lib/media";

describe("contentTypeFor", () => {
  it("maps known video extensions", () => {
    expect(contentTypeFor("ABC.mp4")).toBe("video/mp4");
    expect(contentTypeFor("ABC.webm")).toBe("video/webm");
    expect(contentTypeFor("ABC.mov")).toBe("video/quicktime");
  });

  it("maps known image extensions", () => {
    expect(contentTypeFor("ABC.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("ABC.jpeg")).toBe("image/jpeg");
    expect(contentTypeFor("ABC.png")).toBe("image/png");
    expect(contentTypeFor("ABC.webp")).toBe("image/webp");
  });

  it("is case-insensitive", () => {
    expect(contentTypeFor("ABC.MP4")).toBe("video/mp4");
    expect(contentTypeFor("ABC.JPG")).toBe("image/jpeg");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(contentTypeFor("ABC.txt")).toBe("application/octet-stream");
    expect(contentTypeFor("noextension")).toBe("application/octet-stream");
  });
});

describe("resolveMediaPath", () => {
  it("resolves a plain filename inside the media directory", () => {
    expect(resolveMediaPath("ABC123.mp4")).toBe(path.join(config.mediaDir, "ABC123.mp4"));
  });

  it("blocks parent-directory traversal", () => {
    expect(resolveMediaPath("../../etc/passwd")).toBeNull();
    expect(resolveMediaPath("..")).toBeNull();
  });

  it("blocks absolute paths that escape the media directory", () => {
    expect(resolveMediaPath("/etc/passwd")).toBeNull();
  });

  it("allows nested paths that stay within the media directory", () => {
    expect(resolveMediaPath("sub/ABC123.mp4")).toBe(
      path.join(config.mediaDir, "sub", "ABC123.mp4"),
    );
  });
});

describe("parseByteRange", () => {
  const SIZE = 1000;

  it("returns null when the header isn't a byte range", () => {
    expect(parseByteRange("items=0-10", SIZE)).toBeNull();
  });

  it("parses a normal range", () => {
    expect(parseByteRange("bytes=0-499", SIZE)).toEqual({
      kind: "ok",
      start: 0,
      end: 499,
    });
  });

  it("defaults the end to the last byte (open-ended range)", () => {
    expect(parseByteRange("bytes=200-", SIZE)).toEqual({
      kind: "ok",
      start: 200,
      end: 999,
    });
  });

  it("clamps an end that exceeds the file size", () => {
    expect(parseByteRange("bytes=0-99999", SIZE)).toEqual({
      kind: "ok",
      start: 0,
      end: 999,
    });
  });

  it("marks a start beyond EOF as unsatisfiable", () => {
    expect(parseByteRange("bytes=2000-3000", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseByteRange(`bytes=${SIZE}-`, SIZE)).toEqual({ kind: "unsatisfiable" });
  });
});
