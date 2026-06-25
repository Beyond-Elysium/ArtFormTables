import { notFound } from "next/navigation";
import { getClientBySlug } from "@/config/clients";
import { fetchClientData } from "@/lib/connectors";
import type { DateRangePreset } from "@/lib/connectors/types";
import { PanelSection } from "@/components/PanelSection";

// Cache provider responses for an hour to respect API quotas.
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
  params: { client: string };
  searchParams: { range?: string };
}) {
  const client = getClientBySlug(params.client);
  if (!client) notFound();

  const range: DateRangePreset = (["7d", "28d", "90d"] as const).includes(
    searchParams.range as DateRangePreset,
  )
    ? (searchParams.range as DateRangePreset)
    : "28d";

  const results = await fetchClientData(client, range);
  const brand = { ...DEFAULT_BRAND, ...client.brand };
  const anyMock = results.some((r) => r.isMock);

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
                <div className="page-pretitle text-subtitle">Performance</div>
                <h1 className="page-title">{client.name} dashboard</h1>
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
            {anyMock && (
              <div className="alert mock-banner mb-3" role="alert">
                <strong>Demo data.</strong> One or more sources have no live
                credentials configured — showing deterministic sample metrics. See{" "}
                <code>app/README.md</code> to connect live data.
              </div>
            )}

            {results.map((result) => (
              <PanelSection key={result.sourceId} result={result} brand={brand} />
            ))}

            <div className="text-secondary text-center mt-4 small">
              {client.name} · {RANGE_LABELS[range]} · {results.length} data source
              {results.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)).join(", ");
}
