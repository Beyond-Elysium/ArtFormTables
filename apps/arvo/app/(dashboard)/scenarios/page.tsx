import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { IconFolders } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";
import { ScenariosList, type ScenarioListItem } from "@/components/ScenariosList";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const { userId } = await auth();
  const scenarios = userId ? await db.scenario.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }) : [];

  const items: ScenarioListItem[] = scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    objective: s.objective,
    sector: s.sector,
    budget: s.budget.toNumber(),
    influenceScore: s.influenceScore,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Saved Scenarios"
        action={
          <Link href="/arvo/scenarios/new" className="btn btn-primary">
            New Scenario
          </Link>
        }
      />
      {items.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconFolders size={48} stroke={1.5} />
            </div>
            <p className="empty-title">No scenarios yet</p>
            <p className="empty-subtitle text-secondary">
              Run a benchmark scenario to see how a planned campaign is likely to perform before it launches.
            </p>
            <div className="empty-action">
              <Link href="/arvo/scenarios/new" className="btn btn-primary">
                New Scenario
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            <ScenariosList scenarios={items} />
          </div>
        </div>
      )}
    </>
  );
}
