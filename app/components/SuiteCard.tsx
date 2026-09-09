import type { SuiteProduct } from "@/config/suite";

/**
 * Links out to the ArtForm Intelligence Suite products from ArtForm's own
 * dashboard. Only rendered for the "artform" client — these are internal
 * tools, not something a client dashboard should surface.
 */
export function SuiteCard({ products }: { products: SuiteProduct[] }) {
  return (
    <div className="card mb-3 d-print-none">
      <div className="card-header">
        <h3 className="card-title">ArtForm Intelligence Suite</h3>
      </div>
      <div className="card-body">
        <div className="row row-cards">
          {products.map((product) => (
            <div className="col-sm-6 col-lg-3" key={product.slug}>
              <div className="card card-sm h-100">
                <div className="card-body d-flex flex-column">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <div className="fw-bold">{product.name}</div>
                    <span
                      className={`badge ${product.status === "live" ? "bg-green-lt" : "bg-secondary-lt"}`}
                    >
                      {product.status === "live" ? "Live" : "Coming soon"}
                    </span>
                  </div>
                  <p className="text-secondary small mb-3 flex-grow-1">{product.tagline}</p>
                  {product.status === "live" ? (
                    <a
                      href={product.href}
                      className="btn btn-primary btn-sm w-100"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open {product.name}
                    </a>
                  ) : (
                    <button type="button" className="btn btn-outline-secondary btn-sm w-100" disabled>
                      Not yet launched
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
