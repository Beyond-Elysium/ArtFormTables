import { IconDatabase } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db): list imported campaign datasets via lib/db.ts once the
// concurrent Prisma-schema work lands.

export default function CampaignDataPage() {
  return (
    <>
      <PageHeader
        title="Campaign Data"
        subtitle="Historical GovCon campaign performance used to benchmark new scenarios."
      />
      <div className="card">
        <div className="empty">
          <div className="empty-icon">
            <IconDatabase size={48} stroke={1.5} />
          </div>
          <p className="empty-title">No campaign data yet</p>
          <p className="empty-subtitle text-secondary">
            Import historical campaign performance to start benchmarking new
            scenarios against it.
          </p>
        </div>
      </div>
    </>
  );
}
