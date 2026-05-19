import { classNames } from "../../lib/classNames";

interface StatusBadgeProps {
  label: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone === "positive" && "border-positive/30 bg-positive/10 text-positive",
        tone === "negative" && "border-negative/30 bg-negative/10 text-negative",
        tone === "warning" && "border-amber-400/40 bg-amber-400/10 text-amber-700",
        tone === "neutral" && "border-border bg-panel-muted text-text-muted",
      )}
    >
      {label}
    </span>
  );
}
