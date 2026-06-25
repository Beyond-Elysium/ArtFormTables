import Link from "next/link";
import { clients } from "@/config/clients";
import { connectorFor } from "@/lib/connectors";

const DEFAULT_ACCENT = "#426fb6";
const HEADER_BG = "#333333";

/**
 * Root landing page — the client index. Each client dashboard lives at /<slug>.
 * Styled to match the dashboard design system (dark header, square cards,
 * ArtForm palette).
 */
export default function Home() {
  return (
    <div className="page">
      <header
        className="af-header"
        style={{ background: HEADER_BG, borderBottom: "4px solid #e41679" }}
      >
        <div className="container-xl d-flex align-items-center py-3">
          <span className="af-header-title">ArtForm</span>
          <span className="af-header-sub ms-3">Client dashboards</span>
        </div>
      </header>

      <div className="page-wrapper">
        <div className="page-body">
          <div className="container-xl">
            <div className="mb-4">
              <h1 className="page-title mb-1">Client dashboards</h1>
              <div className="text-secondary">
                {clients.length} clients · live analytics, one path each
              </div>
            </div>

            <div className="row row-cards">
              {clients.map((c) => {
                const accent = c.brand?.primary ?? DEFAULT_ACCENT;
                const cats = Array.from(
                  new Set(
                    c.sources
                      .map((s) => connectorFor(s.type)?.category)
                      .filter((x): x is string => Boolean(x)),
                  ),
                );
                const shown = cats.slice(0, 4);
                const extra = cats.length - shown.length;
                return (
                  <div className="col-sm-6 col-lg-4" key={c.slug}>
                    <Link
                      href={`/${c.slug}`}
                      className="card card-link card-link-pop h-100"
                      style={{ borderTop: `3px solid ${accent}` }}
                    >
                      <div className="card-body">
                        <div className="d-flex align-items-center">
                          <span className="h3 mb-0">{c.name}</span>
                          <span className="text-secondary ms-auto small">/{c.slug}</span>
                        </div>
                        <div className="text-secondary small mt-1">
                          {c.sources.length} data source{c.sources.length === 1 ? "" : "s"}
                        </div>
                        <div className="mt-2 d-flex flex-wrap gap-1">
                          {shown.map((cat) => (
                            <span className="badge bg-secondary-lt" key={cat}>
                              {cat}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span className="badge bg-secondary-lt">+{extra}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
