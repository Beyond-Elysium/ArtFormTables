import { IconTargetArrow } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db + sync): filters below are static placeholders — real agency/NAICS
// options and live rows land once the concurrent Prisma schema and
// SAM.gov/USASpending sync work merge in.

const columns = [
  "Title",
  "Agency",
  "NAICS",
  "Est. Value",
  "Response Date",
  "Fit Score",
  "Status",
];

export default function OpportunitiesPage() {
  return (
    <>
      <PageHeader
        title="Opportunity Feed"
        subtitle="Full filterable, sortable list of tracked market opportunities."
      />
      <div className="card">
        <div className="card-header">
          <div className="row g-2 w-100 align-items-center">
            <div className="col-md-4">
              <input
                type="search"
                className="form-control"
                placeholder="Search opportunities…"
                disabled
              />
            </div>
            <div className="col-md-3">
              <select className="form-select" disabled defaultValue="">
                <option value="">All agencies</option>
              </select>
            </div>
            <div className="col-md-3">
              <select className="form-select" disabled defaultValue="">
                <option value="">All NAICS codes</option>
              </select>
            </div>
            <div className="col-md-2">
              <select className="form-select" disabled defaultValue="">
                <option value="">Sort by fit score</option>
              </select>
            </div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-vcenter card-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <div className="empty py-5">
                    <div className="empty-icon">
                      <IconTargetArrow size={48} stroke={1.5} />
                    </div>
                    <p className="empty-title">No opportunities tracked yet</p>
                    <p className="empty-subtitle text-secondary">
                      Opportunities appear here once the SAM.gov / USASpending
                      sync is connected in Settings.
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
