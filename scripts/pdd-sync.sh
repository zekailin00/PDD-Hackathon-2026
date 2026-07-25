#!/usr/bin/env bash
# Regenerate every PDD-owned module from its prompt.
#
# The files under pdd/ are ARTIFACTS. Never hand-edit them.
# When behaviour must change, edit prompts/<name>_python.prompt and re-run this.
#
# Paths come from .pddrc:
#   prompts/<name>_python.prompt  ->  pdd/<name>.py
#                                     tests/test_<name>.py
#                                     context/<name>_example.py
set -euo pipefail
cd "$(dirname "$0")/.."

# This repo's PDD setup is the CLI/local route backed by a Codex subscription
# (see PDD-SETUP-SUMMARY.txt), so direct prompt commands need --local.
export PDD_MODEL_DEFAULT="${PDD_MODEL_DEFAULT:-chatgpt/gpt-5.6-sol}"

MODULES=("${@:-token_split approval_quorum role_policy}")

for name in ${MODULES[@]}; do
  echo "==> pdd sync ${name}"
  pdd --local sync "prompts/${name}_python.prompt"
done

echo
echo "==> pytest"
python -m pytest tests/ -q
