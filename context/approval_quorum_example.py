import sys
import os

# Dynamic path resolution to find the module 'approval_quorum'
# This allows the example to run from various environments relative to the project root
current_dir = os.path.dirname(os.path.abspath(__file__))
# Navigate up one directory to access the parent/sibling modules if needed
parent_dir = os.path.abspath(os.path.join(current_dir, ".."))
sys.path.insert(0, parent_dir)

from pdd.approval_quorum import evaluate


def run_examples():
    """
    Demonstrates how to use the `approval_quorum.evaluate` function
    to determine if a proposal can be converted into a pull request.
    """
    # Define the list of members in the room
    members = ["alice", "bob", "charlie"]

    # 1. SCENARIO A: Unanimous Policy (Default)
    # Bob has approved, but Alice hasn't voted yet, and Charlie's latest vote is an approval.
    votes_scenario_a = [
        {"user_id": "bob", "verdict": "approve"},
        {"user_id": "charlie", "verdict": "request_changes"},  # Charlie initially blocked
        {"user_id": "charlie", "verdict": "approve"},          # Charlie changed their mind
    ]

    print("--- Scenario A: Unanimous Policy (Waiting on Alice) ---")
    result_a = evaluate(members=members, votes=votes_scenario_a, policy="unanimous")
    print(f"Can open PR? {result_a['can_open_pr']}")
    print(f"Approved by: {result_a['approved_by']}")
    print(f"Waiting on:  {result_a['waiting_on']}")
    print(f"Reason:      {result_a['reason']}\n")

    # 2. SCENARIO B: Majority Policy with a Veto
    # Under majority policy, 2 out of 3 approvals would normally suffice.
    # However, a 'request_changes' verdict acts as a veto and blocks the PR.
    votes_scenario_b = [
        {"user_id": "alice", "verdict": "approve"},
        {"user_id": "bob", "verdict": "approve"},
        {"user_id": "charlie", "verdict": "request_changes"},  # Veto!
    ]

    print("--- Scenario B: Majority Policy with a Veto ---")
    result_b = evaluate(members=members, votes=votes_scenario_b, policy="majority")
    print(f"Can open PR? {result_b['can_open_pr']}")
    print(f"Approved by: {result_b['approved_by']}")
    print(f"Blocked by:  {result_b['blocked_by']}")
    print(f"Reason:      {result_b['reason']}\n")


if __name__ == "__main__":
    run_examples()