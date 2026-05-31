import path from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "@/lib/config";
import { contentTypeFor, resolveMediaPath, thumbUrl, videoUrl } from "@/lib/media";

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

describe("media url builders", () => {
  it("builds video and thumbnail URLs by shortcode", () => {
    expect(videoUrl("ABC123")).toBe("/api/media/video/ABC123");
    expect(thumbUrl("ABC123")).toBe("/api/media/thumb/ABC123");
  });
});
