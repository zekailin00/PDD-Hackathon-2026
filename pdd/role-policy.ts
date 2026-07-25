export const POWERS = ["run", "steer", "halt", "edit_intent", "vote", "open_pr"] as const;
export type Power = typeof POWERS[number];
export type Role = "pm" | "eng" | "design" | "qa" | "observer";
export type RoleEntry = Record<Power, boolean> & { priority: number };
export type RoleOverrides = Partial<Record<Role, Partial<RoleEntry>>>;

export const DEFAULT_POLICY: Record<Role, RoleEntry> = {
  pm: { run: true, steer: true, halt: true, edit_intent: true, vote: true, open_pr: true, priority: 80 },
  eng: { run: true, steer: true, halt: true, edit_intent: true, vote: true, open_pr: true, priority: 70 },
  qa: { run: true, steer: true, halt: true, edit_intent: false, vote: true, open_pr: true, priority: 60 },
  design: { run: true, steer: true, halt: false, edit_intent: true, vote: true, open_pr: false, priority: 50 },
  observer: { run: false, steer: true, halt: false, edit_intent: false, vote: false, open_pr: false, priority: 10 },
};

function safeRole(role: string): Role {
  return role in DEFAULT_POLICY ? role as Role : "observer";
}

export function resolveRole(role: string, overrides: RoleOverrides = {}): RoleEntry {
  const safe = safeRole(role);
  const patch = overrides[safe] ?? {};
  const result = { ...DEFAULT_POLICY[safe] };
  for (const power of POWERS) {
    if (typeof patch[power] === "boolean") result[power] = patch[power]!;
  }
  if (Number.isInteger(patch.priority)) result.priority = patch.priority!;
  return result;
}

export function can(role: string, power: Power, overrides: RoleOverrides = {}): boolean {
  if (!POWERS.includes(power)) throw new RangeError(`Unknown power: ${power}`);
  return resolveRole(role, overrides)[power];
}

export function voters(
  participants: { userId: string; role: string }[],
  overrides: RoleOverrides = {},
): string[] {
  return [...new Set(participants.filter((p) => can(p.role, "vote", overrides)).map((p) => p.userId))].sort();
}

export function outranks(a: string, b: string, overrides: RoleOverrides = {}): boolean {
  return resolveRole(a, overrides).priority > resolveRole(b, overrides).priority;
}
