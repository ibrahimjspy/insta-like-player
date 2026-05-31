"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";

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
