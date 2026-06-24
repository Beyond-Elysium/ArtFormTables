import { clients } from "@/config/clients";

/**
 * Apex-domain landing. In production this is what visitors to the root domain
 * (no client subdomain) see. The client list is shown only for convenience in
 * development; in production you may want a plain marketing page here instead.
 */
export default function Home() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const isLocal = rootDomain.includes("localhost");

  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <div className="text-center mb-4">
          <h1 className="page-title" style={{ fontSize: "2.5rem" }}>
            ArtForm Dashboards
          </h1>
          <p className="text-subtitle text-secondary">
            Live analytics, one subdomain per client.
          </p>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Clients</h3>
          </div>
          <div className="list-group list-group-flush">
            {clients.map((c) => {
              const href = isLocal
                ? `http://${c.subdomain}.localhost:3000`
                : `https://${c.subdomain}.${rootDomain}`;
              return (
                <a
                  key={c.subdomain}
                  href={href}
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
                  <span className="text-secondary ms-auto small">
                    {c.subdomain}.{rootDomain}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
