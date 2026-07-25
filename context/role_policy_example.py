"""
Example demonstrating the usage of the role_policy module in the CoPrompt system.

This script showcases how to check role permissions, apply policy overrides,
resolve full policies, determine voter lists, and compare role priorities.
"""

import os
import sys

# Ensure the directory containing 'role_policy' is in the Python path.
# Assuming the module is located relative to this example script's directory.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../pdd")))

import role_policy

def main():
    # 1. Resolving policies
    print("--- 1. Resolving Policies ---")
    # Resolving a standard role
    qa_policy = role_policy.resolve("qa")
    print(f"QA default 'vote' power: {qa_policy['vote']}")  # True
    print(f"QA default 'edit_intent' power: {qa_policy['edit_intent']}")  # False

    # Unknown roles default to the 'observer' policy layout
    unknown_policy = role_policy.resolve("guest_user")
    print(f"Unknown role 'vote' power: {unknown_policy['vote']}")  # False
    print(f"Unknown role priority: {unknown_policy['priority']}")  # 10
    print()

    # 2. Checking specific powers using 'can'
    print("--- 2. Checking Powers ('can') ---")
    # Design cannot halt by default
    print(f"Can design halt by default? {role_policy.can('design', 'halt')}")  # False

    # We can override permissions dynamically
    custom_overrides = {
        "design": {"halt": True, "priority": 55}
    }
    print(f"Can design halt with overrides? {role_policy.can('design', 'halt', custom_overrides)}")  # True
    print()

    # 3. Handling unknown powers (ValueErrors)
    print("--- 3. Error Handling ---")
    try:
        role_policy.can("pm", "teleport")
    except ValueError as e:
        print(f"Caught expected error: {e}")
    print()

    # 4. Extracting voters for approval quorums
    print("--- 4. Extracting Voters ---")
    participants = [
        {"user_id": "amy", "role": "pm"},
        {"user_id": "zed", "role": "observer"},
        {"user_id": "joe", "role": "qa"},
        {"user_id": "amy", "role": "pm"}  # Duplicate entry to show deduplication
    ]
    # Observers do not vote, duplicates are removed, list is sorted alphabetically
    voters_list = role_policy.voters(participants)
    print(f"Eligible voters: {voters_list}")  # ['amy', 'joe']
    print()

    # 5. Comparing role priority using 'outranks'
    print("--- 5. Comparing Priorities ('outranks') ---")
    print(f"Does PM outrank Design? {role_policy.outranks('pm', 'design')}")  # True (80 > 50)
    
    # Overrides can flip priority rankings
    priority_overrides = {
        "qa": {"priority": 99}
    }
    print(f"Does QA outrank PM with overrides? {role_policy.outranks('qa', 'pm', priority_overrides)}")  # True (99 > 80)

if __name__ == "__main__":
    main()