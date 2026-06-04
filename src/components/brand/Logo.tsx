import Link from "next/link";

type Variant = "full" | "mark" | "admin";

interface Props {
  variant?: Variant;
  href?: string;
  className?: string;
}

/** Brand mark — geometric stack + play cue (matches `src/app/icon.svg`). */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect x="4" y="6" width="18" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <rect
        x="10"
        y="10"
        width="18"
        height="20"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <path d="M15 14.5v7l5.5-3.5L15 14.5z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

export function Logo({ variant = "full", href = "/", className = "" }: Props) {
  const label =
    variant === "admin" ? (
      <>
        <span className="font-semibold tracking-tight text-foreground">Library</span>
        <span className="label-caps ml-2 rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-[0.625rem] text-muted">
          Admin
        </span>
      </>
    ) : (
      <span className="font-semibold tracking-tight text-foreground">Like Player</span>
    );

  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-8 w-8 text-foreground" />
      {variant !== "mark" && label}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="inline-flex transition-opacity hover:opacity-90">
      {content}
    </Link>
  );
}
