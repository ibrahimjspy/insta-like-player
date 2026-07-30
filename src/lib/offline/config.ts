import type { Platform } from "@prisma/client";

/// Offline pocket policy. Tunable here; keep in sync with issue #2.
export const OFFLINE_CONFIG = {
  /// Soft cap for video blobs stored on the device.
  maxBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  /// Skip individual files larger than this (rare long clips).
  maxFileBytes: 80 * 1024 * 1024, // 80 MB
  /// Platforms allowed in the pocket. Facebook stays Mac/VPN-only.
  allowedPlatforms: ["INSTAGRAM", "TIKTOK"] as const satisfies readonly Platform[],
  /// How many candidate rows the server returns (favorites + recent).
  candidateLimit: 400,
  /// Min gap between automatic reconnect refreshes.
  autoRefreshCooldownMs: 5 * 60 * 1000,
  autoRefreshStorageKey: "like-player-offline-auto-refresh-at",
  dbName: "like-player-offline",
  dbVersion: 1,
  storeName: "reels",
} as const;

export type OfflineAllowedPlatform = (typeof OFFLINE_CONFIG.allowedPlatforms)[number];
