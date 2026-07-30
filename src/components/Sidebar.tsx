"use client";

import { Heart, Library, Play, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOffline } from "@/components/OfflineProvider";
import { useReaderChrome } from "@/components/ReaderChromeContext";

const LINKS = [
  { href: "/", label: "Feed", Icon: Play },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/collections", label: "Collections", Icon: Library },
  { href: "/favorites", label: "Favorites", Icon: Heart },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { feedPausedChrome } = useReaderChrome();
  const { hostReachable } = useOffline();
  const disconnected = hostReachable === false;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const onFullBleedFeed = pathname === "/";
  const showBar = !onFullBleedFeed || feedPausedChrome;

  return (
    <aside
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-300 ease-out ${
        showBar ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      aria-hidden={!showBar}
    >
      <nav
        className="mx-auto flex max-w-lg items-stretch gap-1"
        aria-label="Reader"
      >
        {LINKS.map((link) => {
          const active = isActive(link.href);
          const disabled = disconnected && link.href !== "/";
          const className = `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[0.6875rem] font-medium transition-colors ${
            disabled
              ? "cursor-not-allowed text-muted/35"
              : active
              ? "bg-surface-elevated text-foreground"
              : "text-muted hover:bg-surface-hover hover:text-foreground-secondary"
          }`;
          const content = (
            <>
              <link.Icon
                size={20}
                strokeWidth={active ? 2.25 : 1.75}
                className="shrink-0"
              />
              <span className="max-w-full truncate">{link.label}</span>
            </>
          );

          return disabled ? (
            <button
              key={link.href}
              type="button"
              disabled
              aria-label={`${link.label} unavailable while disconnected`}
              title="Available when connected to the Mac"
              className={className}
            >
              {content}
            </button>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              className={className}
            >
              {content}
            </Link>
          );
        })}
        {disconnected ? (
          <button
            type="button"
            disabled
            aria-label="Admin unavailable while disconnected"
            title="Available when connected to the Mac"
            className="flex shrink-0 cursor-not-allowed flex-col items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-[0.6875rem] font-medium text-muted/35"
          >
            <Settings size={20} strokeWidth={1.75} />
            <span className="truncate">Admin</span>
          </button>
        ) : (
          <Link
            href="/admin"
            className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-[0.6875rem] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground-secondary"
          >
            <Settings size={20} strokeWidth={1.75} />
            <span className="truncate">Admin</span>
          </Link>
        )}
      </nav>
    </aside>
  );
}
