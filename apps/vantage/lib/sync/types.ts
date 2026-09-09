/**
 * Local mirrors of the Prisma create-input shapes this sync layer writes to,
 * kept independent of the generated `@prisma/client` so `sam-gov.ts` /
 * `usaspending.ts` / their tests can run without a generated client — the
 * real Prisma-backed `SyncDbClient` (see db.ts) accepts these directly since
 * field names and types are kept identical to prisma/schema.prisma.
 */

/** Mirrors the `SolicitationType` enum in prisma/schema.prisma exactly. */
export type SolicitationType =
  | "pre_solicitation"
  | "sources_sought"
  | "solicitation"
  | "award_notice"
  | "combined_synopsis_solicitation"
  | "special_notice"
  | "other";

export interface OpportunityCreateInput {
  workspaceId: string;
  samOpportunityId: string;
  title: string;
  agency: string;
  subAgency: string | null;
  naicsCode: string | null;
  solicitationType: SolicitationType;
  proposalDueDate: Date | null;
  samUrl: string;
  /** SAM.gov's free-text notice description — there's no dedicated schema
   *  field for it, so it's folded into the general-purpose `notes` column. */
  notes: string | null;
}

/** The subset of an existing Opportunity row the sync diff needs to read back. */
export interface ExistingOpportunity {
  samOpportunityId: string;
  proposalDueDate: Date | null;
  /** Not populated by the SAM.gov feed directly, but tracked downstream (e.g. manual RFP intake). */
  finalRfpDate?: Date | null;
}

export interface CompetitorActivityCreateInput {
  workspaceId: string;
  /** USASpending's own award id — paired with workspaceId as the upsert key. */
  awardId: string;
  competitorName: string;
  awardAmount: number | null;
  awardDate: Date | null;
  agency: string;
  naicsCode: string | null;
  contractDescription: string | null;
}
