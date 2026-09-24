import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { ScoreRing, BenchmarkGauge } from "@artform/suite-ui";
import { PageHeader } from "@/components/PageHeader";
import { FlightPerformanceTracker } from "@/components/FlightPerformanceTracker";
import { db } from "@/lib/db";
import { objectiveLabels, sectorLabels } from "@/lib/enums";
import { platformLabel } from "@/lib/platforms";
import { asScoreRecord, asFlightActuals, derivedMetrics } from "@/lib/scenario-json";

export const dynamic = "force-dynamic";

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function titleCase(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export default async function ScenarioResultsPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  const scenario = userId ? await db.scenario.findUnique({ where: { id: params.id } }) : null;
  if (!scenario || scenario.userId !== userId) notFound();

  const budget = scenario.budget.toNumber();
  const platformScores = asScoreRecord(scenario.platformScores);
  const budgetAllocations = asScoreRecord(scenario.budgetAllocations);
  const influenceBreakdown = asScoreRecord(scenario.influenceBreakdown);
  const flightActuals = asFlightActuals(scenario.flightActuals);
  const hasFlightActuals = Object.keys(flightActuals).length > 0;
  const trackablePlatforms = Object.keys(budgetAllocations);

  const rollups = hasFlightActuals
    ? await db.benchmarkRollup.findMany({
        where: { sector: scenario.sector, objective: scenario.objective, platform: { in: Object.keys(flightActuals) } },
      })
    : [];

  return (
    <>
      <PageHeader
        title={scenario.name}
        subtitle={`${objectiveLabels[scenario.objective]} · ${sectorLabels[scenario.sector]}`}
        action={
          <div className="d-flex gap-2">
            <Link href="/arvo/scenarios" className="btn btn-outline-secondary">
              Back to Scenarios
            </Link>
            <a
              href={`/arvo/api/report/${scenario.id}`}
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download PDF
            </a>
          </div>
        }
      />

      <div className="row g-3 mb-3">
        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body">
              <div className="text-secondary small">Budget</div>
              <div className="h3 mb-0">{currency(budget)}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body">
              <div className="text-secondary small">Flight Window</div>
              <div className="fw-bold">
                {dateLabel(scenario.flightStart)} – {dateLabel(scenario.flightEnd)}
              </div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body">
              <div className="text-secondary small">Personas</div>
              <div className="fw-bold">{scenario.personas.join(", ") || "—"}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card">
            <div className="card-body">
              <div className="text-secondary small">Status</div>
              <div className="fw-bold text-capitalize">{scenario.status}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">Influence Score</h3>
        </div>
        <div className="card-body d-flex align-items-center gap-4 flex-wrap">
          <ScoreRing value={scenario.influenceScore} label="Influence Score" />
          {Object.keys(influenceBreakdown).length > 0 && (
            <table className="table table-sm w-auto mb-0">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(influenceBreakdown).map(([factor, value]) => (
                  <tr key={factor}>
                    <td>{titleCase(factor)}</td>
                    <td>{Math.round(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title">Platform Scores</h3>
            </div>
            <div className="card-body">
              {Object.keys(platformScores).length > 0 ? (
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(platformScores)
                      .sort((a, b) => b[1] - a[1])
                      .map(([platform, score]) => (
                        <tr key={platform}>
                          <td>{platformLabel(platform)}</td>
                          <td>{Math.round(score)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-secondary mb-0">No platform scores yet.</p>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title">Budget Allocation</h3>
            </div>
            <div className="card-body">
              {Object.keys(budgetAllocations).length > 0 ? (
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Allocated</th>
                      <th>% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(budgetAllocations).map(([platform, amount]) => (
                      <tr key={platform}>
                        <td>{platformLabel(platform)}</td>
                        <td>{currency(amount)}</td>
                        <td>{budget > 0 ? `${Math.round((amount / budget) * 100)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-secondary mb-0">No budget allocation yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">Flight Performance Tracker</h3>
        </div>
        <div className="card-body">
          {trackablePlatforms.length > 0 ? (
            <FlightPerformanceTracker scenarioId={scenario.id} platforms={trackablePlatforms} initial={flightActuals} />
          ) : (
            <p className="text-secondary mb-0">No allocated platforms to track actuals for yet.</p>
          )}
        </div>
      </div>

      {hasFlightActuals && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Benchmark Gauges</h3>
          </div>
          <div className="card-body">
            <div className="row g-4">
              {Object.entries(flightActuals).map(([platform, actuals]) => {
                const metrics = derivedMetrics(actuals);
                if (metrics.length === 0) return null;
                return (
                  <div className="col-md-6" key={platform}>
                    <div className="fw-bold mb-2">{platformLabel(platform)}</div>
                    <div className="d-flex flex-column gap-3">
                      {metrics.map((m) => {
                        const rollup = rollups.find((r) => r.platform === platform && r.metric === m.metric);
                        if (!rollup) return null;
                        const max = Math.max(rollup.p75 * 1.2, m.value * 1.1);
                        return (
                          <BenchmarkGauge
                            key={m.metric}
                            label={`${platformLabel(platform)} — ${m.label}`}
                            value={Number(m.value.toFixed(4))}
                            min={0}
                            max={Number(max.toFixed(4))}
                            p25={rollup.p25}
                            p50={rollup.p50}
                            p75={rollup.p75}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
