import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <Link href="/admin" className="font-bold tracking-tight">
            <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
              Admin
            </span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted">
            <Link href="/admin" className="hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/admin/reels" className="hover:text-foreground">
              Reels
            </Link>
          </nav>
          <div className="flex-1" />
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Back to feed
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
