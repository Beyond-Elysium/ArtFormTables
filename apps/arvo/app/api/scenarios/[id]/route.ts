import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { serializeScenario } from "@/lib/scenario-serialize";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

async function findOwned(id: string, userId: string) {
  const scenario = await db.scenario.findUnique({ where: { id } });
  if (!scenario || scenario.userId !== userId) return null;
  return scenario;
}

/** GET — fetch one scenario. 404 if missing or not owned by the caller. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scenario = await findOwned(params.id, userId);
  if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(serializeScenario(scenario));
}

const flightActualsRowSchema = z.object({
  impressions: z.coerce.number().nonnegative().optional(),
  clicks: z.coerce.number().nonnegative().optional(),
  conversions: z.coerce.number().nonnegative().optional(),
  spend: z.coerce.number().nonnegative().optional(),
});

const patchScenarioSchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  name: z.string().trim().min(1).optional(),
  /** Per-platform actuals to merge into the existing flight_actuals map (keyed by platform). */
  flightActuals: z.record(z.string(), flightActualsRowSchema).optional(),
});

/**
 * PATCH — update a scenario. Supports the archive action ({status:
 * "archived"}) and recording Flight Performance Tracker actuals
 * ({flightActuals: {[platform]: {impressions, clicks, conversions, spend}}}),
 * which merges per-platform into the existing flight_actuals jsonb rather
 * than replacing the whole column.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scenario = await findOwned(params.id, userId);
  if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchScenarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.issues }, { status: 422 });
  }
  const input = parsed.data;

  const data: Prisma.ScenarioUpdateInput = {};
  if (input.status) data.status = input.status;
  if (input.name) data.name = input.name;
  if (input.flightActuals) {
    const existing =
      scenario.flightActuals && typeof scenario.flightActuals === "object" && !Array.isArray(scenario.flightActuals)
        ? (scenario.flightActuals as Record<string, unknown>)
        : {};
    data.flightActuals = { ...existing, ...input.flightActuals } as Prisma.InputJsonValue;
  }

  const updated = await db.scenario.update({ where: { id: params.id }, data });
  return NextResponse.json(serializeScenario(updated));
}

/** DELETE — remove a scenario. 404 if missing or not owned by the caller. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scenario = await findOwned(params.id, userId);
  if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.scenario.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
