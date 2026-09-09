// Zod schema for one imported CSV row, matching CampaignData's importable
// fields (see prisma/schema.prisma). All values arrive as strings (raw CSV
// cells / wizard column-mapping output), so numeric/date fields are parsed
// and coerced here rather than trusted as-is. `ctr`/`cpl`/`cpm` are not part
// of this schema — they're always computed server-side, see
// computeDerivedMetrics below.

import { z } from "zod";

function requiredString(label: string) {
  return z.string().trim().min(1, `${label} is required`);
}

function nonNegativeInt(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => Number.isFinite(Number(v)), { message: `${label} must be a number` })
    .transform((v) => Number(v))
    .refine((v) => Number.isInteger(v), { message: `${label} must be a whole number` })
    .refine((v) => v >= 0, { message: `${label} must be >= 0` });
}

function nonNegativeNumber(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => Number.isFinite(Number(v)), { message: `${label} must be a number` })
    .transform((v) => Number(v))
    .refine((v) => v >= 0, { message: `${label} must be >= 0` });
}

function dateInput(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: `${label} is not a valid date` });
}

export const campaignDataRowSchema = z.object({
  platform: requiredString("platform"),
  campaign_name: requiredString("campaign_name"),
  start_date: dateInput("start_date"),
  end_date: dateInput("end_date"),
  impressions: nonNegativeInt("impressions"),
  clicks: nonNegativeInt("clicks"),
  conversions: nonNegativeInt("conversions"),
  spend: nonNegativeNumber("spend"),
  sector: requiredString("sector"),
  objective: requiredString("objective"),
});

export type CampaignDataRow = z.infer<typeof campaignDataRowSchema>;

/**
 * ctr/cpl/cpm are always derived from the raw numbers server-side, never
 * trusted from the CSV. The CampaignData columns are non-nullable Floats, so
 * divide-by-zero denominators resolve to 0 rather than null/NaN.
 */
export function computeDerivedMetrics(row: Pick<CampaignDataRow, "impressions" | "clicks" | "conversions" | "spend">) {
  const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
  const cpm = row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
  const cpl = row.conversions > 0 ? row.spend / row.conversions : 0;
  return { ctr, cpl, cpm };
}
