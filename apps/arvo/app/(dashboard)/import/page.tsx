import { CsvImportWizard } from "@artform/suite-ui";
import { PageHeader } from "@/components/PageHeader";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import Data"
        subtitle="Bring in campaign performance from a CSV export."
      />
      <div className="card">
        <div className="card-body">
          <CsvImportWizard />
        </div>
      </div>
    </>
  );
}
