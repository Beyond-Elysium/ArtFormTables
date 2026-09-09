import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { objectiveSchema, sectorSchema } from "@/lib/enums";
import { computeScenarioScores } from "@/lib/scenario-engine";
import { serializeScenario } from "@/lib/scenario-serialize";

export const runtime = "nodejs";

/** GET — list the current user's scenarios, most recent first. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scenarios = await db.scenario.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(scenarios.map(serializeScenario));
}

const createScenarioSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  objective: objectiveSchema,
  sector: sectorSchema,
  personas: z.array(z.string().trim().min(1)).min(1, "at least one persona is required"),
  budget: z.coerce.number().positive("budget must be greater than 0"),
  flightStart: z.string().min(1, "flightStart is required"),
  flightEnd: z.string().min(1, "flightEnd is required"),
  excludedPlatforms: z.array(z.string()).default([]),
  requiredPlatforms: z.array(z.string()).default([]),
});

/**
 * POST — create a scenario: look up BenchmarkRollup rows for the scenario's
 * sector/objective, score every eligible platform (see lib/scenario-engine),
 * allocate the budget across them, and persist the computed fields alongside
 * the raw inputs. No workspace model exists yet, so workspaceId mirrors
 * userId (same pattern as app/api/import/route.ts).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createScenarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }
  const input = parsed.data;

  const flightStart = new Date(input.flightStart);
  const flightEnd = new Date(input.flightEnd);
  if (Number.isNaN(flightStart.getTime()) || Number.isNaN(flightEnd.getTime()) || flightEnd < flightStart) {
    return NextResponse.json({ error: "flightEnd must be on or after flightStart" }, { status: 422 });
  }

  const rollups = await db.benchmarkRollup.findMany({
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

  const scenario = await db.scenario.create({
    data: {
      userId,
      workspaceId: userId,
      name: input.name,
      objective: input.objective,
      sector: input.sector,
      personas: input.personas,
      budget: input.budget,
      flightStart,
      flightEnd,
      excludedPlatforms: input.excludedPlatforms,
      requiredPlatforms: input.requiredPlatforms,
      platformScores,
      influenceScore,
      influenceBreakdown,
      budgetAllocations,
      flightActuals: {},
    },
  });

  return NextResponse.json(serializeScenario(scenario), { status: 201 });
}
