import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";

interface PlaceholderPageProps {
  title: string;
  description: string;
  nextStep: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <Panel eyebrow="Queued">
        <EmptyState title="Under Construction." />
      </Panel>
    </div>
  );
}
