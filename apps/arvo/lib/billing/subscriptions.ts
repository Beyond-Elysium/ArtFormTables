import type { TierId } from "./tiers";

export interface WorkspaceSubscriptionUpdate {
  workspaceId: string;
  tierId: TierId;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
}

// TODO(db): the Prisma schema (owned by another in-flight agent) is expected
// to add a `WorkspaceSubscription` model with columns:
//   workspace_id, tier_id, stripe_customer_id, stripe_subscription_id,
//   status, current_period_end
// Once that model + a wired-up Prisma client exist, replace this stub with a
// real `prisma.workspaceSubscription.upsert(...)` keyed on workspace_id. Until
// then, the webhook route below calls this function so its event parsing and
// routing logic is exercised and correct even though nothing is persisted.
export async function upsertWorkspaceSubscription(
  update: WorkspaceSubscriptionUpdate,
): Promise<void> {
  console.log("[billing/subscriptions] upsertWorkspaceSubscription (stub, not persisted):", update);
}
