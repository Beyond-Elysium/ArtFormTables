import { IconUsersGroup } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db + sync): award history is derived from USASpending sync — real
// rows land once the concurrent Prisma schema and sync work merge in.

const columns = ["Competitor", "Recent Awards", "Total Value", "Primary NAICS", "Agencies"];

export default function CompetitorsPage() {
  return (
    <>
      <PageHeader
        title="Competitive Landscape"
        subtitle="Competitor activity and award history across your tracked market."
      />
      <div className="card">
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
                      <IconUsersGroup size={48} stroke={1.5} />
                    </div>
                    <p className="empty-title">No competitor data yet</p>
                    <p className="empty-subtitle text-secondary">
                      Award history populates once the USASpending sync is
                      connected in Settings.
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
