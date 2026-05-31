"use client";

import { Heart, Library, Play, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useReaderChrome } from "@/components/ReaderChromeContext";

const LINKS = [
  { href: "/", label: "Feed", Icon: Play },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/collections", label: "Collections", Icon: Library },
  { href: "/favorites", label: "Favorites", Icon: Heart },
];

export function Sidebar() {
  const pathname = usePathname();
  const { feedPausedChrome } = useReaderChrome();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  /// Feed: overlay only while paused. Other routes: always pinned to bottom.
  const onFeed = pathname === "/";
  const showBar = !onFeed || feedPausedChrome;

  return (
    <aside
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-row items-center gap-0.5 border-t border-border bg-surface/95 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-200 ease-out ${
        showBar ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      aria-hidden={!showBar}
    >
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
            isActive(link.href)
              ? "bg-surface-2 text-foreground"
              : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          <link.Icon size={22} className="shrink-0" />
          <span className="max-w-full truncate">{link.label}</span>
        </Link>
      ))}

      <Link
        href="/admin"
        className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Settings size={22} className="shrink-0" />
        <span className="truncate">Admin</span>
      </Link>
    </aside>
  );
}
