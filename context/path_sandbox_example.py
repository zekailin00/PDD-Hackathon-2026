import os
import sys
from pathlib import Path

# Ensure the module can be imported if not in the current PYTHONPATH
# This allows the example to find path_sandbox.py in its sibling/parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pdd.path_sandbox import resolve, is_inside, SandboxViolation

def main():
    """
    This example demonstrates how to use the path_sandbox module to safely 
    resolve file paths within a restricted directory (sandbox).
    """
    # 1. Setup a dummy root for the demonstration
    # In a real scenario, this would be your repository root
    root_dir = Path("temp_sandbox_root").resolve()
    root_dir.mkdir(exist_ok=True)

    print(f"Sandbox Root: {root_dir}\n")

    # List of candidate paths to test against the sandbox
    test_cases = [
        ("Safe relative path", "app/main.py"),
        ("Path with internal traversal", "./docs/../app/utils.py"),
        ("The root itself", "."),
        ("Dangerous escape attempt", "../../etc/passwd"),
        ("Absolute path (outside)", "/etc/hosts"),
        ("Null byte injection", "malicious\0file.txt"),
        ("Prefix mismatch", "../temp_sandbox_root-secrets/key.txt"),
    ]

    for description, candidate in test_cases:
        print(f"--- Case: {description} ---")
        print(f"Input: '{candidate}'")
        
        # Use is_inside for a boolean check without exception handling
        allowed = is_inside(root_dir, candidate)
        print(f"Is inside sandbox? {allowed}")

        try:
            # Use resolve to get the actual absolute Path object
            # This will raise SandboxViolation if the path escapes the root
            resolved_path = resolve(root_dir, candidate)
            print(f"Resolved Path: {resolved_path}")
        except SandboxViolation as e:
            print(f"Access Denied: {e}")
        
        print() # Newline for readability

    # Clean up dummy directory
    try:
        root_dir.rmdir()
    except OSError:
        pass

if __name__ == "__main__":
    main()

"""
How to use path_sandbox:

1. resolve(root: str | Path, candidate: str) -> Path
   - root: The trusted base directory (the 'sandbox').
   - candidate: The potentially untrusted path string provided by a user or agent.
   - Returns: An absolute Path object that has been resolved (symlinks followed, '..' removed).
   - Raises: SandboxViolation if the candidate points anywhere outside the root.

2. is_inside(root: str | Path, candidate: str) -> bool
   - Same parameters as resolve.
   - Returns: True if the path is safe to access, False otherwise.

Security Features:
- Prevents Directory Traversal (../../)
- Rejects Absolute Paths pointing outside the root.
- Follows Symlinks: Even if a symlink exists inside the root, if it points 
  outside, it will be rejected.
- Prevents Prefix Collisions: Ensures /repo-secrets isn't confused with /repo.
- Rejects Null Bytes: Blocks common OS-level path injection attacks.
"""