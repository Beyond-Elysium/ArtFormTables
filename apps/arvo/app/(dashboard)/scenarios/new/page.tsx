import { PageHeader } from "@/components/PageHeader";

const steps = ["Objective", "Audience", "Budget & Flight", "Review"];

// TODO: not yet functional — each step will collect the fields backing
// lib/enums.ts's objectiveSchema/sectorSchema plus budget + flight dates,
// then POST to an API route (backed by lib/db.ts) to create the scenario.

export default function NewScenarioPage() {
  return (
    <>
      <PageHeader title="New Scenario" />
      <div className="card">
        <div className="card-body">
          <div className="steps steps-counter mb-4">
            {steps.map((step, index) => (
              <span
                key={step}
                className={`step-item${index === 0 ? " active" : ""}`}
              >
                {step}
              </span>
            ))}
          </div>
          <p className="text-secondary mb-0">
            The scenario wizard is coming soon. Once live, it will walk
            through objective, audience, and budget &amp; flight inputs, then
            benchmark the plan against comparable GovCon campaigns.
          </p>
        </div>
      </div>
    </>
  );
}
