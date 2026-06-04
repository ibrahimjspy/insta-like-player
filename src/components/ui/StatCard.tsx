export function StatCard({
  value,
  label,
  highlight,
}: {
  value: number | string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`card flex flex-col justify-between p-4 transition-colors hover:border-border-strong ${
        highlight ? "border-border-strong bg-surface-elevated" : ""
      }`}
    >
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 label-caps">{label}</p>
    </div>
  );
}
