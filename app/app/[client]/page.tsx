import { notFound } from "next/navigation";
import { getClientBySlug } from "@/config/clients";
import { fetchClientData } from "@/lib/connectors";
import { resolveRange, formatWindow } from "@/lib/range";
import { readableTextColor } from "@/lib/contrast";
import { DashboardControls } from "@/components/DashboardControls";
import { DashboardBody } from "@/components/DashboardBody";

// Cache provider responses for an hour to respect API quotas.
export const revalidate = 3600;

const DEFAULT_BRAND = { primary: "#426fb6", accent: "#e41679" };

export default async function ClientDashboard({
  params,
  searchParams,
}: {
  params: { client: string };
  searchParams: { range?: string; from?: string; to?: string; compare?: string };
}) {
  const client = getClientBySlug(params.client);
  if (!client) notFound();

  const resolved = resolveRange(searchParams);
  const results = await fetchClientData(client, resolved);
  const brand = { ...DEFAULT_BRAND, ...client.brand };
  const anyMock = results.some((r) => r.isMock);

  const badgeFg = readableTextColor(brand.primary);
  const windowLabel = formatWindow(resolved.window);
  const compareLabel = resolved.compare ? formatWindow(resolved.compare) : null;
  const updated = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
            <span className="nav-item text-secondary align-self-center small">
              Powered by ArtForm
            </span>
          </div>
        </div>
      </header>

      <div className="page-wrapper">
        {/* Sticky header: title + range/compare controls stay reachable on scroll. */}
        <div className="page-header sticky-controls d-print-none">
          <div className="container-xl">
            <div className="row align-items-center g-2 mb-2">
              <div className="col">
                <div className="page-pretitle text-subtitle">Performance</div>
                <h1 className="page-title">{client.name} dashboard</h1>
              </div>
              <div className="col-auto">
                <span
                  className="badge text-uppercase"
                  style={{ background: brand.primary, color: badgeFg }}
                >
                  {windowLabel}
                  {compareLabel ? ` · vs ${compareLabel}` : ""}
                </span>
              </div>
            </div>
            <DashboardControls
              preset={resolved.preset}
              start={resolved.window.start}
              end={resolved.window.end}
              compareMode={resolved.compareMode}
            />
          </div>
        </div>

        <div className="page-body">
          <div className="container-xl">
            {/* Print-only heading (the sticky one is hidden when printing). */}
            <div className="d-none d-print-block mb-3">
              <h1 className="page-title">{client.name} dashboard</h1>
              <div className="text-secondary">
                {windowLabel}
                {compareLabel ? ` · vs ${compareLabel}` : ""}
              </div>
            </div>

            {anyMock && (
              <div className="alert mock-banner mb-3" role="alert">
                <strong>Demo data.</strong> One or more sources have no live
                credentials configured — showing deterministic sample metrics. See{" "}
                <code>app/README.md</code> to connect live data.
              </div>
            )}

            <DashboardBody results={results} brand={brand} />

            <div className="text-secondary text-center mt-4 small">
              {client.name} · {windowLabel} · {results.length} data source
              {results.length === 1 ? "" : "s"} · Updated {updated}
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
