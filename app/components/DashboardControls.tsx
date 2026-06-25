"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  RANGE_PRESETS,
  COMPARE_OPTIONS,
  todayISO,
  type RangePresetId,
  type CompareMode,
} from "@/lib/range";

/**
 * Date-range + comparison controls. State lives in the URL (shareable,
 * server-rendered) — each change pushes new search params and the server page
 * refetches. A transition keeps the UI responsive while data loads.
 */
export function DashboardControls({
  preset,
  start,
  end,
  compareMode,
}: {
  preset: RangePresetId;
  start: string;
  end: string;
  compareMode: CompareMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [showCustom, setShowCustom] = useState(preset === "custom");
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);

  function apply(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    // Preserve the active-view hash so the selected tab survives the change.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}${hash}` : `${pathname}${hash}`, {
        scroll: false,
      });
    });
  }

  function selectPreset(id: RangePresetId) {
    if (id === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    apply({ range: id, from: null, to: null });
  }

  const today = todayISO();

  return (
    <div className="d-flex flex-wrap align-items-center gap-2" aria-busy={isPending}
      style={{ opacity: isPending ? 0.6 : 1, transition: "opacity .15s" }}>
      <div className="btn-group" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((p) => {
          const active = p.id === "custom" ? showCustom : !showCustom && p.id === preset;
          return (
            <button
              key={p.id}
              type="button"
              className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => selectPreset(p.id)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {showCustom && (
        <div className="d-flex align-items-center gap-1">
          <input
            type="date"
            className="form-control form-control-sm"
            style={{ width: "auto" }}
            value={from}
            max={to || today}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
          />
          <span className="text-secondary">–</span>
          <input
            type="date"
            className="form-control form-control-sm"
            style={{ width: "auto" }}
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!from || !to}
            onClick={() => apply({ range: "custom", from, to })}
          >
            Apply
          </button>
        </div>
      )}

      <div className="d-flex align-items-center gap-1 ms-md-auto">
        <label className="text-secondary small mb-0" htmlFor="compare-select">
          Compare
        </label>
        <select
          id="compare-select"
          className="form-select form-select-sm"
          style={{ width: "auto" }}
          value={compareMode}
          onChange={(e) =>
            apply({ compare: e.target.value === "none" ? null : e.target.value })
          }
        >
          {COMPARE_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
