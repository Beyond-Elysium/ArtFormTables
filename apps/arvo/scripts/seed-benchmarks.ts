/**
 * Seed BenchmarkRollup from a CSV export of ArtForm's GovCon benchmark data.
 *
 * Usage:
 *   pnpm --filter @artform/arvo exec tsx scripts/seed-benchmarks.ts path/to/benchmarks.csv
 *
 * Defaults to ./benchmarks.csv (relative to the current working directory)
 * when no path is given. See apps/arvo/prisma/README.md for the expected
 * CSV columns and an example.
 *
 * Each row is validated against `rowSchema` below (which mirrors
 * BenchmarkRollup) before being upserted on the model's natural key
 * (platform, sector, objective, metric, period) — re-running the script
 * with a refreshed export is always safe.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { z } from "zod";
import {
  PrismaClient,
  GovconSector,
  CampaignObjective,
  BenchmarkMetric,
} from "@prisma/client";

const prisma = new PrismaClient();

// Mirrors BenchmarkRollup's fields. Enum values are validated against the
// same enums Prisma generates from schema.prisma, so this can't drift out of
// sync with the schema. CSV headers are expected to be snake_case, matching
// the DB column names.
const rowSchema = z.object({
  platform: z.string().trim().min(1, "platform is required"),
  sector: z.nativeEnum(GovconSector, {
    message: `sector must be one of: ${Object.values(GovconSector).join(", ")}`,
  }),
  objective: z.nativeEnum(CampaignObjective, {
    message: `objective must be one of: ${Object.values(CampaignObjective).join(", ")}`,
  }),
  metric: z.nativeEnum(BenchmarkMetric, {
    message: `metric must be one of: ${Object.values(BenchmarkMetric).join(", ")}`,
  }),
  p25: z.coerce.number().finite(),
  p50: z.coerce.number().finite(),
  p75: z.coerce.number().finite(),
  sample_size: z.coerce.number().int().nonnegative(),
  period: z.string().trim().min(1, "period is required"),
});

type Row = z.infer<typeof rowSchema>;

async function main() {
  const csvPath = resolve(process.cwd(), process.argv[2] ?? "./benchmarks.csv");

  let raw: string;
  try {
    raw = readFileSync(csvPath, "utf-8");
  } catch (err) {
    console.error(`Could not read CSV at ${csvPath}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }

  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    console.warn(`CSV parser reported ${parsed.errors.length} issue(s):`);
    for (const e of parsed.errors.slice(0, 10)) {
      console.warn(`  row ${e.row ?? "?"}: ${e.message}`);
    }
  }

  const rowsRead = parsed.data.length;
  let upserted = 0;
  let skipped = 0;

  for (const [i, record] of parsed.data.entries()) {
    const lineNo = i + 2; // +1 for 0-index, +1 for the header row
    const result = rowSchema.safeParse(record);

    if (!result.success) {
      skipped++;
      console.warn(
        `Skipping row ${lineNo}: ${result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
      continue;
    }

    const row: Row = result.data;

    try {
      await prisma.benchmarkRollup.upsert({
        where: {
          platform_sector_objective_metric_period: {
            platform: row.platform,
            sector: row.sector,
            objective: row.objective,
            metric: row.metric,
            period: row.period,
          },
        },
        create: {
          platform: row.platform,
          sector: row.sector,
          objective: row.objective,
          metric: row.metric,
          p25: row.p25,
          p50: row.p50,
          p75: row.p75,
          sampleSize: row.sample_size,
          period: row.period,
        },
        update: {
          p25: row.p25,
          p50: row.p50,
          p75: row.p75,
          sampleSize: row.sample_size,
        },
      });
      upserted++;
    } catch (err) {
      skipped++;
      console.warn(
        `Skipping row ${lineNo} (DB error): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log("");
  console.log(`Benchmark seed complete: ${csvPath}`);
  console.log(`  rows read:      ${rowsRead}`);
  console.log(`  upserted:       ${upserted}`);
  console.log(`  skipped/invalid: ${skipped}`);
}

main()
  .catch((err) => {
    console.error("Fatal error running seed-benchmarks:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
