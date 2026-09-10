/**
 * Self-populate Arvo with realistic, clearly-fictional demo content: the
 * bundled sample benchmark CSV, a handful of scored Scenarios (real scoring
 * engine output, not hand-rolled numbers), a couple of them with flight
 * actuals so the Benchmark Gauges have something to render, and a spread of
 * CampaignData rows so /campaign-data isn't empty either.
 *
 * Usage:
 *   DEMO_USER_ID=<clerk_user_id> pnpm --filter @artform/arvo db:seed:demo
 *
 * DEMO_USER_ID must be the Clerk user id of whoever will log into the
 * running app to view this data (Scenario/CampaignData.userId has no FK to
 * a users table — see prisma/schema.prisma — so this script can't look it
 * up itself). Find it in the Clerk dashboard's Users list after signing up
 * once, or log `(await auth()).userId` from any server component.
 *
 * Idempotent: every demo row gets a deterministic id derived from a fixed
 * slug (see `demoUuid`), so re-running this script upserts the same rows
 * instead of duplicating them — safe to run again after editing the demo
 * data below, or against a different DEMO_USER_ID to reassign it.
 */

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient, GovconSector, CampaignObjective, ScenarioStatus } from "@prisma/client";
import { seedFromCsv } from "./seed-benchmarks";
import { computeScenarioScores } from "@/lib/scenario-engine";
import { computeDerivedMetrics } from "@/lib/import/campaign-data-row";

const prisma = new PrismaClient();

const SAMPLE_BENCHMARKS_CSV = resolve(__dirname, "../prisma/seed-data/sample-benchmarks.csv");

