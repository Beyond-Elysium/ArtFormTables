"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { objectiveSchema, objectiveLabels, sectorSchema, sectorLabels, type Objective, type Sector } from "@/lib/enums";
import { PLATFORM_IDS, platformLabels, type PlatformId } from "@/lib/platforms";

const STEPS = ["Objective", "Audience", "Budget & Flight", "Review"] as const;

interface WizardState {
  name: string;
  objective: Objective | "";
  sector: Sector | "";
  personas: string[];
  budget: string;
  flightStart: string;
  flightEnd: string;
  excludedPlatforms: PlatformId[];
  requiredPlatforms: PlatformId[];
}

const initialState: WizardState = {
  name: "",
  objective: "",
  sector: "",
  personas: [""],
  budget: "",
  flightStart: "",
  flightEnd: "",
  excludedPlatforms: [],
  requiredPlatforms: [],
};

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function NewScenarioPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function stepError(index: number): string | null {
    if (index === 0) {
      if (!form.name.trim()) return "Name is required.";
      if (!form.objective) return "Choose an objective.";
      if (!form.sector) return "Choose a sector.";
    }
    if (index === 1) {
      const personas = form.personas.map((p) => p.trim()).filter(Boolean);
      if (personas.length === 0) return "Add at least one target persona.";
    }
    if (index === 2) {
      const budget = Number(form.budget);
      if (!form.budget || !Number.isFinite(budget) || budget <= 0) return "Enter a budget greater than 0.";
      if (!form.flightStart || !form.flightEnd) return "Choose a flight start and end date.";
      if (form.flightEnd < form.flightStart) return "Flight end must be on or after flight start.";
      const conflicting = form.requiredPlatforms.filter((p) => form.excludedPlatforms.includes(p));
      if (conflicting.length > 0) return "A platform can't be both required and excluded.";
    }
    return null;
  }

  function goNext() {
    const err = stepError(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goPrev() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function updatePersona(index: number, value: string) {
    const personas = [...form.personas];
    personas[index] = value;
    update("personas", personas);
  }

  function addPersona() {
    update("personas", [...form.personas, ""]);
  }

  function removePersona(index: number) {
    const personas = form.personas.filter((_, i) => i !== index);
    update("personas", personas.length > 0 ? personas : [""]);
  }

  function togglePlatform(list: "excludedPlatforms" | "requiredPlatforms", platform: PlatformId) {
    const current = form[list];
    const next = current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform];
    update(list, next);
  }

  async function handleSubmit() {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const err = stepError(i);
      if (err) {
        setStep(i);
        setError(err);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/arvo/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          objective: form.objective,
          sector: form.sector,
          personas: form.personas.map((p) => p.trim()).filter(Boolean),
          budget: Number(form.budget),
          flightStart: form.flightStart,
          flightEnd: form.flightEnd,
          excludedPlatforms: form.excludedPlatforms,
          requiredPlatforms: form.requiredPlatforms,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = Array.isArray(body?.errors)
          ? body.errors.map((e: { message: string }) => e.message).join("; ")
          : (body?.error ?? `Failed to create scenario (${res.status})`);
        setError(message);
        return;
      }
      router.push(`/arvo/scenarios/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scenario");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="New Scenario" />
      <div className="card">
        <div className="card-body">
          <div className="steps steps-counter mb-4">
            {STEPS.map((label, index) => (
              <span key={label} className={`step-item${index === step ? " active" : ""}`}>
                {label}
              </span>
            ))}
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label">Scenario name</label>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Q1 DoD Recruitment Push"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Objective</label>
                <select
                  className="form-select"
                  value={form.objective}
                  onChange={(e) => update("objective", e.target.value as Objective)}
                >
                  <option value="">Select an objective…</option>
                  {objectiveSchema.options.map((o) => (
                    <option key={o} value={o}>
                      {objectiveLabels[o]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Sector</label>
                <select className="form-select" value={form.sector} onChange={(e) => update("sector", e.target.value as Sector)}>
                  <option value="">Select a sector…</option>
                  {sectorSchema.options.map((s) => (
                    <option key={s} value={s}>
                      {sectorLabels[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <label className="form-label">Target personas (job titles)</label>
              {form.personas.map((persona, index) => (
                <div key={index} className="input-group mb-2">
                  <input
                    className="form-control"
                    value={persona}
                    onChange={(e) => updatePersona(index, e.target.value)}
                    placeholder="e.g. Program Manager"
                  />
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => removePersona(index)}
                    disabled={form.personas.length === 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-link px-0" onClick={addPersona}>
                + Add another persona
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Total budget (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="form-control"
                  value={form.budget}
                  onChange={(e) => update("budget", e.target.value)}
                  placeholder="e.g. 50000"
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Flight start</label>
                <input
                  type="date"
                  className="form-control"
                  value={form.flightStart}
                  onChange={(e) => update("flightStart", e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Flight end</label>
                <input
                  type="date"
                  className="form-control"
                  value={form.flightEnd}
                  onChange={(e) => update("flightEnd", e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Required platforms</label>
                <div className="form-selectgroup">
                  {PLATFORM_IDS.map((platform) => (
                    <label key={platform} className="form-selectgroup-item">
                      <input
                        type="checkbox"
                        className="form-selectgroup-input"
                        checked={form.requiredPlatforms.includes(platform)}
                        onChange={() => togglePlatform("requiredPlatforms", platform)}
                      />
                      <span className="form-selectgroup-label">{platformLabels[platform]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Excluded platforms</label>
                <div className="form-selectgroup">
                  {PLATFORM_IDS.map((platform) => (
                    <label key={platform} className="form-selectgroup-item">
                      <input
                        type="checkbox"
                        className="form-selectgroup-input"
                        checked={form.excludedPlatforms.includes(platform)}
                        onChange={() => togglePlatform("excludedPlatforms", platform)}
                      />
                      <span className="form-selectgroup-label">{platformLabels[platform]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="h4">Review</h3>
              <dl className="row mb-0">
                <dt className="col-3">Name</dt>
                <dd className="col-9">{form.name}</dd>
                <dt className="col-3">Objective</dt>
                <dd className="col-9">{form.objective ? objectiveLabels[form.objective] : "—"}</dd>
                <dt className="col-3">Sector</dt>
                <dd className="col-9">{form.sector ? sectorLabels[form.sector] : "—"}</dd>
                <dt className="col-3">Personas</dt>
                <dd className="col-9">{form.personas.filter(Boolean).join(", ") || "—"}</dd>
                <dt className="col-3">Budget</dt>
                <dd className="col-9">{form.budget ? currency(Number(form.budget)) : "—"}</dd>
                <dt className="col-3">Flight window</dt>
                <dd className="col-9">
                  {form.flightStart} – {form.flightEnd}
                </dd>
                <dt className="col-3">Required platforms</dt>
                <dd className="col-9">
                  {form.requiredPlatforms.length ? form.requiredPlatforms.map((p) => platformLabels[p]).join(", ") : "None"}
                </dd>
                <dt className="col-3">Excluded platforms</dt>
                <dd className="col-9">
                  {form.excludedPlatforms.length ? form.excludedPlatforms.map((p) => platformLabels[p]).join(", ") : "None"}
                </dd>
              </dl>
            </div>
          )}

          <div className="d-flex justify-content-between mt-4">
            <button type="button" className="btn btn-outline-secondary" onClick={goPrev} disabled={step === 0 || submitting}>
              Previous
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                Next
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Creating…" : "Create Scenario"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
