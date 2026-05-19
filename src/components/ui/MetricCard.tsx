import { classNames } from "../../lib/classNames";

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  tone?: "neutral" | "positive" | "negative";
}

export function MetricCard({ label, value, trend, tone = "neutral" }: MetricCardProps) {
  return (
    <div className="rounded-panel border border-border/80 bg-panel px-3 py-2.5">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <strong className="text-lg font-semibold leading-none text-text">{value}</strong>
        {trend && (
          <span
            className={classNames(
              "text-xs font-semibold",
              tone === "positive" && "text-positive",
              tone === "negative" && "text-negative",
              tone === "neutral" && "text-text-muted",
            )}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
