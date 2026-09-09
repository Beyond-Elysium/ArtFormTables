"use client";

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

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import Data"
        subtitle="Bring in campaign performance from a CSV export."
      />
      <div className="card">
        <div className="card-body">
          <CsvImportWizard
            expectedColumns={EXPECTED_COLUMNS}
            onComplete={(rows) => {
              // TODO(db): POST to an API route that bulk-inserts into
              // CampaignData via lib/db.ts once real credentials exist.
              console.log(`Import ready: ${rows.length} row(s)`, rows);
            }}
          />
        </div>
      </div>
    </>
  );
}
