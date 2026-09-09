import Link from "next/link";
import { IconBell } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db + sync): every stat/list on this page is a static placeholder.
// Real numbers land once the concurrent Prisma schema and SAM.gov/USASpending
// sync work merge in — this page just establishes the shell and layout.

const stats = [
  {
    label: "Tracked Opportunities",
    value: "0",
    caption: "No opportunities synced yet",
  },
  {
    label: "Avg Fit Score",
    value: "—",
    caption: "Needs at least one synced opportunity",
  },
  {
    label: "Unread Alerts",
    value: "0",
    caption: "Nothing new in the last 7 days",
  },
];

const fitBands = [
  { label: "Strong fit (80–100)", count: 0, color: "bg-green" },
  { label: "Moderate fit (50–79)", count: 0, color: "bg-yellow" },
  { label: "Weak fit (0–49)", count: 0, color: "bg-red" },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="See what's coming before the RFP drops."
      />
      <div className="row row-deck row-cards">
        {stats.map((stat) => (
          <div key={stat.label} className="col-sm-6 col-lg-4">
            <div className="card">
              <div className="card-body">
                <div className="subheader">{stat.label}</div>
                <div className="h1 mb-1">{stat.value}</div>
                <div className="text-secondary">{stat.caption}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row row-deck row-cards mt-1">
        <div className="col-lg-7">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Fit Score Distribution</h3>
            </div>
            <div className="card-body">
              {fitBands.map((band) => (
                <div key={band.label} className="mb-3">
                  <div className="d-flex justify-content-between text-secondary small mb-1">
                    <span>{band.label}</span>
                    <span>{band.count}</span>
                  </div>
                  <div className="progress progress-sm">
                    <div
                      className={`progress-bar ${band.color}`}
                      style={{ width: "0%" }}
                      role="progressbar"
                      aria-valuenow={0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              ))}
              <div className="text-secondary small">
                Import or sync opportunities to see a real distribution.
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent Alerts</h3>
              <Link href="/alerts" className="card-actions text-secondary">
                View all
              </Link>
            </div>
            <div className="empty py-4">
              <div className="empty-icon">
                <IconBell size={40} stroke={1.5} />
              </div>
              <p className="empty-title">No alerts yet</p>
              <p className="empty-subtitle text-secondary">
                Alerts fire on new matches, deadline changes, and competitor
                activity once tracking is live.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
