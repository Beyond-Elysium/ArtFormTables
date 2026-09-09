/**
 * Local, hand-written mirrors of the Prisma models this sync layer writes to.
 *
 * TODO(schema): align field names once apps/vantage/prisma/schema.prisma lands
 * (it's being authored concurrently in a sibling worktree). Once it exists,
 * replace these with `Prisma.OpportunityCreateInput` / a real
 * `CompetitorActivity` create-input type imported from "@prisma/client", and
 * delete this file. Field names below were chosen to match the spec's
 * described schema shape as closely as possible so the swap is mechanical.
 */

/** SAM.gov's `type` field values, normalized into our internal enum-ish string union. */
export type SolicitationType =
  | "SOLICITATION"
  | "SOURCES_SOUGHT"
  | "PRESOLICITATION"
  | "AWARD_NOTICE"
  | "COMBINED_SYNOPSIS_SOLICITATION"
  | "SPECIAL_NOTICE"
  | "OTHER";

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
  description: string | null;
  postedDate: Date | null;
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
  awardId: string;
  recipientName: string;
  awardAmount: number | null;
  startDate: Date | null;
  awardingAgency: string;
  naicsCode: string | null;
  description: string | null;
}
