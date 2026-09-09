// Budget Allocation Calculator — splits a scenario's total budget across
// platforms proportional to score, subject to a $500/platform floor. Pure:
// no I/O, just arithmetic over the inputs given.

export const ELIGIBILITY_THRESHOLD = 40;
export const PLATFORM_FLOOR = 500;

export interface BudgetAllocationCandidate {
  platform: string;
  score: number;
  /// Forces inclusion regardless of score (still subject to the $500 floor
  /// and to proportional sharing using its actual score as weight).
  required?: boolean;
}

export interface BudgetAllocation {
  platform: string;
  amount: number;
}

export interface BudgetAllocationOptions {
  threshold?: number;
  floor?: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function allocateBudget(
  totalBudget: number,
  platforms: BudgetAllocationCandidate[],
  options: BudgetAllocationOptions = {},
): BudgetAllocation[] {
  const threshold = options.threshold ?? ELIGIBILITY_THRESHOLD;
  const floor = options.floor ?? PLATFORM_FLOOR;

  const eligible = platforms.filter((p) => p.required || p.score >= threshold);
  if (eligible.length === 0 || totalBudget <= 0) {
    return eligible.map((p) => ({ platform: p.platform, amount: 0 }));
  }

  const allocations = new Map<string, number>();
  let remainingBudget = totalBudget;
  let pool = eligible.map((p) => ({ platform: p.platform, weight: Math.max(p.score, 0) }));

  while (pool.length > 0) {
    // If even the floor can't be honored for everyone left, there's nothing
    // left to iterate toward — split what remains (proportionally, or
    // evenly if every remaining weight is zero) and stop. This is the "too
    // small a budget" edge case: nobody past this point reaches $500.
    if (pool.length * floor > remainingBudget) {
      const weightSum = pool.reduce((sum, p) => sum + p.weight, 0);
      for (const p of pool) {
        const share = weightSum > 0 ? p.weight / weightSum : 1 / pool.length;
        allocations.set(p.platform, remainingBudget * share);
      }
      remainingBudget = 0;
      pool = [];
      break;
    }

    const weightSum = pool.reduce((sum, p) => sum + p.weight, 0);
    const proportional = pool.map((p) => ({
      platform: p.platform,
      weight: p.weight,
      amount: weightSum > 0 ? remainingBudget * (p.weight / weightSum) : remainingBudget / pool.length,
    }));

    const belowFloor = proportional.filter((p) => p.amount < floor);
    if (belowFloor.length === 0) {
      for (const p of proportional) allocations.set(p.platform, p.amount);
      remainingBudget = 0;
      pool = [];
      break;
    }

    // Fix the below-floor platforms at the floor and remove them from the
    // pool, then re-run proportional allocation on what's left with the
    // reduced budget. Iterating (rather than floor-then-normalize in one
    // pass) is what keeps the grand total from overshooting: floored
    // amounts are locked in, only the remainder is ever re-divided, and
    // fixing one platform can push another below the floor in the next
    // pass, so this must repeat until a pass floors nobody.
    for (const p of belowFloor) {
      allocations.set(p.platform, floor);
      remainingBudget -= floor;
    }
    const flooredPlatforms = new Set(belowFloor.map((p) => p.platform));
    pool = pool.filter((p) => !flooredPlatforms.has(p.platform));
  }

  const rounded = eligible.map((p) => ({
    platform: p.platform,
    amount: round2(allocations.get(p.platform) ?? 0),
  }));

  // Reconcile penny-level rounding drift onto the largest allocation so the
  // total lands on totalBudget exactly, not just "within a cent".
  const sum = round2(rounded.reduce((s, r) => s + r.amount, 0));
  const diff = round2(totalBudget - sum);
  if (diff !== 0 && rounded.length > 0) {
    let largestIndex = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i].amount > rounded[largestIndex].amount) largestIndex = i;
    }
    rounded[largestIndex].amount = round2(rounded[largestIndex].amount + diff);
  }

  return rounded;
}
