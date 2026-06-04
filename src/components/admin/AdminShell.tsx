"use client";

import { LayoutDashboard, Film, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";

const NAV = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/admin/reels", label: "Reels", Icon: Film, exact: false },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="page-texture min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5 md:px-8">
          <Logo variant="admin" href="/admin" />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Admin">
            {NAV.map(({ href, label, Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-surface-elevated text-foreground"
                      : "text-muted hover:bg-surface-hover hover:text-foreground-secondary"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} className="opacity-80" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1" />
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-foreground"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">Reader</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
