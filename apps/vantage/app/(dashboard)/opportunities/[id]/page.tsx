import Link from "next/link";
import { IconAddressBook, IconFileText, IconUsersGroup } from "@tabler/icons-react";
import { PageHeader } from "@/components/PageHeader";

// TODO(db + sync): this detail view is a static shell keyed off the route's
// [id] param — real opportunity records, contacts, and competitor history
// land once the concurrent Prisma schema and sync work merge in.

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <PageHeader
        title={`Opportunity ${id}`}
        subtitle="Full detail for a single tracked opportunity."
        action={
          <Link href="/opportunities" className="btn btn-outline-secondary">
            Back to feed
          </Link>
        }
      />

      <div className="row row-deck row-cards">
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Overview</h3>
            </div>
            <div className="empty py-5">
              <div className="empty-icon">
                <IconFileText size={40} stroke={1.5} />
              </div>
              <p className="empty-title">Not synced yet</p>
              <p className="empty-subtitle text-secondary">
                Solicitation details, description, NAICS, agency, response
                date, and fit score breakdown will render here once this
                opportunity is synced from SAM.gov / USASpending.
              </p>
            </div>
          </div>

          <div className="card mt-3">
            <div className="card-header">
              <h3 className="card-title">Competitive History</h3>
            </div>
            <div className="empty py-4">
              <div className="empty-icon">
                <IconUsersGroup size={36} stroke={1.5} />
              </div>
              <p className="empty-title">No award history yet</p>
              <p className="empty-subtitle text-secondary">
                Incumbent and competitor award history for this requirement
                will appear here.
              </p>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Key Contacts</h3>
            </div>
            <div className="empty py-4">
              <div className="empty-icon">
                <IconAddressBook size={36} stroke={1.5} />
              </div>
              <p className="empty-title">No contacts yet</p>
              <p className="empty-subtitle text-secondary">
                Contracting officers and program contacts for this
                opportunity will show up here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
