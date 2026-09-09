import { IconBell } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db + sync): alerts fire on opportunity sync events (new matches,
// deadline changes, competitor activity) — real rows land once the
// concurrent Prisma schema and sync work merge in.

export default function AlertsPage() {
  return (
    <>
      <PageHeader
        title="Alert Center"
        subtitle="Every triggered alert, read and unread."
        action={
          <button type="button" className="btn btn-outline-secondary" disabled>
            Mark all as read
          </button>
        }
      />
      <div className="card">
        <div className="empty py-5">
          <div className="empty-icon">
            <IconBell size={48} stroke={1.5} />
          </div>
          <p className="empty-title">No alerts yet</p>
          <p className="empty-subtitle text-secondary">
            Alerts fire on new opportunity matches, deadline changes, and
            competitor activity once tracking and alert preferences (see
            Settings) are live.
          </p>
        </div>
      </div>
    </>
  );
}
