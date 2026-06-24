import { notFound } from "next/navigation";
import { getClientBySubdomain } from "@/config/clients";
import { getDashboardData, type DateRangePreset } from "@/lib/ga";
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatDuration,
} from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { TrafficChart, DonutChart } from "@/components/Charts";
import { TopPagesTable } from "@/components/TopPagesTable";

// Cache GA responses for an hour to respect GA4 Data API quotas.
export const revalidate = 3600;

const RANGE_LABELS: Record<DateRangePreset, string> = {
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "90d": "Last 90 days",
};

const DEFAULT_BRAND = { primary: "#426fb6", accent: "#e41679" };

export default async function ClientDashboard({
  params,
  searchParams,
}: {
  params: { subdomain: string };
  searchParams: { range?: string };
}) {
  const client = getClientBySubdomain(params.subdomain);
  if (!client) notFound();

  const range: DateRangePreset = (["7d", "28d", "90d"] as const).includes(
    searchParams.range as DateRangePreset,
  )
    ? (searchParams.range as DateRangePreset)
    : "28d";

  const data = await getDashboardData(client.ga4PropertyId, range);
  const brand = { ...DEFAULT_BRAND, ...client.brand };
  const { overview: o } = data;

  return (
    <div
      className="page"
      style={
        {
          "--tblr-primary": brand.primary,
          "--tblr-primary-rgb": hexToRgb(brand.primary),
        } as React.CSSProperties
      }
    >
      <header className="navbar navbar-expand-md navbar-light d-print-none border-bottom">
        <div className="container-xl">
          <span className="navbar-brand h1 mb-0" style={{ color: brand.primary }}>
            {client.brand?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.brand.logo} alt={client.name} height={28} />
            ) : (
              client.name
            )}
          </span>
          <div className="navbar-nav flex-row order-md-last">
            <span className="nav-item text-secondary text-subtitle align-self-center">
              Powered by ArtForm
            </span>
          </div>
        </div>
      </header>

      <div className="page-wrapper">
        <div className="page-header d-print-none">
          <div className="container-xl">
            <div className="row align-items-center">
              <div className="col">
                <div className="page-pretitle text-subtitle">Analytics</div>
                <h2 className="page-title">{client.name} dashboard</h2>
              </div>
              <div className="col-auto ms-auto">
                <div className="btn-list">
                  {(Object.keys(RANGE_LABELS) as DateRangePreset[]).map((r) => (
                    <a
                      key={r}
                      href={`?range=${r}`}
                      className={`btn ${r === range ? "btn-primary" : "btn-outline-primary"}`}
                    >
                      {RANGE_LABELS[r]}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-body">
          <div className="container-xl">
            {data.isMock && (
              <div className="alert mock-banner mb-3" role="alert">
                <strong>Demo data.</strong> No GA4 credentials configured — showing
                deterministic sample metrics. Set <code>GA_SERVICE_ACCOUNT_KEY</code>{" "}
                to display live Google Analytics data.
              </div>
            )}

            <div className="row row-cards">
              <StatCard
                label="Users"
                value={formatCompact(o.users)}
                delta={o.deltas.users}
              />
              <StatCard
                label="Sessions"
                value={formatCompact(o.sessions)}
                delta={o.deltas.sessions}
              />
              <StatCard
                label="Pageviews"
                value={formatCompact(o.pageviews)}
                delta={o.deltas.pageviews}
              />
              <StatCard
                label="Engagement rate"
                value={formatPercent(o.engagementRate)}
                delta={o.deltas.engagementRate}
              />
            </div>

            <div className="row row-cards mt-1">
              <div className="col-lg-8">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Traffic over time</h3>
                    <div className="card-subtitle text-subtitle">
                      Avg. session {formatDuration(o.avgSessionDuration)}
                    </div>
                  </div>
                  <div className="card-body">
                    <TrafficChart data={data.timeseries} brand={brand} />
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Traffic sources</h3>
                  </div>
                  <div className="card-body">
                    <DonutChart data={data.sources} brand={brand} />
                  </div>
                </div>
              </div>
            </div>

            <div className="row row-cards mt-1">
              <div className="col-lg-8">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Top pages</h3>
                  </div>
                  <TopPagesTable pages={data.topPages} />
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Devices</h3>
                  </div>
                  <div className="card-body">
                    <DonutChart data={data.devices} brand={brand} />
                  </div>
                </div>
              </div>
            </div>

            <div className="text-secondary text-center mt-4 small">
              {formatNumber(o.users)} users · {RANGE_LABELS[range]} ·{" "}
              {data.isMock ? "demo data" : "live GA4 data"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
