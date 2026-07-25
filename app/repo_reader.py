"""Read-only view of the codebase.

The agent may read and search, and it may propose a patch. It has no path to
the filesystem that writes, and no git credentials. Everything it wants to
change goes through the room's approval gate first.
"""

import os
from pathlib import Path

from pdd.path_sandbox import SandboxViolation, resolve

REPO_ROOT = Path(os.environ.get("REPO_ROOT", Path(__file__).resolve().parent.parent))

_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv",
              ".pdd", ".pytest_cache", "litellm_cache.sqlite", "dist", "build"}
_TEXT_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt",
                  ".yaml", ".yml", ".toml", ".html", ".css", ".sh", ".prompt",
                  ".cfg", ".ini", ""}
_MAX_BYTES = 200_000


class ReadOnlyViolation(Exception):
    """Raised when a path escapes the repository root."""


def _resolve(rel_path: str) -> Path:
    try:
        return resolve(REPO_ROOT, rel_path)
    except SandboxViolation as exc:
        raise ReadOnlyViolation(f"path is outside the readable repository: {rel_path}") from exc


def list_files(subdir: str = "", limit: int = 400) -> list[str]:
    base = _resolve(subdir) if subdir else REPO_ROOT
    out: list[str] = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]
        for f in sorted(files):
            p = Path(root) / f
            if p.suffix not in _TEXT_SUFFIXES:
                continue
            out.append(str(p.relative_to(REPO_ROOT)))
            if len(out) >= limit:
                return out
    return out


def read_file(rel_path: str) -> str:
    p = _resolve(rel_path)
    if not p.is_file():
        raise FileNotFoundError(rel_path)
    if p.stat().st_size > _MAX_BYTES:
        raise ValueError(f"{rel_path} is larger than {_MAX_BYTES} bytes")
    return p.read_text(encoding="utf-8", errors="replace")


def search(query: str, limit: int = 60) -> list[dict]:
    """Plain substring search, case-insensitive. Good enough for a repo this
    size and it avoids shelling out."""
    needle = query.lower()
    hits: list[dict] = []
    for rel in list_files():
        try:
            text = read_file(rel)
        except (OSError, ValueError):
            continue
        for i, line in enumerate(text.splitlines(), start=1):
            if needle in line.lower():
                hits.append({"path": rel, "line": i, "text": line.strip()[:200]})
                if len(hits) >= limit:
                    return hits
    return hits


def unified_diff(rel_path: str, new_content: str) -> str:
    import difflib
    try:
        before = read_file(rel_path).splitlines(keepends=True)
    except (FileNotFoundError, ReadOnlyViolation):
        before = []
    after = new_content.splitlines(keepends=True)
    return "".join(difflib.unified_diff(
        before, after,
        fromfile=f"a/{rel_path}", tofile=f"b/{rel_path}", n=3,
    ))
