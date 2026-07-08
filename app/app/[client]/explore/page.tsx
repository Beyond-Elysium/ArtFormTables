import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getClientBySlug } from "@/config/clients";
import { semanticConfigured } from "@/lib/semantic";
import { ExploreClient } from "@/components/Explore";

// The Explore UI is fully interactive (client-driven queries via the proxy),
// so this route is dynamic and holds no per-request data itself.
export const dynamic = "force-dynamic";

const DEFAULT_BRAND = { primary: "#426fb6", accent: "#e41679" };
const HEADER_BG = "#333333";

export async function generateMetadata({
  params,
}: {
  params: { client: string };
}): Promise<Metadata> {
  const client = getClientBySlug(params.client);
  return { title: client ? `${client.name} · Explore` : "Dashboard not found" };
}

export default function ExplorePage({ params }: { params: { client: string } }) {
  const client = getClientBySlug(params.client);
  if (!client) notFound();

  const brand = { ...DEFAULT_BRAND, ...client.brand };
  const configured = semanticConfigured();

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
      <header
        className="af-header d-print-none"
        style={{ background: HEADER_BG, borderBottom: `4px solid ${brand.accent}` }}
      >
        <div className="container-xl d-flex align-items-center py-3">
          <div className="d-flex align-items-center">
            <span className="af-header-title">{client.name}</span>
            <span className="af-header-sub ms-3 d-none d-sm-inline">Explore</span>
          </div>
          <div className="ms-auto d-flex align-items-center gap-3">
            <span className="af-header-sub d-none d-md-inline">Powered by ArtForm</span>
          </div>
        </div>
      </header>

      <div className="page-wrapper">
        <div className="sticky-controls d-print-none">
          <div className="container-xl d-flex flex-wrap align-items-center gap-2">
            <Link
              href={`/${client.slug}`}
              className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
            >
              <IconArrowLeft size={16} stroke={2} /> Back to dashboard
            </Link>
            <span className="ms-auto text-secondary small">
              Interactive analysis · cross-filter &amp; drill-down
            </span>
          </div>
        </div>

        <div className="page-body">
          <div className="container-xl">
            <div className="mb-3">
              <h1 className="page-title mb-1">Explore</h1>
              <div className="text-secondary">
                Build a view from the semantic layer — group, measure, filter, and drill down.
              </div>
            </div>

            {configured ? (
              <ExploreClient brand={brand} />
            ) : (
              <div className="card">
                <div
                  className="card-body"
                  style={{ borderLeft: `4px solid ${brand.accent}` }}
                >
                  <h3 className="section-title mb-2">Semantic layer not configured</h3>
                  <p className="text-secondary mb-2">
                    The interactive Explore experience is powered by the ArtForm
                    semantic-layer service. Point the app at it to enable
                    cross-filtering and drill-downs.
                  </p>
                  <p className="text-secondary mb-0">
                    Set <code>SEMANTIC_API_URL</code> (and{" "}
                    <code>SEMANTIC_API_TOKEN</code>) and start the service in{" "}
                    <code>/semantic</code>. See <code>semantic/README</code> for
                    setup.
                  </p>
                </div>
              </div>
            )}
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
