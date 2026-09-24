"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformLabel } from "@/lib/platforms";
import type { FlightActualsRow } from "@/lib/scenario-json";

interface Props {
  scenarioId: string;
  platforms: string[];
  initial: Record<string, FlightActualsRow>;
}

type FieldValues = { impressions: string; clicks: string; conversions: string; spend: string };

function valuesFor(row: FlightActualsRow | undefined): FieldValues {
  return {
    impressions: row?.impressions?.toString() ?? "",
    clicks: row?.clicks?.toString() ?? "",
    conversions: row?.conversions?.toString() ?? "",
    spend: row?.spend?.toString() ?? "",
  };
}

/** Lets a planner record actual per-platform delivery for a flighted scenario, PATCHing flight_actuals (merged server-side, one platform at a time). */
export function FlightPerformanceTracker({ scenarioId, platforms, initial }: Props) {
  const router = useRouter();
  const [platform, setPlatform] = useState(platforms[0] ?? "");
  const [values, setValues] = useState<FieldValues>(() => valuesFor(initial[platforms[0] ?? ""]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function selectPlatform(next: string) {
    setPlatform(next);
    setValues(valuesFor(initial[next]));
    setSaved(false);
  }

  function setField(field: keyof FieldValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setSaved(false);
  }

  async function handleSave() {
    if (!platform) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const row: Record<string, number> = {};
      if (values.impressions !== "") row.impressions = Number(values.impressions);
      if (values.clicks !== "") row.clicks = Number(values.clicks);
      if (values.conversions !== "") row.conversions = Number(values.conversions);
      if (values.spend !== "") row.spend = Number(values.spend);

      const res = await fetch(`/arvo/api/scenarios/${scenarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flightActuals: { [platform]: row } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed to save actuals.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save actuals.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="row g-3 align-items-end">
        <div className="col-md-3">
          <label className="form-label">Platform</label>
          <select className="form-select" value={platform} onChange={(e) => selectPlatform(e.target.value)}>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {platformLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label">Impressions</label>
          <input
            type="number"
            min="0"
            className="form-control"
            value={values.impressions}
            onChange={(e) => setField("impressions", e.target.value)}
          />
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label">Clicks</label>
          <input type="number" min="0" className="form-control" value={values.clicks} onChange={(e) => setField("clicks", e.target.value)} />
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label">Conversions</label>
          <input
            type="number"
            min="0"
            className="form-control"
            value={values.conversions}
            onChange={(e) => setField("conversions", e.target.value)}
          />
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label">Spend ($)</label>
          <input type="number" min="0" className="form-control" value={values.spend} onChange={(e) => setField("spend", e.target.value)} />
        </div>
        <div className="col-md-1">
          <button type="button" className="btn btn-primary w-100" onClick={handleSave} disabled={saving || !platform}>
            {saving ? "…" : "Save"}
          </button>
        </div>
      </div>
      {error && (
        <div className="alert alert-danger mt-3 mb-0" role="alert">
          {error}
        </div>
      )}
      {saved && !error && <div className="text-success small mt-2">Saved.</div>}
    </div>
  );
}
