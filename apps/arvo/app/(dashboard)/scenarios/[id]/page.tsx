import { PageHeader } from "@/components/PageHeader";

// TODO(db): fetch the scenario by params.id via lib/db.ts once the
// concurrent Prisma-schema work lands; 404 via notFound() when it's missing.

export default function ScenarioResultsPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <PageHeader
        title="Scenario Results"
        subtitle={`Scenario ${params.id}`}
      />
      <div className="card">
        <div className="card-body">
          <p className="text-secondary mb-0">
            Benchmark results — projected reach, cost-per-outcome, and
            comparable-campaign percentile — will render here once scenario
            data is available.
          </p>
        </div>
      </div>
    </>
  );
}
