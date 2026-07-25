#!/usr/bin/env bash
# Regenerate every PDD-owned module from its prompt.
#
# The files under pdd/ are ARTIFACTS. Never hand-edit them.
# When behaviour must change, edit prompts/<name>_python.prompt and re-run this.
#
# `pdd sync` takes a BASENAME, not a path: `pdd sync token_split` resolves to
# prompts/token_split_python.prompt via .pddrc.
set -euo pipefail
cd "$(dirname "$0")/.."

MODULES=("$@")
if [ ${#MODULES[@]} -eq 0 ]; then
  MODULES=(token_split approval_quorum role_policy path_sandbox)
fi

for name in "${MODULES[@]}"; do
  echo "==> pdd sync ${name}"
  pdd --local sync --no-steer --skip-tests "${name}"
done

echo
echo "==> pytest"
.venv/bin/python -m pytest tests/ -q
