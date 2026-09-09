import { PageHeader } from "@/components/PageHeader";
import { pricingTiers } from "@/lib/pricing";

// TODO(billing): current-plan state and the upgrade/downgrade actions below
// will call into lib/billing.ts (Stripe) once the concurrent billing work
// lands. For now this just renders the static pricing catalog.

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="row row-deck row-cards">
        {pricingTiers.map((tier) => (
          <div key={tier.name} className="col-md-4">
            <div className="card">
              <div className="card-body">
                <div className="subheader">{tier.name}</div>
                <div className="h1 mb-1">
                  ${tier.priceMonthly}
                  <span className="text-secondary fs-5">/mo</span>
                </div>
                <div className="text-secondary mb-3">{tier.seats}</div>
                <ul className="list-unstyled text-secondary mb-3">
                  {tier.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button className="btn btn-outline-primary w-100" disabled>
                  Coming soon
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