/** Deterministic, valid-format UUID from a fixed seed string — same seed always yields the same id, which is what makes upserting demo rows idempotent. */
function demoUuid(seed: string): string {
  const hash = createHash("sha256").update(`arvo-demo-seed:${seed}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

type FlightActualsInput = Record<string, { impressions: number; clicks: number; conversions: number; spend: number }>;

interface DemoScenarioInput {
  slug: string;
  name: string;
  sector: GovconSector;
  objective: CampaignObjective;
  personas: string[];
  budget: number;
  flightStart: string;
  flightEnd: string;
  excludedPlatforms: string[];
  requiredPlatforms: string[];
  status: ScenarioStatus;
  /** Platform -> actual delivery. Only scenarios whose flight has already run get these. */
  flightActuals: FlightActualsInput;
}

// Sector/objective/platform strings below intentionally match
// prisma/seed-data/sample-benchmarks.csv so every scenario scores against
// real BenchmarkRollup rows instead of falling back to neutral defaults.
// Flight-actuals numbers were picked (see the benchmark CSV's p25/p50/p75
// for the same platform/sector/objective) to land a deliberate mix of
// above/below-p50 outcomes, not a uniformly rosy demo.
const DEMO_SCENARIOS: DemoScenarioInput[] = [
  {
    slug: "dod-cyber-awareness",
    name: "DoD Cybersecurity Awareness Push",
    sector: "dod",
    objective: "awareness",
    personas: ["Program Manager", "Contracting Officer", "CISO"],
    budget: 45000,
    flightStart: "2026-10-01",
    flightEnd: "2026-12-15",
    excludedPlatforms: ["meta-ads"],
    requiredPlatforms: [],
    status: "active",
    flightActuals: {}, // upcoming flight — nothing to report yet
  },
  {
    slug: "dod-it-modernization-leadgen",
    name: "DoD IT Modernization Lead Gen",
    sector: "dod",
    objective: "lead_generation",
    personas: ["IT Director", "Program Manager"],
    budget: 60000,
    flightStart: "2026-05-01",
    flightEnd: "2026-07-31",
    excludedPlatforms: ["meta-ads"],
    requiredPlatforms: ["linkedin-ads"],
    status: "active",
    flightActuals: {
      // Underperforming: pricier and less clicked-through than modeled.
      "linkedin-ads": { impressions: 60000, clicks: 180, conversions: 28, spend: 13500 },
      // Overperforming: cheaper and better-targeted than modeled.
      "google-search-ads": { impressions: 40000, clicks: 1100, conversions: 9, spend: 900 },
    },
  },
  {
    slug: "civilian-cloud-consideration",
    name: "Civilian Agency Cloud Modernization",
    sector: "civilian",
    objective: "consideration",
    personas: ["CIO", "IT Director", "Innovation Lead"],
    budget: 35000,
    flightStart: "2026-06-01",
    flightEnd: "2026-08-15",
    excludedPlatforms: [],
    requiredPlatforms: [],
    status: "active",
    flightActuals: {
      // Strong performer across the board.
      "linkedin-ads": { impressions: 80000, clicks: 500, conversions: 40, spend: 3200 },
      // Weak performer — expensive with a poor click-to-lead rate.
      "meta-ads": { impressions: 50000, clicks: 300, conversions: 6, spend: 2600 },
    },
  },
  {
    slug: "sled-public-safety-recruitment",
    name: "SLED Public Safety Recruitment Drive",
    sector: "sled",
    objective: "recruitment",
    personas: ["HR Director", "Public Safety Recruiter"],
    budget: 25000,
    flightStart: "2026-09-01",
    flightEnd: "2026-11-30",
    excludedPlatforms: [],
    requiredPlatforms: ["programmatic-display"],
    status: "active",
    flightActuals: {
      // In-flight, tracking close to plan (mixed yellow bands).
      "programmatic-display": { impressions: 250000, clicks: 620, conversions: 7, spend: 1700 },
      // In-flight, running pricier than modeled.
      "linkedin-ads": { impressions: 45000, clicks: 220, conversions: 16, spend: 3900 },
    },
  },
  {
    slug: "ic-legacy-outreach",
    name: "Legacy IC Outreach",
    sector: "ic",
    objective: "awareness",
    personas: ["Mission Owner", "Program Manager"],
    budget: 30000,
    flightStart: "2026-01-15",
    flightEnd: "2026-03-31",
    excludedPlatforms: ["meta-ads", "google-display-ads"],
    requiredPlatforms: [],
    status: "archived", // demonstrates the archive/filter functionality
    flightActuals: {},
  },
];

interface DemoCampaignDataInput {
  slug: string;
  platform: string;
  campaignName: string;
  startDate: string;
  endDate: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  sector: string;
  objective: string;
}

// campaign-data/page.tsx renders `platform` as-is (no label lookup), so
// these use display-friendly names rather than the hyphenated platform ids
// scenarios/benchmarks use.
const DEMO_CAMPAIGN_DATA: DemoCampaignDataInput[] = [
  { slug: "cd-01", platform: "LinkedIn Ads", campaignName: "DoD IT Modernization Q1", startDate: "2026-01-05", endDate: "2026-02-28", impressions: 85000, clicks: 340, conversions: 22, spend: 6200, sector: "dod", objective: "lead_generation" },
  { slug: "cd-02", platform: "Google Search Ads", campaignName: "DoD Cyber RFP Search", startDate: "2026-01-10", endDate: "2026-02-15", impressions: 60000, clicks: 1500, conversions: 45, spend: 5400, sector: "dod", objective: "lead_generation" },
  { slug: "cd-03", platform: "Meta Ads", campaignName: "DoD Awareness Brand Lift", startDate: "2026-02-01", endDate: "2026-03-15", impressions: 300000, clicks: 2100, conversions: 30, spend: 4800, sector: "dod", objective: "awareness" },
  { slug: "cd-04", platform: "Programmatic Display", campaignName: "DoD Modernization Retargeting", startDate: "2026-02-10", endDate: "2026-03-20", impressions: 500000, clicks: 1100, conversions: 18, spend: 4300, sector: "dod", objective: "awareness" },
  { slug: "cd-05", platform: "GovExec Media", campaignName: "DoD Leadership Sponsored Content", startDate: "2026-03-01", endDate: "2026-04-10", impressions: 120000, clicks: 900, conversions: 12, spend: 3600, sector: "dod", objective: "awareness" },
  { slug: "cd-06", platform: "LinkedIn Ads", campaignName: "Civilian Cloud Migration Consideration", startDate: "2026-03-05", endDate: "2026-04-20", impressions: 70000, clicks: 480, conversions: 33, spend: 3100, sector: "civilian", objective: "consideration" },
  { slug: "cd-07", platform: "Google Search Ads", campaignName: "Civilian IT Modernization Search", startDate: "2026-03-15", endDate: "2026-04-25", impressions: 55000, clicks: 1600, conversions: 60, spend: 4200, sector: "civilian", objective: "consideration" },
  { slug: "cd-08", platform: "Google Display Ads", campaignName: "Civilian Agency Retargeting", startDate: "2026-04-01", endDate: "2026-05-10", impressions: 400000, clicks: 1450, conversions: 40, spend: 3800, sector: "civilian", objective: "consideration" },
  { slug: "cd-09", platform: "YouTube Ads", campaignName: "Civilian Digital Transformation Video", startDate: "2026-04-05", endDate: "2026-05-15", impressions: 250000, clicks: 2000, conversions: 25, spend: 5200, sector: "civilian", objective: "awareness" },
  { slug: "cd-10", platform: "Meta Ads", campaignName: "SLED Public Safety Recruitment", startDate: "2026-05-01", endDate: "2026-06-10", impressions: 95000, clicks: 720, conversions: 55, spend: 3400, sector: "sled", objective: "recruitment" },
  { slug: "cd-11", platform: "Programmatic Display", campaignName: "SLED Recruitment Retargeting", startDate: "2026-05-05", endDate: "2026-06-15", impressions: 350000, clicks: 900, conversions: 30, spend: 2600, sector: "sled", objective: "recruitment" },
  { slug: "cd-12", platform: "LinkedIn Ads", campaignName: "SLED HR Leadership Recruitment", startDate: "2026-05-10", endDate: "2026-06-20", impressions: 40000, clicks: 260, conversions: 20, spend: 2400, sector: "sled", objective: "recruitment" },
  { slug: "cd-13", platform: "Google Search Ads", campaignName: "SLED Recruiting Search", startDate: "2026-05-15", endDate: "2026-06-25", impressions: 45000, clicks: 1350, conversions: 70, spend: 3900, sector: "sled", objective: "recruitment" },
  { slug: "cd-14", platform: "GovExec Media", campaignName: "IC Mission Outreach", startDate: "2026-01-15", endDate: "2026-02-28", impressions: 60000, clicks: 380, conversions: 8, spend: 4100, sector: "ic", objective: "awareness" },
  { slug: "cd-15", platform: "LinkedIn Ads", campaignName: "IC Program Manager Outreach", startDate: "2026-02-01", endDate: "2026-03-10", impressions: 30000, clicks: 150, conversions: 5, spend: 2900, sector: "ic", objective: "awareness" },
  { slug: "cd-16", platform: "Meta Ads", campaignName: "Higher Ed Continuing Education Awareness", startDate: "2026-06-01", endDate: "2026-07-15", impressions: 200000, clicks: 2400, conversions: 45, spend: 3200, sector: "higher_ed", objective: "awareness" },
  { slug: "cd-17", platform: "Google Search Ads", campaignName: "Higher Ed Certificate Program Leads", startDate: "2026-06-10", endDate: "2026-07-20", impressions: 38000, clicks: 1900, conversions: 130, spend: 4400, sector: "higher_ed", objective: "lead_generation" },
  { slug: "cd-18", platform: "Programmatic Display", campaignName: "Civilian Modernization Awareness Extension", startDate: "2026-07-01", endDate: "2026-08-10", impressions: 420000, clicks: 950, conversions: 14, spend: 2100, sector: "civilian", objective: "awareness" },
];

async function main() {
  const demoUserId = process.env.DEMO_USER_ID;
  if (!demoUserId) {
    console.error(
      'DEMO_USER_ID is required — set it to the Clerk user id you\'ll log in as, e.g.:\n' +
        "  DEMO_USER_ID=user_xxx pnpm --filter @artform/arvo db:seed:demo\n" +
        'See README.md, "See it as a demo", for where to find that id.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Seeding demo data for DEMO_USER_ID=${demoUserId}\n`);

  const benchmarkResult = await seedFromCsv(SAMPLE_BENCHMARKS_CSV, prisma);
  console.log(
    `Benchmarks: ${benchmarkResult.upserted} upserted, ${benchmarkResult.skipped} skipped ` +
      `(of ${benchmarkResult.rowsRead} read) from ${benchmarkResult.csvPath}`,
  );

  let scenariosSeeded = 0;
  for (const input of DEMO_SCENARIOS) {
    const id = demoUuid(`scenario:${input.slug}`);

    // Same lookup app/api/scenarios/route.ts's POST handler does — every
    // BenchmarkRollup row for this scenario's sector/objective, any
    // platform/metric — then the real scoring engine, not hand-rolled
    // numbers, produces the persisted scores/allocations.
    const rollups = await prisma.benchmarkRollup.findMany({
      where: { sector: input.sector, objective: input.objective },
    });

    const { platformScores, budgetAllocations, influenceScore, influenceBreakdown } = computeScenarioScores({
      objective: input.objective,
      sector: input.sector,
      budget: input.budget,
      excludedPlatforms: input.excludedPlatforms,
      requiredPlatforms: input.requiredPlatforms,
      rollups,
    });

    const data = {
      userId: demoUserId,
      workspaceId: demoUserId,
      name: input.name,
      objective: input.objective,
      sector: input.sector,
      personas: input.personas,
      budget: input.budget,
      flightStart: new Date(input.flightStart),
      flightEnd: new Date(input.flightEnd),
      excludedPlatforms: input.excludedPlatforms,
      requiredPlatforms: input.requiredPlatforms,
      platformScores,
      influenceScore,
      influenceBreakdown,
      budgetAllocations,
      flightActuals: input.flightActuals,
      status: input.status,
    };

    await prisma.scenario.upsert({ where: { id }, create: { id, ...data }, update: data });
    scenariosSeeded++;
  }

  let campaignRowsSeeded = 0;
  for (const row of DEMO_CAMPAIGN_DATA) {
    const id = demoUuid(`campaign-data:${row.slug}`);
    const { ctr, cpl, cpm } = computeDerivedMetrics(row);

    const data = {
      userId: demoUserId,
      workspaceId: demoUserId,
      platform: row.platform,
      campaignName: row.campaignName,
      startDate: new Date(row.startDate),
      endDate: new Date(row.endDate),
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      spend: row.spend,
      ctr,
      cpl,
      cpm,
      sector: row.sector,
      objective: row.objective,
    };

    await prisma.campaignData.upsert({ where: { id }, create: { id, ...data }, update: data });
    campaignRowsSeeded++;
  }

  console.log("");
  console.log("Demo seed complete:");
  console.log(`  benchmark rollups seeded: ${benchmarkResult.upserted}`);
  console.log(`  scenarios seeded:         ${scenariosSeeded} (1 archived)`);
  console.log(`  campaign data rows seeded: ${campaignRowsSeeded}`);
  console.log("");
  console.log(`Log into Arvo with the Clerk account whose user id is "${demoUserId}" to see this data.`);
}

main()
  .catch((err) => {
    console.error("Fatal error running seed-demo:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
