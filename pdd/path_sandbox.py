from pathlib import Path

class SandboxViolation(Exception):
    """Raised when a path is not inside the sandbox root."""


def resolve(root: str | Path, candidate: str) -> Path:
    # MUST NOT accept a null byte anywhere in the candidate
    if "\x00" in candidate:
        raise SandboxViolation("Null bytes are not allowed in path candidates.")

    # MUST NOT accept a candidate whose first path component begins with ~
    cand_path = Path(candidate)
    if cand_path.parts and cand_path.parts[0].startswith("~"):
        raise SandboxViolation("Path components starting with '~' are forbidden.")

    # Resolve the trusted root absolute path
    resolved_root = Path(root).resolve()

    # Combine root and candidate. If candidate is absolute, Path's / operator 
    # correctly overrides the root, landing outside (which we then catch).
    # strict=False allows resolving symlinks of components that exist,
    # without failing if the final file/target does not exist yet.
    resolved_candidate = (resolved_root / cand_path).resolve(strict=False)

    # Check containment using relative_to, which enforces proper path-hierarchical 
    # containment and prevents string prefix-sharing bypasses (e.g. repo vs repo-secrets).
    try:
        resolved_candidate.relative_to(resolved_root)
    except ValueError:
        raise SandboxViolation(
            f"The resolved path '{resolved_candidate}' escapes sandbox root '{resolved_root}'."
        )

    return resolved_candidate


def is_inside(root: str | Path, candidate: str) -> bool:
    try:
        resolve(root, candidate)
        return True
    except SandboxViolation:
        return False