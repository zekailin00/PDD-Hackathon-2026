export type Contribution = { userId: string; weight: number };
export type SplitMode = "weighted" | "equal" | "initiator";

export function splitTokens(
  totalTokens: number,
  contributions: Contribution[],
  mode: SplitMode = "weighted",
): Record<string, number> {
  if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) {
    throw new RangeError("totalTokens must be a non-negative safe integer");
  }
  const weights = new Map<string, number>();
  for (const item of contributions) {
    if (!item.userId || !Number.isFinite(item.weight) || item.weight < 0) {
      throw new TypeError("contributions require a userId and non-negative weight");
    }
    weights.set(item.userId, (weights.get(item.userId) ?? 0) + item.weight);
  }
  if (!["weighted", "equal", "initiator"].includes(mode)) throw new RangeError(`Unknown mode: ${mode}`);
  if (weights.size === 0) return {};

  const entries = [...weights.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (mode === "initiator") {
    const initiator = contributions[0]?.userId;
    return Object.fromEntries(entries.map(([userId]) => [userId, userId === initiator ? totalTokens : 0]));
  }
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const effective = mode === "equal" || totalWeight === 0
    ? entries.map(([userId]) => [userId, 1] as const)
    : entries;
  const denominator = effective.reduce((sum, [, weight]) => sum + weight, 0);
  const rows = effective.map(([userId, weight]) => {
    const exact = totalTokens * weight / denominator;
    return { userId, floor: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = totalTokens - rows.reduce((sum, row) => sum + row.floor, 0);
  rows.sort((a, b) => b.fraction - a.fraction || a.userId.localeCompare(b.userId));
  for (let index = 0; remainder > 0; index = (index + 1) % rows.length) {
    rows[index].floor += 1;
    remainder -= 1;
  }
  return Object.fromEntries(
    rows.sort((a, b) => a.userId.localeCompare(b.userId)).map((row) => [row.userId, row.floor]),
  );
}
