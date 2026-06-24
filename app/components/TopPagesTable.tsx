import type { TopPage } from "@/lib/ga";
import { formatNumber } from "@/lib/format";

export function TopPagesTable({ pages }: { pages: TopPage[] }) {
  return (
    <div className="table-responsive">
      <table className="table table-vcenter card-table">
        <thead>
          <tr>
            <th>Page</th>
            <th className="text-end">Views</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.path}>
              <td>
                <div className="fw-bold">{p.title}</div>
                <div className="text-secondary small">{p.path}</div>
              </td>
              <td className="text-end">{formatNumber(p.views)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
