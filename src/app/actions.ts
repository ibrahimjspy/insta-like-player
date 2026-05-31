"use server";

import { promises as fs } from "node:fs";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { resolveMediaPath } from "@/lib/media";

/// Removes a reel's downloaded media files from disk (best-effort).
async function deleteReelMedia(reel: {
  videoPath: string | null;
  thumbnailPath: string | null;
}): Promise<void> {
  for (const name of [reel.videoPath, reel.thumbnailPath]) {
    if (!name) continue;
    const path = resolveMediaPath(name);
    if (path) await fs.unlink(path).catch(() => undefined);
  }
}

/// Toggles a reel's favorite flag. Returns the new value.
export async function toggleFavorite(reelId: string): Promise<boolean> {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    select: { isFavorite: true },
  });
  if (!reel) throw new Error("Reel not found");

  const updated = await prisma.reel.update({
    where: { id: reelId },
    data: { isFavorite: !reel.isFavorite },
    select: { isFavorite: true },
  });

  revalidatePath("/");
  revalidatePath("/favorites");
  return updated.isFavorite;
}

/// Permanently deletes a reel and its media. (A future re-import of the export
/// could re-add it; use skipReel to keep it out for good.)
export async function deleteReel(reelId: string): Promise<void> {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    select: { videoPath: true, thumbnailPath: true },
  });
  if (reel) await deleteReelMedia(reel);

  await prisma.reel.delete({ where: { id: reelId } }).catch(() => undefined);
  revalidatePath("/");
  revalidatePath("/favorites");
}

/// Marks a reel as SKIPPED: deletes any downloaded media and keeps the row so
/// it's excluded from the feed and never re-downloaded by future syncs.
export async function skipReel(reelId: string): Promise<void> {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    select: { videoPath: true, thumbnailPath: true },
  });
  if (reel) await deleteReelMedia(reel);

  await prisma.reel.update({
    where: { id: reelId },
    data: {
      status: "SKIPPED",
      videoPath: null,
      thumbnailPath: null,
      isFavorite: false,
    },
  });
  revalidatePath("/");
  revalidatePath("/favorites");
}

/// Records that a reel was watched (for history / resume).
export async function recordWatch(reelId: string, positionSec = 0): Promise<void> {
  await prisma.watchHistory.create({
    data: { reelId, positionSec },
  });
}

export async function createCollection(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim() || null;

  await prisma.collection.upsert({
    where: { name },
    create: { name, description },
    update: {},
  });
  revalidatePath("/collections");
}

export async function deleteCollection(id: string): Promise<void> {
  await prisma.collection.delete({ where: { id } });
  revalidatePath("/collections");
}

export async function addReelToCollection(
  collectionId: string,
  reelId: string,
): Promise<void> {
  await prisma.collectionReel.upsert({
    where: { collectionId_reelId: { collectionId, reelId } },
    create: { collectionId, reelId },
    update: {},
  });
  revalidatePath(`/collections/${collectionId}`);
}

export async function removeReelFromCollection(
  collectionId: string,
  reelId: string,
): Promise<void> {
  await prisma.collectionReel
    .delete({ where: { collectionId_reelId: { collectionId, reelId } } })
    .catch(() => undefined);
  revalidatePath(`/collections/${collectionId}`);
}
