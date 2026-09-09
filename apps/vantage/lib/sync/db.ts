import { db } from "@/lib/db";
import type { SyncDbClient } from "./index";

/** Real Prisma-backed implementation of the sync layer's minimal persistence interface. */
export const prismaSyncDbClient: SyncDbClient = {
  async findOpportunityBySamId(_workspaceId, samOpportunityId) {
    // samOpportunityId is globally unique (SAM.gov's own id), so workspaceId
    // isn't needed to disambiguate the lookup.
    const existing = await db.opportunity.findUnique({
      where: { samOpportunityId },
      select: { samOpportunityId: true, proposalDueDate: true, finalRfpDate: true },
    });
    return existing;
  },

  async upsertOpportunity(data) {
    await db.opportunity.upsert({
      where: { samOpportunityId: data.samOpportunityId },
      create: data,
      update: {
        title: data.title,
        agency: data.agency,
        subAgency: data.subAgency,
        naicsCode: data.naicsCode,
        solicitationType: data.solicitationType,
        proposalDueDate: data.proposalDueDate,
        samUrl: data.samUrl,
        notes: data.notes,
      },
    });
  },

  async upsertCompetitorActivity(data) {
    await db.competitorActivity.upsert({
      where: { workspaceId_awardId: { workspaceId: data.workspaceId, awardId: data.awardId } },
      create: data,
      update: data,
    });
  },
};
