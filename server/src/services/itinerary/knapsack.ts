/**
 * Time-constrained selection.
 *
 * Choosing which artworks to see in a fixed number of minutes is a 0/1
 * knapsack: each candidate has a value (its recommendation score) and a cost
 * (its estimated dwell time), and the visit cannot exceed the budget.
 *
 * This is solved exactly, by dynamic programming over integer minutes. The
 * inputs are small -- around 80 candidates against a budget under ten hours --
 * so the O(n * budget) table is a few tens of thousands of cells and runs in
 * well under a millisecond. A greedy value-per-minute pass would be faster
 * still but can be arbitrarily worse, and "the plan skipped the best thing in
 * the museum" is exactly the failure a visitor would notice.
 *
 * Diversity constraints are *not* handled here. Adding per-artist and
 * per-department caps turns this into a multi-dimensional knapsack, which is
 * NP-hard and no longer solvable exactly at this size. The caps are applied by
 * pre-filtering the candidate set instead, so this stage stays optimal over
 * whatever it is given. See `itineraryService.selectCandidates`.
 */

export interface KnapsackItem {
  id: string;
  /** Higher is better. Any non-negative scale works. */
  value: number;
  /** Whole minutes. Must be a positive integer. */
  cost: number;
}

export interface KnapsackResult<T extends KnapsackItem> {
  items: T[];
  totalValue: number;
  totalCost: number;
}

export function solveKnapsack<T extends KnapsackItem>(
  candidates: T[],
  budget: number,
): KnapsackResult<T> {
  const usable = candidates.filter(
    (item) => item.cost > 0 && item.cost <= budget && item.value > 0,
  );

  if (usable.length === 0 || budget <= 0) {
    return { items: [], totalValue: 0, totalCost: 0 };
  }

  const capacity = Math.floor(budget);
  const count = usable.length;

  // Values are floats, so the table holds numbers rather than integers.
  // Row `i` is the best achievable value using the first `i` candidates.
  const table: Float64Array[] = Array.from(
    { length: count + 1 },
    () => new Float64Array(capacity + 1),
  );

  for (let i = 1; i <= count; i += 1) {
    const item = usable[i - 1] as T;
    const previous = table[i - 1] as Float64Array;
    const current = table[i] as Float64Array;

    for (let remaining = 0; remaining <= capacity; remaining += 1) {
      const withoutItem = previous[remaining] as number;

      if (item.cost > remaining) {
        current[remaining] = withoutItem;
        continue;
      }

      const withItem = (previous[remaining - item.cost] as number) + item.value;
      current[remaining] = withItem > withoutItem ? withItem : withoutItem;
    }
  }

  // Walk the table backwards to recover which candidates were taken.
  const chosen: T[] = [];
  let remaining = capacity;

  for (let i = count; i > 0; i -= 1) {
    const previous = table[i - 1] as Float64Array;
    const current = table[i] as Float64Array;

    if (current[remaining] !== previous[remaining]) {
      const item = usable[i - 1] as T;
      chosen.push(item);
      remaining -= item.cost;
    }
  }

  chosen.reverse();

  return {
    items: chosen,
    totalValue: chosen.reduce((sum, item) => sum + item.value, 0),
    totalCost: chosen.reduce((sum, item) => sum + item.cost, 0),
  };
}
