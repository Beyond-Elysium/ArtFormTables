"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DayPicker, type DateRange } from "react-day-picker";
import { format, parseISO } from "date-fns";
import "react-day-picker/style.css";
import {
  RANGE_PRESETS,
  COMPARE_OPTIONS,
  formatWindow,
  type RangePresetId,
  type CompareMode,
} from "@/lib/range";

/**
 * Date-range + comparison controls. State lives in the URL (shareable,
 * server-rendered) — each change pushes new search params and the server page
 * refetches. The custom range uses a react-day-picker range calendar.
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

  const [showCustom, setShowCustom] = useState(false);
  const [selected, setSelected] = useState<DateRange | undefined>(() => {
    try {
      return { from: parseISO(start), to: parseISO(end) };
    } catch {
      return undefined;
    }
  });

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
      setShowCustom((s) => !s);
      return;
    }
    setShowCustom(false);
    apply({ range: id, from: null, to: null });
  }

  function applyCustom() {
    if (!selected?.from || !selected?.to) return;
    apply({
      range: "custom",
      from: format(selected.from, "yyyy-MM-dd"),
      to: format(selected.to, "yyyy-MM-dd"),
    });
    setShowCustom(false);
  }

  const today = new Date();

  return (
    <div
      className="d-flex flex-wrap align-items-center gap-2 position-relative"
      aria-busy={isPending}
      style={{ opacity: isPending ? 0.6 : 1, transition: "opacity .15s" }}
    >
      <div className="btn-group" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((p) => {
          const active = p.id === "custom" ? showCustom || preset === "custom" : p.id === preset;
          return (
            <button
              key={p.id}
              type="button"
              className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => selectPreset(p.id)}
              aria-expanded={p.id === "custom" ? showCustom : undefined}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {showCustom && (
        <>
          {/* Click-away backdrop. */}
          <div
            className="daypicker-backdrop"
            onClick={() => setShowCustom(false)}
            aria-hidden="true"
          />
          <div className="card daypicker-popover" role="dialog" aria-label="Choose date range">
            <div className="card-body py-2">
              <DayPicker
                mode="range"
                selected={selected}
                onSelect={setSelected}
                defaultMonth={selected?.from ?? today}
                disabled={{ after: today }}
                numberOfMonths={2}
                showOutsideDays
              />
              <div className="d-flex justify-content-between align-items-center mt-2 border-top pt-2">
                <span className="text-secondary small">
                  {selected?.from && selected?.to
                    ? formatWindow({
                        key: "",
                        days: 0,
                        start: format(selected.from, "yyyy-MM-dd"),
                        end: format(selected.to, "yyyy-MM-dd"),
                      })
                    : "Pick a start and end date"}
                </span>
                <div className="d-flex gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setShowCustom(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={!selected?.from || !selected?.to}
                    onClick={applyCustom}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
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
