import { auth } from "@clerk/nextjs/server";
import { ScoreRing, BenchmarkGauge } from "@artform/suite-ui";
import { db } from "@/lib/db";
import { objectiveLabels, sectorLabels } from "@/lib/enums";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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

/** Coerces a jsonb column shaped as `{ [key]: number }` into a plain record. */
function asScoreRecord(value: Prisma.JsonValue | null | undefined): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

type FlightActualsRow = { impressions?: number; clicks?: number; conversions?: number; spend?: number };

/** flight_actuals is freeform jsonb; assume the same per-platform shape CampaignData uses. */
function asFlightActuals(value: Prisma.JsonValue | null | undefined): Record<string, FlightActualsRow> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, FlightActualsRow> = {};
  for (const [platform, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    out[platform] = {
      impressions: typeof r.impressions === "number" ? r.impressions : undefined,
      clicks: typeof r.clicks === "number" ? r.clicks : undefined,
      conversions: typeof r.conversions === "number" ? r.conversions : undefined,
      spend: typeof r.spend === "number" ? r.spend : undefined,
    };
  }
  return out;
}

type DerivedMetric = { metric: "ctr" | "cpl" | "cpm" | "conversion_rate"; label: string; value: number };

function derivedMetrics(row: FlightActualsRow): DerivedMetric[] {
  const out: DerivedMetric[] = [];
  if (row.clicks != null && row.impressions) out.push({ metric: "ctr", label: "CTR", value: row.clicks / row.impressions });
  if (row.spend != null && row.conversions) out.push({ metric: "cpl", label: "CPL", value: row.spend / row.conversions });
  if (row.spend != null && row.impressions)
    out.push({ metric: "cpm", label: "CPM", value: (row.spend / row.impressions) * 1000 });
  if (row.conversions != null && row.clicks)
    out.push({ metric: "conversion_rate", label: "Conversion Rate", value: row.conversions / row.clicks });
  return out;
}

function NotFound() {
  return (
    <div className="container-xl py-6 text-center">
      <h1 className="h2">404 — Scenario not found</h1>
      <p className="text-secondary mb-0">
        This scenario doesn&apos;t exist, or isn&apos;t available to the requesting account.
      </p>
    </div>
  );
}

export default async function ScenarioPrintPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  const scenario = userId ? await db.scenario.findUnique({ where: { id: params.id } }) : null;

  if (!scenario || scenario.userId !== userId) return <NotFound />;

  const budget = scenario.budget.toNumber();
  const platformScores = asScoreRecord(scenario.platformScores);
  const budgetAllocations = asScoreRecord(scenario.budgetAllocations);
  const influenceBreakdown = asScoreRecord(scenario.influenceBreakdown);
  const flightActuals = asFlightActuals(scenario.flightActuals);
  const hasFlightActuals = Object.keys(flightActuals).length > 0;
  const hasInfluenceScore = typeof scenario.influenceScore === "number" && Number.isFinite(scenario.influenceScore);

  const rollups = hasFlightActuals
    ? await db.benchmarkRollup.findMany({
        where: {
          sector: scenario.sector,
          objective: scenario.objective,
          platform: { in: Object.keys(flightActuals) },
        },
      })
    : [];

  return (
    <div className="container-xl py-4">
      <header className="d-flex align-items-start justify-content-between mb-4 pb-3 border-bottom">
        <div>
          <div className="text-secondary text-uppercase small fw-bold">ArtForm Arvo</div>
          <h1 className="h1 mb-0">{scenario.name}</h1>
        </div>
        <div className="text-secondary small text-end">Generated {dateLabel(new Date())}</div>
      </header>

      <section className="mb-4">
        <h2 className="h4">Scenario Summary</h2>
        <div className="row g-3">
          <div className="col-3">
            <div className="text-secondary small">Objective</div>
            <div className="fw-bold">{objectiveLabels[scenario.objective]}</div>
          </div>
          <div className="col-3">
            <div className="text-secondary small">Sector</div>
            <div className="fw-bold">{sectorLabels[scenario.sector]}</div>
          </div>
          <div className="col-3">
            <div className="text-secondary small">Budget</div>
            <div className="fw-bold">{currency(budget)}</div>
          </div>
          <div className="col-3">
            <div className="text-secondary small">Flight Window</div>
            <div className="fw-bold">
              {dateLabel(scenario.flightStart)} – {dateLabel(scenario.flightEnd)}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <h2 className="h4">Influence Score</h2>
        {hasInfluenceScore ? (
          <div className="d-flex align-items-center gap-4 flex-wrap">
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
        ) : (
          <p className="text-secondary mb-0">Not yet scored.</p>
        )}
      </section>

      <section className="mb-4">
        <h2 className="h4">Platform Scores</h2>
        {Object.keys(platformScores).length > 0 ? (
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(platformScores).map(([platform, score]) => (
                <tr key={platform}>
                  <td>{platform}</td>
                  <td>{Math.round(score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-secondary mb-0">No platform scores yet.</p>
        )}
      </section>

      <section className="mb-4">
        <h2 className="h4">Budget Allocation</h2>
        {Object.keys(budgetAllocations).length > 0 ? (
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Allocated Budget</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(budgetAllocations).map(([platform, amount]) => (
                <tr key={platform}>
                  <td>{platform}</td>
                  <td>{currency(amount)}</td>
                  <td>{budget > 0 ? `${Math.round((amount / budget) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-secondary mb-0">No budget allocation yet.</p>
        )}
      </section>

      {hasFlightActuals && (
        <section className="mb-4">
          <h2 className="h4">Benchmark Gauges</h2>
          <div className="row g-4">
            {Object.entries(flightActuals).map(([platform, actuals]) => {
              const metrics = derivedMetrics(actuals);
              if (metrics.length === 0) return null;
              return (
                <div className="col-6" key={platform}>
                  <div className="fw-bold mb-2">{platform}</div>
                  <div className="d-flex flex-column gap-3">
                    {metrics.map((m) => {
                      const rollup = rollups.find((r) => r.platform === platform && r.metric === m.metric);
                      if (!rollup) return null;
                      const max = Math.max(rollup.p75 * 1.2, m.value * 1.1);
                      return (
                        <BenchmarkGauge
                          key={m.metric}
                          label={`${platform} — ${m.label}`}
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
        </section>
      )}

      <section>
        <h2 className="h4">Strategic Insights</h2>
        <p className="text-secondary mb-0">Insight generation is not yet wired up for this scenario.</p>
      </section>
    </div>
  );
}
