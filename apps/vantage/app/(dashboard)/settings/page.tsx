import { IconPlug } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";
import { pricingTiers } from "@/lib/pricing";

// TODO(db + sync): alert preferences, tracked agencies/NAICS, and the
// HubSpot connection below are static placeholders — real state and actions
// land once the concurrent Prisma schema and sync work merge in.
// TODO(billing): current-plan state and upgrade/downgrade actions will call
// into a Stripe integration (see .env.example) once that work lands.

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />

      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">Alert Preferences</h3>
        </div>
        <div className="card-body">
          <label className="form-check form-switch mb-2">
            <input className="form-check-input" type="checkbox" disabled />
            <span className="form-check-label">New opportunity matches</span>
          </label>
          <label className="form-check form-switch mb-2">
            <input className="form-check-input" type="checkbox" disabled />
            <span className="form-check-label">Response deadline changes</span>
          </label>
          <label className="form-check form-switch">
            <input className="form-check-input" type="checkbox" disabled />
            <span className="form-check-label">Competitor award activity</span>
          </label>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title">Tracked Agencies</h3>
            </div>
            <div className="card-body">
              <input
                type="text"
                className="form-control mb-2"
                placeholder="Add an agency…"
                disabled
              />
              <div className="text-secondary small">No agencies tracked yet.</div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h3 className="card-title">Tracked NAICS Codes</h3>
            </div>
            <div className="card-body">
              <input
                type="text"
                className="form-control mb-2"
                placeholder="Add a NAICS code…"
                disabled
              />
              <div className="text-secondary small">No NAICS codes tracked yet.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">HubSpot Connection</h3>
        </div>
        <div className="empty py-4">
          <div className="empty-icon">
            <IconPlug size={40} stroke={1.5} />
          </div>
          <p className="empty-title">Not connected</p>
          <p className="empty-subtitle text-secondary">
            Connect HubSpot to sync tracked contacts and opportunities into
            your CRM.
          </p>
          <div className="empty-action">
            <button type="button" className="btn btn-primary" disabled>
              Connect HubSpot
            </button>
          </div>
        </div>
      </div>

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
                <div className="text-secondary mb-3">{tier.tagline}</div>
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
