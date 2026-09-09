// Prisma's Decimal (Scenario.budget) doesn't serialize to a plain number via
// NextResponse.json/JSON.stringify (decimal.js's toJSON returns a string),
// so API responses coerce it to a real number for the client to consume.

import type { Scenario } from "@/generated/prisma-client";

export type SerializedScenario = Omit<Scenario, "budget"> & { budget: number };

export function serializeScenario(scenario: Scenario): SerializedScenario {
  return { ...scenario, budget: scenario.budget.toNumber() };
}
