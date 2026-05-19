import type { ReactNode } from "react";
import { classNames } from "../../lib/classNames";

interface PanelProps {
  title?: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, eyebrow, action, children, className }: PanelProps) {
  return (
    <section className={classNames("rounded-panel border border-border/80 bg-panel panel-shadow", className)}>
      {(title || eyebrow || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-border/70 px-3 py-2.5">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">{eyebrow}</p>}
            {title && <h2 className="truncate text-sm font-semibold text-text">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
