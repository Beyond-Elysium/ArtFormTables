"use client";

import { useState } from "react";
import Papa from "papaparse";
import { CsvImportWizard } from "@artform/suite-ui";
import { PageHeader } from "@/components/PageHeader";

// Matches CampaignData's importable fields (see prisma/schema.prisma).
const EXPECTED_COLUMNS = [
  "platform",
  "campaign_name",
  "start_date",
  "end_date",
  "impressions",
  "clicks",
  "conversions",
  "spend",
  "sector",
  "objective",
];

type ImportOutcome =
  | { status: "success"; imported: number }
  | { status: "error"; message: string; rowErrors?: { row: number; message: string }[] };

// Real CSV parsing (quoted fields, embedded commas/escapes) for the wizard's
// upload step, replacing its naive comma-split fallback.
function parseCsvFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(results.errors[0].message));
          return;
        }
        const headers = results.meta.fields ?? [];
        const rows = results.data.map((record) => headers.map((h) => (record[h] ?? "").toString().trim()));
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

export default function ImportPage() {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  async function handleComplete(rows: Record<string, string>[]) {
    setSubmitting(true);
    setOutcome(null);
    try {
      const res = await fetch("/arvo/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.errors) {
          setOutcome({ status: "error", message: "Some rows failed validation.", rowErrors: body.errors });
        } else {
          setOutcome({ status: "error", message: body.error ?? `Import failed (${res.status})` });
        }
        return;
      }
      setOutcome({ status: "success", imported: body.imported });
    } catch (err) {
      setOutcome({ status: "error", message: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Import Data" subtitle="Bring in campaign performance from a CSV export." />

      {outcome?.status === "success" && (
        <div className="alert alert-success" role="alert">
          Imported {outcome.imported} row{outcome.imported === 1 ? "" : "s"} successfully.
        </div>
      )}

      {outcome?.status === "error" && (
        <div className="alert alert-danger" role="alert">
          <div>{outcome.message}</div>
          {outcome.rowErrors && outcome.rowErrors.length > 0 && (
            <ul className="mb-0 mt-2">
              {outcome.rowErrors.map((e) => (
                <li key={e.row}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <CsvImportWizard expectedColumns={EXPECTED_COLUMNS} parseFile={parseCsvFile} onComplete={handleComplete} />
          {submitting && <div className="text-secondary small mt-2">Importing…</div>}
        </div>
      </div>
    </>
  );
}
