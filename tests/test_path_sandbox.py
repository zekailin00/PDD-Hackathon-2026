"""Acceptance tests for the path_sandbox PDD module.

This is the boundary between "the agent can read your repo" and "the agent can
read your laptop". Every test here is an attack; the happy path is an
afterthought.
"""

import os
from pathlib import Path

import pytest

ps = pytest.importorskip(
    "pdd.path_sandbox",
    reason="pdd/path_sandbox.py not generated yet -- run scripts/pdd-sync.sh",
)


@pytest.fixture
def root(tmp_path):
    repo = tmp_path / "repo"
    (repo / "app").mkdir(parents=True)
    (repo / "app" / "main.py").write_text("x = 1\n")
    (tmp_path / "secrets").mkdir()
    (tmp_path / "secrets" / "key.txt").write_text("SECRET\n")
    return repo


# --------------------------------------------------------------------------
# Escapes -- every one of these must be refused
# --------------------------------------------------------------------------

@pytest.mark.parametrize("candidate", [
    "../secrets",
    "../secrets/key.txt",
    "a/../../secrets/key.txt",
    "./../../secrets",
    "app/../../secrets/key.txt",
    "../../../../../../etc/passwd",
    "/etc/passwd",
    "~/.ssh/id_rsa",
    "~root/.ssh/id_rsa",
])
def test_escape_is_refused(root, candidate):
    with pytest.raises(ps.SandboxViolation):
        ps.resolve(root, candidate)
    assert ps.is_inside(root, candidate) is False


def test_absolute_path_outside_root_is_refused(root, tmp_path):
    outside = str(tmp_path / "secrets" / "key.txt")
    assert os.path.exists(outside), "the target really exists, and is still refused"
    with pytest.raises(ps.SandboxViolation):
        ps.resolve(root, outside)


def test_null_byte_is_refused(root):
    with pytest.raises(ps.SandboxViolation):
        ps.resolve(root, "app/main.py\x00.txt")


def test_symlink_pointing_outside_is_refused(root, tmp_path):
    """Every textual component looks fine; only resolution reveals the escape."""
    link = root / "app" / "innocent.py"
    link.symlink_to(tmp_path / "secrets" / "key.txt")
    with pytest.raises(ps.SandboxViolation):
        ps.resolve(root, "app/innocent.py")
    assert ps.is_inside(root, "app/innocent.py") is False


def test_symlinked_directory_pointing_outside_is_refused(root, tmp_path):
    (root / "docs").symlink_to(tmp_path / "secrets", target_is_directory=True)
    with pytest.raises(ps.SandboxViolation):
        ps.resolve(root, "docs/key.txt")


def test_a_shared_string_prefix_is_not_containment(tmp_path):
    """/home/app/repo-secrets is NOT inside /home/app/repo."""
    repo = tmp_path / "repo"
    sibling = tmp_path / "repo-secrets"
    repo.mkdir()
    sibling.mkdir()
    (sibling / "x.txt").write_text("nope\n")

    assert ps.is_inside(repo, str(sibling / "x.txt")) is False
    with pytest.raises(ps.SandboxViolation):
        ps.resolve(repo, str(sibling / "x.txt"))


# --------------------------------------------------------------------------
# Legitimate reads
# --------------------------------------------------------------------------

@pytest.mark.parametrize("candidate", [
    "app/main.py",
    "./app/main.py",
    "app/../app/main.py",
])
def test_ordinary_paths_are_allowed(root, candidate):
    assert ps.resolve(root, candidate) == (root / "app" / "main.py").resolve()
    assert ps.is_inside(root, candidate) is True


@pytest.mark.parametrize("candidate", ["", ".", "./"])
def test_the_root_itself_is_allowed(root, candidate):
    assert ps.resolve(root, candidate) == root.resolve()


def test_absolute_path_inside_root_is_allowed(root):
    inside = str(root / "app" / "main.py")
    assert ps.resolve(root, inside) == Path(inside).resolve()


def test_a_path_that_does_not_exist_yet_is_allowed(root):
    """The question is 'may this be read', not 'does this exist'."""
    assert ps.is_inside(root, "app/not_written_yet.py") is True
    assert ps.resolve(root, "app/not_written_yet.py").name == "not_written_yet.py"


def test_symlink_staying_inside_the_root_is_allowed(root):
    (root / "app" / "alias.py").symlink_to(root / "app" / "main.py")
    assert ps.is_inside(root, "app/alias.py") is True


# --------------------------------------------------------------------------
# The two functions must never disagree
# --------------------------------------------------------------------------

@pytest.mark.parametrize("candidate", [
    "app/main.py", "../secrets", "/etc/passwd", "", ".",
    "a/../../secrets", "~/.ssh/id_rsa", "app/../app/main.py",
])
def test_is_inside_agrees_with_resolve(root, candidate):
    try:
        ps.resolve(root, candidate)
        raised = False
    except ps.SandboxViolation:
        raised = True
    assert ps.is_inside(root, candidate) is (not raised)


def test_resolve_returns_an_absolute_path(root):
    assert ps.resolve(root, "app/main.py").is_absolute()


def test_violation_is_not_a_plain_value_error(root):
    """Callers must be able to tell a security refusal from a bad argument."""
    with pytest.raises(ps.SandboxViolation) as exc:
        ps.resolve(root, "../secrets")
    assert not isinstance(exc.value, ValueError) or issubclass(
        ps.SandboxViolation, Exception)


def test_repo_reader_uses_the_generated_policy(tmp_path, monkeypatch):
    from app import repo_reader

    monkeypatch.setattr(repo_reader, "REPO_ROOT", tmp_path)
    assert repo_reader._resolve("src/main.py") == tmp_path.resolve() / "src/main.py"
    with pytest.raises(repo_reader.ReadOnlyViolation):
        repo_reader._resolve("../outside.txt")
