#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

modules=("$@")
if [ ${#modules[@]} -eq 0 ]; then
  modules=(token_split approval_quorum role_policy path_sandbox model_router)
fi

for name in "${modules[@]}"; do
  pdd --local sync --no-steer --skip-tests "${name}"
done

npm test
