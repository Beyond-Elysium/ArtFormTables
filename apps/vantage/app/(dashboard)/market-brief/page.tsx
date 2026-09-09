import { IconFileAnalytics } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db + sync): the brief is generated from a month's worth of synced
// opportunity + award data — real content lands once the concurrent Prisma
// schema and sync work merge in.

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
  new Date()
);

export default function MarketBriefPage() {
  return (
    <>
      <PageHeader
        title="Market Brief"
        subtitle={`${monthLabel} intelligence brief`}
      />
      <div className="card">
        <div className="empty py-5">
          <div className="empty-icon">
            <IconFileAnalytics size={48} stroke={1.5} />
          </div>
          <p className="empty-title">This month's brief isn't ready yet</p>
          <p className="empty-subtitle text-secondary">
            Once opportunities and awards are syncing, this page renders a
            monthly roll-up: new opportunities matching your tracked
            agencies and NAICS codes, notable competitor awards, and
            emerging trends.
          </p>
        </div>
      </div>
    </>
  );
}
