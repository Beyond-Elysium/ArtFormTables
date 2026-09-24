import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export default function BillingCanceledPage() {
  return (
    <>
      <PageHeader title="Checkout canceled" />
      <div className="card">
        <div className="card-body">
          <p className="text-secondary mb-3">
            No billing changes were made. You can review plans again whenever you are
            ready.
          </p>
          <div className="d-flex gap-2">
            <Link href="/arvo/settings" className="btn btn-primary">
              Return to settings
            </Link>
            <Link href="/arvo" className="btn btn-outline-secondary">
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
