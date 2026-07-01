import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export function Input({ className = "", mono, ...props }: Props) {
  return (
    <input
      className={`h-11 w-full rounded-lg border border-border bg-surface-elevated px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-ring/30 disabled:opacity-50 ${mono ? "font-mono" : ""} ${className}`}
      {...props}
    />
  );
}

export function TextArea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-[4rem] w-full resize-y rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-subtle focus:border-border-strong focus:ring-2 focus:ring-ring/30 ${className}`}
      {...props}
    />
  );
}
