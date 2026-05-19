import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-normal text-text">{title}</h1>
      </div>
      {action}
    </header>
  );
}
