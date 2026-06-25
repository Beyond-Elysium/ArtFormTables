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
const HEADER_BG = "#333333";

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
  const deltaSuffix =
    resolved.compareMode === "year"
      ? "vs prior year"
      : `vs prior ${resolved.window.days}d`;
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
      {/* Dark header with a brand-accent underline. */}
      <header
        className="af-header d-print-none"
        style={{ background: HEADER_BG, borderBottom: `4px solid ${brand.accent}` }}
      >
        <div className="container-xl d-flex align-items-center py-3">
          <div className="d-flex align-items-center">
            {client.brand?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.brand.logo} alt={client.name} height={30} />
            ) : (
              <span className="af-header-title">{client.name}</span>
            )}
            <span className="af-header-sub ms-3 d-none d-sm-inline">
              Performance dashboard
            </span>
          </div>
          <div className="ms-auto d-flex align-items-center gap-3">
            <span
              className="badge text-uppercase"
              style={{ background: brand.primary, color: badgeFg }}
            >
              {windowLabel}
              {compareLabel ? ` · vs ${compareLabel}` : ""}
            </span>
            <span className="af-header-sub d-none d-md-inline">Powered by ArtForm</span>
          </div>
        </div>
      </header>

      <div className="page-wrapper">
        {/* Sticky range/compare controls. */}
        <div className="sticky-controls d-print-none">
          <div className="container-xl d-flex flex-wrap align-items-center gap-2">
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
            <div className="mb-3">
              <h1 className="page-title mb-1">Performance overview</h1>
              <div className="text-secondary">
                {windowLabel}
                {compareLabel ? ` · compared with ${compareLabel}` : ""} ·{" "}
                {results.length} data source{results.length === 1 ? "" : "s"}
              </div>
            </div>

            {anyMock && (
              <div className="alert mock-banner mb-3" role="alert">
                <strong>Demo data.</strong> One or more sources have no live
                credentials configured — showing deterministic sample metrics. See{" "}
                <code>app/README.md</code> to connect live data.
              </div>
            )}

            <DashboardBody results={results} brand={brand} deltaSuffix={deltaSuffix} />

            <div className="text-secondary text-center mt-4 small">
              {client.name} · {windowLabel} · Updated {updated}
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
