/** Shown while a dashboard (or a new date range) is being fetched. Mirrors the
 * real page shape — KPI grid, then a chart, then a table — so the swap in is
 * less jarring. */
export default function Loading() {
  return (
    <div className="page-wrapper">
      <div className="page-body">
        <div className="container-xl">
          <div className="row row-cards">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="col-sm-6 col-lg-3" key={i}>
                <div className="card card-sm">
                  <div className="card-body">
                    <div className="placeholder-glow">
                      <div className="placeholder col-6 mb-3" />
                      <div className="placeholder col-9" style={{ height: 28 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Chart-shaped block. */}
            <div className="col-12">
              <div className="card">
                <div className="card-body">
                  <div className="placeholder-glow mb-3">
                    <div className="placeholder col-3" />
                  </div>
                  <div className="chart-skeleton" style={{ height: 300 }} />
                </div>
              </div>
            </div>

            {/* Table-shaped block. */}
            <div className="col-12">
              <div className="card">
                <div className="card-body">
                  <div className="placeholder-glow mb-3">
                    <div className="placeholder col-3" />
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div className="placeholder-glow border-top py-2" key={i}>
                      <div className="d-flex align-items-center gap-3">
                        <div className="placeholder col-5" />
                        <div className="placeholder col-2 ms-auto" />
                        <div className="placeholder col-1" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
