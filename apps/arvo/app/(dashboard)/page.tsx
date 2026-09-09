import { PageHeader } from "@/components/PageHeader";

// TODO(db): stat values below will be sourced from lib/db.ts once the
// concurrent Prisma-schema work lands (scenario count, activity feed, etc).

const stats = [
  {
    label: "Saved Scenarios",
    value: "0",
    caption: "No scenarios yet",
  },
  {
    label: "Recent Activity",
    value: "0",
    caption: "Nothing in the last 7 days",
  },
  {
    label: "GovCon Insight",
    value: "—",
    caption: "Import campaign data to unlock benchmarks",
  },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Know if your campaigns are winning before the results come in."
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
    </>
  );
}
