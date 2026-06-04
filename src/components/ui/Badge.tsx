import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "active";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-elevated text-muted border-border",
  success: "bg-success-muted text-success border-success/20",
  warning: "bg-warning-muted text-warning border-warning/20",
  danger: "bg-danger-muted text-danger border-danger/20",
  info: "bg-info-muted text-info border-info/20",
  active: "bg-accent-subtle text-foreground border-border-strong",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
