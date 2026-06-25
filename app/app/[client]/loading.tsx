/** Shown while a dashboard (or a new date range) is being fetched. */
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
          </div>
        </div>
      </div>
    </div>
  );
}
