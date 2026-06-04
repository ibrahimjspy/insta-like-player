import Link from "next/link";

export function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-border-strong bg-accent-subtle text-foreground"
          : "border-border text-muted hover:border-border-strong hover:bg-surface-hover hover:text-foreground-secondary"
      }`}
    >
      {children}
    </Link>
  );
}
