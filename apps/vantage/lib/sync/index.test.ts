import { afterEach, describe, expect, it, vi } from "vitest";
import type { SamOpportunity } from "./sam-gov";
import type { AwardRecord } from "./usaspending";
import type { ExistingOpportunity, OpportunityCreateInput, CompetitorActivityCreateInput } from "./types";

const fetchSamOpportunitiesMock = vi.fn<[], Promise<SamOpportunity[]>>();
const fetchRecentAwardsMock = vi.fn<[], Promise<AwardRecord[]>>();

vi.mock("./sam-gov", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sam-gov")>();
  return { ...actual, fetchSamOpportunities: (...args: unknown[]) => fetchSamOpportunitiesMock(...(args as [])) };
});

vi.mock("./usaspending", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./usaspending")>();
  return { ...actual, fetchRecentAwards: (...args: unknown[]) => fetchRecentAwardsMock(...(args as [])) };
});

const { runDailySync } = await import("./index");

function makeInMemoryDb(seed: Map<string, ExistingOpportunity> = new Map()) {
  const upserted: OpportunityCreateInput[] = [];
  const competitorActivities: CompetitorActivityCreateInput[] = [];
  return {
    async findOpportunityBySamId(_workspaceId: string, samOpportunityId: string) {
      return seed.get(samOpportunityId) ?? null;
    },
    async upsertOpportunity(data: OpportunityCreateInput) {
      upserted.push(data);
    },
    async createCompetitorActivity(data: CompetitorActivityCreateInput) {
      competitorActivities.push(data);
    },
    upserted,
    competitorActivities,
  };
}

const baseOpportunity: SamOpportunity = {
  noticeId: "n1",
  title: "Sample Opportunity",
  fullParentPathName: "DEPT OF DEFENSE",
  naicsCode: "541511",
  type: "Solicitation",
  responseDeadLine: "2026-09-30T17:00:00-04:00",
  uiLink: "https://sam.gov/opp/n1/view",
};

const baseAward: AwardRecord = {
  "Award ID": "AW-1",
  "Recipient Name": "Competitor Inc",
  "Award Amount": 100000,
  "Start Date": "2026-08-01",
  "Awarding Agency": "Department of Defense",
  "NAICS Code": "541511",
  Description: "Some contract",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("runDailySync", () => {
  it("counts a never-seen samOpportunityId as new", async () => {
    fetchSamOpportunitiesMock.mockResolvedValue([baseOpportunity]);
    fetchRecentAwardsMock.mockResolvedValue([]);
    const db = makeInMemoryDb();

    const summary = await runDailySync(
      [{ workspaceId: "ws_1", naicsCodes: ["541511"], trackedAgencies: [] }],
      { db, samApiKey: "test-key", now: new Date("2026-09-09") },
    );

    expect(summary.newOpportunities).toBe(1);
    expect(summary.amendments).toBe(0);
    expect(db.upserted).toHaveLength(1);
  });

  it("counts a proposalDueDate change on an existing samOpportunityId as an amendment", async () => {
    fetchSamOpportunitiesMock.mockResolvedValue([baseOpportunity]);
    fetchRecentAwardsMock.mockResolvedValue([]);
    const seed = new Map<string, ExistingOpportunity>([
      ["n1", { samOpportunityId: "n1", proposalDueDate: new Date("2026-09-01T00:00:00-04:00") }],
    ]);
    const db = makeInMemoryDb(seed);

    const summary = await runDailySync(
      [{ workspaceId: "ws_1", naicsCodes: ["541511"], trackedAgencies: [] }],
      { db, samApiKey: "test-key", now: new Date("2026-09-09") },
    );

    expect(summary.amendments).toBe(1);
    expect(summary.newOpportunities).toBe(0);
  });

  it("does not flag an amendment when the due date is unchanged", async () => {
    fetchSamOpportunitiesMock.mockResolvedValue([baseOpportunity]);
    fetchRecentAwardsMock.mockResolvedValue([]);
    const seed = new Map<string, ExistingOpportunity>([
      ["n1", { samOpportunityId: "n1", proposalDueDate: new Date("2026-09-30T17:00:00-04:00") }],
    ]);
    const db = makeInMemoryDb(seed);

    const summary = await runDailySync(
      [{ workspaceId: "ws_1", naicsCodes: ["541511"], trackedAgencies: [] }],
      { db, samApiKey: "test-key", now: new Date("2026-09-09") },
    );

    expect(summary.amendments).toBe(0);
    expect(summary.newOpportunities).toBe(0);
  });

  it("records competitor awards for each tracked agency", async () => {
    fetchSamOpportunitiesMock.mockResolvedValue([]);
    fetchRecentAwardsMock.mockResolvedValue([baseAward]);
    const db = makeInMemoryDb();

    const summary = await runDailySync(
      [{ workspaceId: "ws_1", naicsCodes: ["541511"], trackedAgencies: ["Department of Defense"] }],
      { db, samApiKey: "test-key", now: new Date("2026-09-09") },
    );

    expect(summary.competitorAwards).toBe(1);
    expect(db.competitorActivities).toHaveLength(1);
    expect(db.competitorActivities[0].awardId).toBe("AW-1");
  });

  it("runs in dry-run mode (no db) without throwing, logging a TODO(db) stub", async () => {
    fetchSamOpportunitiesMock.mockResolvedValue([baseOpportunity]);
    fetchRecentAwardsMock.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const summary = await runDailySync(
      [{ workspaceId: "ws_1", naicsCodes: ["541511"], trackedAgencies: [] }],
      { samApiKey: "test-key", now: new Date("2026-09-09") },
    );

    expect(summary.newOpportunities).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("TODO(db)"), "n1");
    logSpy.mockRestore();
  });

  it("throws when no SAM.gov API key is configured", async () => {
    const originalKey = process.env.SAM_GOV_API_KEY;
    delete process.env.SAM_GOV_API_KEY;

    await expect(runDailySync([{ workspaceId: "ws_1", naicsCodes: [], trackedAgencies: [] }])).rejects.toThrow(
      /SAM_GOV_API_KEY/,
    );

    if (originalKey) process.env.SAM_GOV_API_KEY = originalKey;
  });
});
