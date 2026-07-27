export type Vote = { userId: string; verdict: "approve" | "request_changes" };
export type QuorumPolicy = "unanimous" | "majority";
export type QuorumResult = {
  approved: boolean;
  approvedBy: string[];
  rejectedBy: string[];
  waitingOn: string[];
  reason: string;
};

export function evaluateQuorum(
  members: string[],
  votes: Vote[],
  policy: QuorumPolicy = "unanimous",
): QuorumResult {
  if (!["unanimous", "majority"].includes(policy)) throw new RangeError(`Unknown policy: ${policy}`);
  const electorate = [...new Set(members)].sort();
  const allowed = new Set(electorate);
  const latest = new Map<string, Vote["verdict"]>();
  for (const vote of votes) {
    if (!["approve", "request_changes"].includes(vote.verdict)) throw new RangeError(`Unknown verdict: ${vote.verdict}`);
    if (allowed.has(vote.userId)) latest.set(vote.userId, vote.verdict);
  }
  const approvedBy = electorate.filter((id) => latest.get(id) === "approve");
  const rejectedBy = electorate.filter((id) => latest.get(id) === "request_changes");
  const waitingOn = electorate.filter((id) => !latest.has(id));
  const threshold = Math.floor(electorate.length / 2) + 1;
  const enough = policy === "unanimous"
    ? electorate.length > 0 && approvedBy.length === electorate.length
    : approvedBy.length >= threshold;
  const approved = rejectedBy.length === 0 && enough;
  const reason = rejectedBy.length > 0
    ? `Blocked by ${rejectedBy.length} request-changes vote(s).`
    : approved
      ? `${policy} approval reached.`
      : `Waiting for ${waitingOn.length} eligible voter(s).`;
  return { approved, approvedBy, rejectedBy, waitingOn, reason };
}
