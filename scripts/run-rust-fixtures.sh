#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

bash "${REPO_ROOT}/scripts/build-extension.sh"
node "${REPO_ROOT}/scripts/run-rust-fixtures.mjs"
node "${REPO_ROOT}/scripts/render-rust-fixture-report.mjs"
