"""
Example usage of the token_split module.

This script demonstrates how to allocate shared AI session tokens among multiple
participants using different allocation modes:
- "weighted": Allocation based on each participant's prompt weights.
- "equal": Even distribution among all active participants.
- "initiator": Charging all tokens to the user who started the session.

Input parameters for split_tokens:
    total_tokens (int): Non-negative total tokens consumed.
    contributions (list[dict]): List of dictionaries with structure:
        {"user_id": str, "weight": float}. The first element is the initiator.
    mode (str, optional): Allocation strategy ("weighted", "equal", "initiator").
                          Defaults to "weighted".

Output:
    dict[str, int]: A dictionary mapping each unique user_id to their allocated integer tokens.
                    Guarantees sum(output.values()) == total_tokens.
"""

import os
import sys

# Dynamic path resolution to find the 'pdd' directory relative to this script
# Structure:
#   project_root/
#     ├── pdd/
#     │    └── token_split.py
#     └── context/
#          └── token_split_example.py
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
pdd_path = os.path.join(project_root, "pdd")

if pdd_path not in sys.path:
    sys.path.append(pdd_path)

from token_split import split_tokens


def main():
    # 1. Prepare sample user contributions
    # 'amy' is the session initiator (first in list)
    contributions = [
        {"user_id": "amy", "weight": 3.0},
        {"user_id": "joe", "weight": 1.0},
        {"user_id": "kai", "weight": 1.0},
    ]
    
    total_tokens = 100

    print(f"Total tokens to split: {total_tokens}")
    print(f"Contributions: {contributions}\n")

    # --- Mode 1: Weighted Split (Default) ---
    # Calculates exact weights. Resolves remainders deterministically.
    # Amy (3/5 -> 60 tokens), Joe (1/5 -> 20 tokens), Kai (1/5 -> 20 tokens)
    weighted_split = split_tokens(total_tokens, contributions, mode="weighted")
    print("1. Weighted mode (default):")
    print(f"   Result: {weighted_split}\n")

    # --- Mode 2: Equal Split ---
    # Ignores weights and splits evenly.
    # 100 / 3 = 33.333... floored to 33.
    # The 1 leftover token is awarded based on alphabetical/user_id tie-breaking: "amy" gets 34.
    equal_split = split_tokens(total_tokens, contributions, mode="equal")
    print("2. Equal mode (weights ignored, remainders distributed deterministically):")
    print(f"   Result: {equal_split}\n")

    # --- Mode 3: Initiator Split ---
    # Charges everything to the first contributor in the list ("amy")
    initiator_split = split_tokens(total_tokens, contributions, mode="initiator")
    print("3. Initiator mode:")
    print(f"   Result: {initiator_split}\n")

    # --- Edge Case: Zero Weight Fallback ---
    # When all weights are 0, it falls back to an even split
    zero_weights = [
        {"user_id": "amy", "weight": 0.0},
        {"user_id": "joe", "weight": 0.0},
    ]
    zero_weight_split = split_tokens(10, zero_weights, mode="weighted")
    print("4. Zero weights fallback:")
    print(f"   Result: {zero_weight_split}\n")

    # --- Error Handling ---
    try:
        split_tokens(-50, contributions)
    except ValueError as e:
        print(f"5. Error Handled (negative tokens): {e}")

    try:
        split_tokens(100, contributions, mode="invalid_mode")
    except ValueError as e:
        print(f"6. Error Handled (invalid mode): {e}")


if __name__ == "__main__":
    main()