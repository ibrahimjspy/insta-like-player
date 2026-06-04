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
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { feedPausedChrome } = useReaderChrome();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const onFeed = pathname === "/";
  const showBar = !onFeed || feedPausedChrome;

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
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[0.6875rem] font-medium transition-colors ${
                active
                  ? "bg-surface-elevated text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground-secondary"
              }`}
            >
              <link.Icon
                size={20}
                strokeWidth={active ? 2.25 : 1.75}
                className="shrink-0"
              />
              <span className="max-w-full truncate">{link.label}</span>
            </Link>
          );
        })}
        <Link
          href="/admin"
          className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-[0.6875rem] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground-secondary"
        >
          <Settings size={20} strokeWidth={1.75} />
          <span className="truncate">Admin</span>
        </Link>
      </nav>
    </aside>
  );
}
