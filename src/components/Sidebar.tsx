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
    <aside className="flex shrink-0 flex-row gap-1 border-border bg-surface p-3 md:h-screen md:w-60 md:flex-col md:gap-2 md:border-r md:p-5">
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
          className={`flex flex-1 items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors md:flex-none md:justify-start ${
            isActive(link.href)
              ? "bg-surface-2 text-foreground"
              : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          <link.Icon size={20} />
          <span>{link.label}</span>
        </Link>
      ))}

      <div className="hidden flex-1 md:block" />

      <Link
        href="/admin"
        className="flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground md:justify-start"
      >
        <Settings size={20} />
        <span>Admin</span>
      </Link>
    </aside>
  );
}
