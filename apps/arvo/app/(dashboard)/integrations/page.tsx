import { IconPlug } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" />
      <div className="card">
        <div className="empty">
          <div className="empty-icon">
            <IconPlug size={48} stroke={1.5} />
          </div>
          <p className="empty-title">No integrations connected</p>
          <p className="empty-subtitle text-secondary">
            Connect ad platforms and data sources to keep campaign data in
            sync automatically.
          </p>
        </div>
      </div>
    </>
  );
}
