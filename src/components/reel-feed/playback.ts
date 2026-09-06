/** Try the user's sound preference; only permission rejection warrants silent playback. */
export async function startPlayback(
  video: Pick<HTMLVideoElement, "muted" | "play">,
  muted: boolean,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!isCurrent()) return false;
  video.muted = muted;
  try {
    await video.play();
  } catch (error) {
    if (!isCurrent()) return false;
    if (muted || !(error instanceof Error) || error.name !== "NotAllowedError") throw error;
    video.muted = true;
    await video.play();
  }
  return isCurrent();
}
