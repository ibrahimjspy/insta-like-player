"use client";

import { createContext, useContext, useMemo, useState } from "react";

type ReaderChromeContextValue = {
  /// On the feed: true when the active reel is user-paused (show order bar + bottom nav).
  feedPausedChrome: boolean;
  setFeedPausedChrome: (visible: boolean) => void;
};

const ReaderChromeContext = createContext<ReaderChromeContextValue | null>(null);

export function ReaderChromeProvider({ children }: { children: React.ReactNode }) {
  const [feedPausedChrome, setFeedPausedChrome] = useState(false);
  const value = useMemo(
    () => ({ feedPausedChrome, setFeedPausedChrome }),
    [feedPausedChrome],
  );
  return (
    <ReaderChromeContext.Provider value={value}>{children}</ReaderChromeContext.Provider>
  );
}

export function useReaderChrome() {
  const ctx = useContext(ReaderChromeContext);
  if (!ctx) {
    throw new Error("useReaderChrome must be used within ReaderChromeProvider");
  }
  return ctx;
}
