"""
Example demonstrating how to use the model_router module to select the best
eligible AI model from a catalog based on task difficulty and preferences.
"""

import os
import sys

# Dynamic path resolution to allow importing from the sibling 'pdd' package
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from pdd.model_router import choose, eligible, NoEligibleModel
except ImportError:
    # Fallback for alternative execution environments
    from pdd.model_router import choose, eligible, NoEligibleModel


# 1. Define a mock TokenRouter catalog
mock_catalog = [
    {
        "id": "anthropic/claude-opus-5",
        "supported_endpoint_types": ["anthropic"],
        "tags": "Text, Tools",
    },
    {
        "id": "anthropic/claude-opus-5-fast",
        "supported_endpoint_types": ["anthropic"],
        "tags": "Text, Tools",
    },
    {
        "id": "anthropic/claude-sonnet-5",
        "supported_endpoint_types": ["anthropic"],
        "tags": "Text, Tools",
    },
    {
        "id": "anthropic/claude-haiku-4.5",
        "supported_endpoint_types": ["anthropic-compatible"],
        "tags": "Text",
    },
    {
        "id": "google/gemini-3.5-flash",
        "supported_endpoint_types": ["openai-compatible"],  # Not eligible
        "tags": "Text",
    },
    {
        "id": "openai/gpt-5-image-mini",
        "supported_endpoint_types": ["anthropic"],
        "tags": "Image, Text",  # Not eligible (contains "Image")
    },
]


def run_example():
    print("--- 1. Filtering Eligible Models ---")
    eligible_list = eligible(mock_catalog)
    print("Eligible models:")
    for model in eligible_list:
        print(f"  - {model['id']}")

    print("\n--- 2. Routing by Difficulty ---")
    for difficulty in ("cheap", "standard", "hard"):
        selection = choose(mock_catalog, difficulty=difficulty)
        print(f"Difficulty: {difficulty.upper()}")
        print(f"  Selected: {selection['model']}")
        print(f"  Reason:   {selection['reason']}")
        print(f"  Tier:     {selection['tier']}\n")

    print("--- 3. Direct Preference Selection ---")
    # Choosing an eligible preferred model
    pref_selection = choose(
        mock_catalog, prefer="anthropic/claude-haiku-4.5", difficulty="hard"
    )
    print("Preferred & Eligible:")
    print(f"  Selected: {pref_selection['model']}")
    print(f"  Reason:   {pref_selection['reason']}\n")

    # Trying to choose an ineligible preferred model (falls back gracefully)
    fallback_selection = choose(
        mock_catalog, prefer="openai/gpt-5-image-mini", difficulty="hard"
    )
    print("Preferred but Ineligible (Fallback):")
    print(f"  Selected: {fallback_selection['model']}")
    print(f"  Reason:   {fallback_selection['reason']}\n")

    print("--- 4. Error Handling (Empty Catalog) ---")
    try:
        choose([], difficulty="standard")
    except NoEligibleModel as e:
        print(f"Caught expected exception: {e}")


if __name__ == "__main__":
    run_example()