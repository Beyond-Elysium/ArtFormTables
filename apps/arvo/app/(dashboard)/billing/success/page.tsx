import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export default function BillingSuccessPage() {
  return (
    <>
      <PageHeader title="Billing updated" />
      <div className="card">
        <div className="card-body">
          <p className="text-secondary mb-3">
            Your checkout completed successfully. You can keep working in Arvo while
            subscription updates finish processing.
          </p>
          <div className="d-flex gap-2">
            <Link href="/arvo/settings" className="btn btn-primary">
              Back to settings
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
