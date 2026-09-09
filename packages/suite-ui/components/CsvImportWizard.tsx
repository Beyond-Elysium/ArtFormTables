"use client";

import { useMemo, useState } from "react";

type Step = "upload" | "map" | "preview";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map Columns" },
  { key: "preview", label: "Preview & Confirm" },
];

// Placeholder split — good enough for the mapping UI. Real CSV parsing
// (quoted fields, escapes) is wired up by the consuming product with
// Papa Parse before rows reach onComplete in production flows.
function naiveParse(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const [headerLine, ...rest] = lines;
  const headers = (headerLine ?? "").split(",").map((h) => h.trim());
  const rows = rest.map((line) => line.split(",").map((c) => c.trim()));
  return { headers, rows };
}

export function CsvImportWizard({
  expectedColumns,
  onComplete,
}: {
  expectedColumns: string[];
  onComplete: (rows: Record<string, string>[]) => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { headers: parsedHeaders, rows } = naiveParse(String(reader.result ?? ""));
      setHeaders(parsedHeaders);
      setRawRows(rows);
      const guessed: Record<string, string> = {};
      for (const col of expectedColumns) {
        const match = parsedHeaders.find((h) => h.toLowerCase() === col.toLowerCase());
        if (match) guessed[col] = match;
      }
      setMapping(guessed);
      setStep("map");
    };
    reader.readAsText(file);
  }

  const mappedRows = useMemo(() => {
    return rawRows.map((row) => {
      const record: Record<string, string> = {};
      for (const col of expectedColumns) {
        const sourceHeader = mapping[col];
        const colIndex = sourceHeader ? headers.indexOf(sourceHeader) : -1;
        record[col] = colIndex >= 0 ? (row[colIndex] ?? "") : "";
      }
      return record;
    });
  }, [rawRows, headers, mapping, expectedColumns]);

  const allMapped = expectedColumns.every((col) => Boolean(mapping[col]));

  return (
    <div className="card">
      <div className="card-header">
        <ul className="nav nav-pills" role="tablist">
          {STEPS.map((s, i) => (
            <li className="nav-item" key={s.key}>
              <span
                className={`nav-link ${i === stepIndex ? "active" : ""} ${i > stepIndex ? "disabled" : ""}`}
              >
                {i + 1}. {s.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card-body">
        {step === "upload" && (
          <div>
            <label className="form-label">Choose a CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="form-control"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {fileName && <div className="text-secondary small mt-2">Selected: {fileName}</div>}
          </div>
        )}

        {step === "map" && (
          <div>
            <p className="text-secondary">Match each expected field to a column from your file.</p>
            {expectedColumns.map((col) => (
              <div className="mb-2 row align-items-center" key={col}>
                <label className="col-4 col-form-label">{col}</label>
                <div className="col-8">
                  <select
                    className="form-select"
                    value={mapping[col] ?? ""}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value }))}
                  >
                    <option value="">Select a column…</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === "preview" && (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  {expectedColumns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {expectedColumns.map((col) => (
                      <td key={col}>{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {mappedRows.length > 10 && (
              <div className="text-secondary small">
                Showing 10 of {mappedRows.length} rows.
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card-footer d-flex justify-content-between">
        <button
          type="button"
          className="btn"
          disabled={step === "upload"}
          onClick={() => setStep(step === "preview" ? "map" : "upload")}
        >
          Back
        </button>
        {step === "map" && (
          <button type="button" className="btn btn-primary" disabled={!allMapped} onClick={() => setStep("preview")}>
            Continue
          </button>
        )}
        {step === "preview" && (
          <button type="button" className="btn btn-primary" onClick={() => onComplete(mappedRows)}>
            Confirm Import
          </button>
        )}
      </div>
    </div>
  );
}
