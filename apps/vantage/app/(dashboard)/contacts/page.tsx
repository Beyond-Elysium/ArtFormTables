import { IconAddressBook } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db + sync): contacts are extracted from synced opportunities — real
// rows land once the concurrent Prisma schema and sync work merge in.

const columns = ["Name", "Title", "Agency", "Opportunities", "Last Seen"];

export default function ContactsPage() {
  return (
    <>
      <PageHeader
        title="Contact Intelligence"
        subtitle="Key contacts across every opportunity you're tracking."
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
                      <IconAddressBook size={48} stroke={1.5} />
                    </div>
                    <p className="empty-title">No contacts yet</p>
                    <p className="empty-subtitle text-secondary">
                      Contracting officers and program contacts are pulled
                      from tracked opportunities once syncing is connected.
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
