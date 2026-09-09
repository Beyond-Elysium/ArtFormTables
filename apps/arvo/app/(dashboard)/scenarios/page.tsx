import Link from "next/link";
import { IconFolders } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db): replace this empty state with a real list once lib/db.ts (from
// the concurrent Prisma-schema work) can query saved scenarios for the
// current org.

export default function ScenariosPage() {
  return (
    <>
      <PageHeader title="Saved Scenarios" />
      <div className="card">
        <div className="empty">
          <div className="empty-icon">
            <IconFolders size={48} stroke={1.5} />
          </div>
          <p className="empty-title">No scenarios yet</p>
          <p className="empty-subtitle text-secondary">
            Run a benchmark scenario to see how a planned campaign is likely
            to perform before it launches.
          </p>
          <div className="empty-action">
            <Link href="/scenarios/new" className="btn btn-primary">
              New Scenario
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
