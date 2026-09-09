import { fetchSamOpportunities, mapSamOpportunityToRow } from "./sam-gov";
import { fetchRecentAwards, mapAwardToCompetitorActivity } from "./usaspending";
import type {
  CompetitorActivityCreateInput,
  ExistingOpportunity,
  OpportunityCreateInput,
} from "./types";

export interface WorkspaceSyncConfig {
  workspaceId: string;
  naicsCodes: string[];
  trackedAgencies: string[];
}

/**
 * Minimal persistence surface the sync needs. Accepting this as a parameter
 * (rather than importing a concrete Prisma client) lets the orchestrator run
 * — and be unit tested — before apps/vantage/prisma/schema.prisma and its
 * generated client exist in this worktree.
 *
 * TODO(db): once the Prisma client is available, implement this interface
 * with real `db.opportunity.upsert(...)` / `db.competitorActivity.create(...)`
 * calls and wire it in from the cron route.
 */
export interface SyncDbClient {
  findOpportunityBySamId(
    workspaceId: string,
    samOpportunityId: string,
  ): Promise<ExistingOpportunity | null>;
  upsertOpportunity(data: OpportunityCreateInput): Promise<void>;
  /** Upserts on (workspaceId, awardId) so an overlapping poll window never duplicates a row. */
  upsertCompetitorActivity(data: CompetitorActivityCreateInput): Promise<void>;
}

export interface RunDailySyncOptions {
  /** Omit to run in a dry-run/log-only mode — see the TODO(db) stub below. */
  db?: SyncDbClient;
  /** Defaults to process.env.SAM_GOV_API_KEY. */
  samApiKey?: string;
  /** Defaults to "yesterday through now" — override in tests for determinism. */
  now?: Date;
  /** How many days back to poll SAM.gov / USASpending each run. Defaults to 1 (daily cron). */
  lookbackDays?: number;
}

export interface DailySyncSummary {
  newOpportunities: number;
  amendments: number;
  competitorAwards: number;
}

function daysAgo(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

/** An amendment is an existing samOpportunityId whose key dates moved. */
function isAmendment(existing: ExistingOpportunity, next: OpportunityCreateInput): boolean {
  const dueDateChanged =
    (existing.proposalDueDate?.getTime() ?? null) !== (next.proposalDueDate?.getTime() ?? null);
  // finalRfpDate isn't part of the SAM.gov feed itself, but if a downstream
  // process has set it, a due-date move on the notice still counts as an
  // amendment worth alerting on.
  return dueDateChanged;
}

async function syncWorkspaceOpportunities(
  config: WorkspaceSyncConfig,
  samApiKey: string,
  postedFrom: Date,
  postedTo: Date,
  db: SyncDbClient | undefined,
): Promise<{ newOpportunities: number; amendments: number }> {
  if (config.naicsCodes.length === 0) return { newOpportunities: 0, amendments: 0 };

  const rawOpportunities = await fetchSamOpportunities({
    apiKey: samApiKey,
    naicsCodes: config.naicsCodes,
    postedFrom,
    postedTo,
  });

  let newOpportunities = 0;
  let amendments = 0;

  for (const raw of rawOpportunities) {
    const row = mapSamOpportunityToRow(raw, config.workspaceId);

    if (!db) {
      // TODO(db): Prisma client not wired in yet — log instead of writing.
      console.log("[vantage sync] TODO(db): would upsert opportunity", row.samOpportunityId);
      newOpportunities += 1;
      continue;
    }

    const existing = await db.findOpportunityBySamId(config.workspaceId, row.samOpportunityId);
    if (existing && isAmendment(existing, row)) {
      amendments += 1;
    } else if (!existing) {
      newOpportunities += 1;
    }

    await db.upsertOpportunity(row);
  }

  return { newOpportunities, amendments };
}

async function syncWorkspaceCompetitorAwards(
  config: WorkspaceSyncConfig,
  awardedFrom: Date,
  awardedTo: Date,
  db: SyncDbClient | undefined,
): Promise<number> {
  let competitorAwards = 0;

  for (const agency of config.trackedAgencies) {
    const naicsCodes = config.naicsCodes.length > 0 ? config.naicsCodes : [undefined];

    for (const naicsCode of naicsCodes) {
      const awards = await fetchRecentAwards({
        agency,
        naicsCode,
        awardedFrom,
        awardedTo,
      });

      for (const raw of awards) {
        const row = mapAwardToCompetitorActivity(raw, config.workspaceId);
        if (!db) {
          // TODO(db): Prisma client not wired in yet — log instead of writing.
          console.log("[vantage sync] TODO(db): would upsert competitor activity", row.awardId);
        } else {
          await db.upsertCompetitorActivity(row);
        }
        competitorAwards += 1;
      }
    }
  }

  return competitorAwards;
}

/**
 * Runs the daily SAM.gov + USASpending sync for every workspace, upserting
 * opportunities and recording competitor awards, and returns counts the
 * caller (the cron route) turns into Alert rows.
 */
export async function runDailySync(
  workspaceConfigs: WorkspaceSyncConfig[],
  options: RunDailySyncOptions = {},
): Promise<DailySyncSummary> {
  const samApiKey = options.samApiKey ?? process.env.SAM_GOV_API_KEY;
  if (!samApiKey) {
    throw new Error("SAM_GOV_API_KEY is not configured — cannot sync SAM.gov opportunities.");
  }

  const now = options.now ?? new Date();
  const lookbackDays = options.lookbackDays ?? 1;
  const windowStart = daysAgo(now, lookbackDays);

  const summary: DailySyncSummary = { newOpportunities: 0, amendments: 0, competitorAwards: 0 };

  for (const config of workspaceConfigs) {
    const opportunityResult = await syncWorkspaceOpportunities(
      config,
      samApiKey,
      windowStart,
      now,
      options.db,
    );
    summary.newOpportunities += opportunityResult.newOpportunities;
    summary.amendments += opportunityResult.amendments;

    summary.competitorAwards += await syncWorkspaceCompetitorAwards(
      config,
      windowStart,
      now,
      options.db,
    );
  }

  return summary;
}
