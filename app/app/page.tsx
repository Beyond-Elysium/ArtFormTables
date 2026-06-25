import Link from "next/link";
import { clients } from "@/config/clients";

/**
 * Root landing page. This is what visitors to the bare domain see. The client
 * list is shown for convenience; in production you may want a plain marketing
 * page here instead. Each client dashboard lives at /<slug>.
 */
export default function Home() {
  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <div className="text-center mb-4">
          <h1 className="page-title" style={{ fontSize: "2.5rem" }}>
            ArtForm Dashboards
          </h1>
          <p className="text-subtitle text-secondary">
            Live analytics, one path per client.
          </p>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Clients</h3>
          </div>
          <div className="list-group list-group-flush">
            {clients.map((c) => (
              <Link
                key={c.slug}
                href={`/${c.slug}`}
                className="list-group-item list-group-item-action d-flex align-items-center"
              >
                <span
                  className="badge me-3"
                  style={{
                    background: c.brand?.primary ?? "#426fb6",
                    width: 12,
                    height: 12,
                    borderRadius: 0,
                  }}
                />
                <span className="fw-bold">{c.name}</span>
                <span className="text-secondary ms-auto small">/{c.slug}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
