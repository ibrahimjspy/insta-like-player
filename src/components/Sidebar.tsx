"use client";

import { Heart, Library, Play, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Feed", Icon: Play },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/collections", label: "Collections", Icon: Library },
  { href: "/favorites", label: "Favorites", Icon: Heart },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex shrink-0 flex-row items-center gap-0.5 border-t border-border bg-surface px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 md:h-screen md:w-60 md:flex-col md:gap-2 md:border-r md:border-t-0 md:p-5">
      <Link
        href="/"
        className="mb-0 hidden text-lg font-bold tracking-tight md:mb-4 md:block"
      >
        <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
          Insta Like Player
        </span>
      </Link>

      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors md:flex-none md:flex-row md:justify-start md:gap-3 md:px-4 md:py-2.5 md:text-sm ${
            isActive(link.href)
              ? "bg-surface-2 text-foreground"
              : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          <link.Icon size={22} className="shrink-0 md:size-5" />
          <span className="max-w-full truncate md:text-sm">{link.label}</span>
        </Link>
      ))}

      <div className="hidden flex-1 md:block" />

      <Link
        href="/admin"
        className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground md:flex-row md:justify-start md:gap-3 md:px-4 md:py-2.5 md:text-sm"
      >
        <Settings size={22} className="shrink-0 md:size-5" />
        <span className="truncate md:text-sm">Admin</span>
      </Link>
    </aside>
  );
}
