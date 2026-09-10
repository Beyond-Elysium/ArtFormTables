// Turns a scenario's inputs (sector/objective/budget/platform constraints)
// plus the relevant BenchmarkRollup rows into the computed fields Scenario
// persists: platform_scores, budget_allocations, influence_score, and
// influence_breakdown. Pure function over plain inputs so it's testable
// without a DB — app/api/scenarios/route.ts does the fetching/writing.

import type { BenchmarkMetric, CampaignObjective, GovconSector } from "@prisma/client";
import {
  calculatePlatformScore,
  allocateBudget,
  calculateInfluenceScore,
  type BudgetAllocationCandidate,
} from "@/lib/scoring";
import {
  DEFAULT_AUDIENCE_FIT,
  DEFAULT_OBJECTIVE_FIT,
  PLATFORM_AUDIENCE_FIT_DEFAULT,
  PLATFORM_OBJECTIVE_FIT,
} from "@/lib/platforms";

export interface ScenarioRollupRow {
  platform: string;
  metric: BenchmarkMetric;
  p25: number;
  p50: number;
  p75: number;
  updatedAt: Date;
}

export interface ScenarioComputeInput {
  objective: CampaignObjective;
  sector: GovconSector;
  budget: number;
  excludedPlatforms: string[];
  requiredPlatforms: string[];
  /** All BenchmarkRollup rows for this scenario's sector/objective, any platform/metric. */
  rollups: ScenarioRollupRow[];
}

export interface ScenarioComputeResult {
  platformScores: Record<string, number>;
  budgetAllocations: Record<string, number>;
  influenceScore: number;
  influenceBreakdown: Record<string, number>;
}

/** Which cost metric the objective prices on — lead-shaped objectives price per lead, awareness-shaped ones price per impression. */
export function costMetricForObjective(objective: CampaignObjective): "cpl" | "cpm" {
  return objective === "lead_generation" || objective === "recruitment" ? "cpl" : "cpm";
}

export function computeScenarioScores(input: ScenarioComputeInput): ScenarioComputeResult {
  const metric = costMetricForObjective(input.objective);

  // Latest rollup per platform for the priced metric — multiple periods can
  // exist per platform/metric, so keep only the most recently updated one.
  const latestByPlatform = new Map<string, { p25: number; p50: number; p75: number; updatedAt: Date }>();
  for (const r of input.rollups) {
    if (r.metric !== metric) continue;
    const existing = latestByPlatform.get(r.platform);
    if (!existing || r.updatedAt > existing.updatedAt) {
      latestByPlatform.set(r.platform, { p25: r.p25, p50: r.p50, p75: r.p75, updatedAt: r.updatedAt });
    }
  }

  const excluded = new Set(input.excludedPlatforms);
  const candidatePlatforms = new Set<string>();
  for (const r of input.rollups) {
    if (!excluded.has(r.platform)) candidatePlatforms.add(r.platform);
  }
  for (const p of input.requiredPlatforms) candidatePlatforms.add(p);
  for (const p of excluded) candidatePlatforms.delete(p);

  const platforms = Array.from(candidatePlatforms);

  // Rank platforms against each other by the priced metric's p50 (cpl/cpm —
  // lower is better) to get each one's benchmark-position score: 100 for the
  // cheapest, 0 for the priciest, evenly spread between. This is the one
  // factor platform-score.ts expects pre-ranked by the caller, since it
  // needs every candidate's benchmark row, not just this platform's own.
  const ranked = platforms
    .filter((p) => latestByPlatform.has(p))
    .sort((a, b) => latestByPlatform.get(a)!.p50 - latestByPlatform.get(b)!.p50);
  const positionScore = new Map<string, number>();
  ranked.forEach((platform, index) => {
    positionScore.set(platform, ranked.length > 1 ? 100 - (index / (ranked.length - 1)) * 100 : 100);
  });

  const platformScores: Record<string, number> = {};
  const scoredCandidates: BudgetAllocationCandidate[] = [];

  for (const platform of platforms) {
    const bench = latestByPlatform.get(platform);
    const costBenchmark = bench ?? { p25: 0, p50: 0, p75: 0 };
    // No per-platform planned spend is collected by the wizard yet, so
    // "expected cost" defaults to the metric's own p50 — a neutral baseline
    // (cost-efficiency score starts around 50) rather than an arbitrary
    // number. TODO: replace once the wizard (or a later step) collects a
    // real planned CPL/CPM assumption per platform.
    const expectedCost = bench ? bench.p50 : 0;
    const benchmarkPositionScore = positionScore.get(platform) ?? 50;

    const audienceFitScore = PLATFORM_AUDIENCE_FIT_DEFAULT[platform] ?? DEFAULT_AUDIENCE_FIT;
    const objectiveAlignmentScore = PLATFORM_OBJECTIVE_FIT[platform]?.[input.objective] ?? DEFAULT_OBJECTIVE_FIT;

    const { score } = calculatePlatformScore({
      audienceFitScore,
      benchmarkPositionScore,
      expectedCost,
      costBenchmark,
      objectiveAlignmentScore,
    });

    platformScores[platform] = score;
    scoredCandidates.push({ platform, score, required: input.requiredPlatforms.includes(platform) });
  }

  const allocations = allocateBudget(input.budget, scoredCandidates);
  const budgetAllocations: Record<string, number> = {};
  for (const a of allocations) budgetAllocations[a.platform] = a.amount;

  const scoreValues = Object.values(platformScores);
  const avgPlatformScore =
    scoreValues.length > 0 ? scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length : DEFAULT_AUDIENCE_FIT;

  // influence-score.ts expects four pre-scored 0-100 signals (engagement
  // rate, posting/flight frequency, reach, content-type affinity) that
  // nothing in the app collects yet — no engagement history, cadence, reach
  // modeling, or content-type performance data exists at scenario-creation
  // time. TODO: replace with real per-scenario signals once that data
  // exists (e.g. derived from CampaignData once a scenario has actuals).
  // Until then, reach is proxied from the platform scores just computed
  // (they already fold in audience fit + benchmark standing, a reasonable
  // stand-in for expected reach quality) and the rest use a flat neutral
  // default.
  const { score: influenceScore, breakdown: influenceBreakdown } = calculateInfluenceScore({
    engagementRate: 60,
    frequency: 60,
    reach: avgPlatformScore,
    contentTypeAffinity: 60,
  });

  return { platformScores, budgetAllocations, influenceScore, influenceBreakdown: { ...influenceBreakdown } };
}
