import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { ScoreRing } from "@artform/suite-ui";
import { PageHeader } from "@/components/PageHeader";
import { db } from "@/lib/db";
import { objectiveLabels, sectorLabels } from "@/lib/enums";
import { platformLabel } from "@/lib/platforms";
import { asScoreRecord } from "@/lib/scenario-json";
import type { Scenario } from "@prisma/client";

export const dynamic = "force-dynamic";

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/** Simple side-by-side comparison of 2+ scenarios, selected from /scenarios via checkboxes. */
export default async function CompareScenariosPage({ searchParams }: { searchParams: { ids?: string } }) {
  const { userId } = await auth();
  const ids = (searchParams.ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const found =
    userId && ids.length > 0 ? await db.scenario.findMany({ where: { id: { in: ids }, userId } }) : [];
  const byId = new Map(found.map((s) => [s.id, s]));
  const ordered = ids.map((id) => byId.get(id)).filter((s): s is Scenario => Boolean(s));

  const allPlatforms = Array.from(
    new Set(ordered.flatMap((s) => Object.keys(asScoreRecord(s.platformScores)))),
  );

  return (
    <>
      <PageHeader
        title="Compare Scenarios"
        action={
          <Link href="/arvo/scenarios" className="btn btn-outline-secondary">
            Back to Scenarios
          </Link>
        }
      />

      {ordered.length < 2 ? (
        <div className="card">
          <div className="card-body">
            <p className="text-secondary mb-0">
              Select at least two scenarios from the Saved Scenarios list to compare them here.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="card mb-3">
            <div className="table-responsive">
              <table className="table table-vcenter card-table mb-0">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {ordered.map((s) => (
                      <th key={s.id}>
                        <Link href={`/arvo/scenarios/${s.id}`}>{s.name}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-secondary">Objective</td>
                    {ordered.map((s) => (
                      <td key={s.id}>{objectiveLabels[s.objective]}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-secondary">Sector</td>
                    {ordered.map((s) => (
                      <td key={s.id}>{sectorLabels[s.sector]}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-secondary">Budget</td>
                    {ordered.map((s) => (
                      <td key={s.id}>{currency(s.budget.toNumber())}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-secondary">Flight Window</td>
                    {ordered.map((s) => (
                      <td key={s.id}>
                        {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(s.flightStart)} –{" "}
                        {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(s.flightEnd)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-secondary">Influence Score</td>
                    {ordered.map((s) => (
                      <td key={s.id}>
                        <ScoreRing value={s.influenceScore} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-secondary">Status</td>
                    {ordered.map((s) => (
                      <td key={s.id} className="text-capitalize">
                        {s.status}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {allPlatforms.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Platform Scores</h3>
              </div>
              <div className="table-responsive">
                <table className="table table-vcenter card-table mb-0">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      {ordered.map((s) => (
                        <th key={s.id}>{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allPlatforms.map((platform) => (
                      <tr key={platform}>
                        <td>{platformLabel(platform)}</td>
                        {ordered.map((s) => {
                          const score = asScoreRecord(s.platformScores)[platform];
                          return <td key={s.id}>{score != null ? Math.round(score) : "—"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
