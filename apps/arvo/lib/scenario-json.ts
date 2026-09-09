// Small pure helpers for reading Scenario's freeform jsonb columns
// (platform_scores/budget_allocations/influence_breakdown all share the same
// {[key]: number} shape; flight_actuals is {[platform]: {impressions,
// clicks, conversions, spend}}). Mirrors the shapes
// app/scenarios/[id]/print/page.tsx already renders, since that page defines
// what these columns look like.

import type { Prisma } from "@/generated/prisma-client";

export function asScoreRecord(value: Prisma.JsonValue | null | undefined): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

export type FlightActualsRow = { impressions?: number; clicks?: number; conversions?: number; spend?: number };

export function asFlightActuals(value: Prisma.JsonValue | null | undefined): Record<string, FlightActualsRow> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, FlightActualsRow> = {};
  for (const [platform, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    out[platform] = {
      impressions: typeof r.impressions === "number" ? r.impressions : undefined,
      clicks: typeof r.clicks === "number" ? r.clicks : undefined,
      conversions: typeof r.conversions === "number" ? r.conversions : undefined,
      spend: typeof r.spend === "number" ? r.spend : undefined,
    };
  }
  return out;
}

export type DerivedMetric = { metric: "ctr" | "cpl" | "cpm" | "conversion_rate"; label: string; value: number };

export function derivedMetrics(row: FlightActualsRow): DerivedMetric[] {
  const out: DerivedMetric[] = [];
  if (row.clicks != null && row.impressions) out.push({ metric: "ctr", label: "CTR", value: row.clicks / row.impressions });
  if (row.spend != null && row.conversions) out.push({ metric: "cpl", label: "CPL", value: row.spend / row.conversions });
  if (row.spend != null && row.impressions)
    out.push({ metric: "cpm", label: "CPM", value: (row.spend / row.impressions) * 1000 });
  if (row.conversions != null && row.clicks)
    out.push({ metric: "conversion_rate", label: "Conversion Rate", value: row.conversions / row.clicks });
  return out;
}
