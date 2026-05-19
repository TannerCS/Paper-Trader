interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-text-muted">{description}</p>}
    </div>
  );
}
