export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-header d-print-none mb-3">
      <div className="row g-2 align-items-center">
        <div className="col">
          <h2 className="page-title">{title}</h2>
          {subtitle ? <div className="text-secondary mt-1">{subtitle}</div> : null}
        </div>
        {action ? <div className="col-auto ms-auto">{action}</div> : null}
      </div>
    </div>
  );
}
