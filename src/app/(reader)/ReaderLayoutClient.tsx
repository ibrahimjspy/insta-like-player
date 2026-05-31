"use client";

import { usePathname } from "next/navigation";

import { ReaderChromeProvider } from "@/components/ReaderChromeContext";
import { Sidebar } from "@/components/Sidebar";

export function ReaderLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onFeed = pathname === "/";

  return (
    <ReaderChromeProvider>
      <div className="relative h-[100dvh] max-h-[100dvh] overflow-hidden md:h-screen md:max-h-none">
        <main
          className={`h-full overflow-hidden ${onFeed ? "" : "pb-[calc(3.75rem+env(safe-area-inset-bottom))]"}`}
        >
          {children}
        </main>
        <Sidebar />
      </div>
    </ReaderChromeProvider>
  );
}
