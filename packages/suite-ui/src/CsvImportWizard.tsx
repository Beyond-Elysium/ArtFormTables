// Placeholder scaffold — the real CsvImportWizard (column mapping, preview,
// validation) is being built out in parallel in a separate worktree. This
// stub only exists so consuming apps (apps/arvo/app/(dashboard)/import) have
// a real component to import while that work lands.

export function CsvImportWizard({ onImport }: { onImport?: (file: File) => void }) {
  return (
    <div className="empty">
      <p className="empty-title">CSV import wizard coming soon</p>
      <p className="empty-subtitle text-secondary">
        Column mapping and validation will appear here once @artform/suite-ui
        ships CsvImportWizard.
      </p>
    </div>
  );
}
