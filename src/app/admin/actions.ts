"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { deleteMediaFiles } from "@/lib/media";

/// Marks a reel for re-download on the next sync run.
export async function retryReel(id: string): Promise<void> {
  await prisma.reel.update({
    where: { id },
    data: { status: "PENDING", failReason: null },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/reels");
}

/// Deletes a reel and its downloaded media files.
export async function deleteReel(id: string): Promise<void> {
  const reel = await prisma.reel.findUnique({
    where: { id },
    select: { videoPath: true, thumbnailPath: true },
  });
  await deleteMediaFiles([reel?.videoPath, reel?.thumbnailPath]);

  await prisma.reel.delete({ where: { id } });
  revalidatePath("/admin");
  revalidatePath("/admin/reels");
}
