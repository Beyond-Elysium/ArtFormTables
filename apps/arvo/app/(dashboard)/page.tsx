import { auth } from "@clerk/nextjs/server";
import { PageHeader } from "@/components/PageHeader";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// TODO(db): "Recent Activity" and "GovCon Insight" still need a real source
// (an activity feed model, and imported-benchmark-derived copy respectively)
// — out of scope for the scenario wizard pass, left as placeholders.

export default async function DashboardPage() {
  const { userId } = await auth();
  const scenarioCount = userId ? await db.scenario.count({ where: { userId } }) : 0;

  const stats = [
    {
      label: "Saved Scenarios",
      value: String(scenarioCount),
      caption: scenarioCount === 0 ? "No scenarios yet" : `${scenarioCount} scenario${scenarioCount === 1 ? "" : "s"} saved`,
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
