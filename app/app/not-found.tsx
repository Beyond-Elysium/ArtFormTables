export default function NotFound() {
  return (
    <div className="page page-center">
      <div className="container container-tight py-4 text-center">
        <h1 className="page-title" style={{ fontSize: "3rem" }}>
          404
        </h1>
        <p className="text-subtitle text-secondary">
          No dashboard exists for this address.
        </p>
        <p className="text-secondary">
          Check the subdomain, or contact ArtForm if you think this is a mistake.
        </p>
      </div>
    </div>
  );
}
