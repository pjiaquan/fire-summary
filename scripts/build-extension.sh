#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXTENSION_DIR="${REPO_ROOT}/extension"

rm -rf "${EXTENSION_DIR}/pkg"
wasm-pack build --target web --out-dir "${EXTENSION_DIR}/pkg"

if command -v convert >/dev/null 2>&1 && [[ -f "${REPO_ROOT}/logo.png" ]]; then
  mkdir -p "${EXTENSION_DIR}/icons"
  for size in 16 32 48 128; do
    convert "${REPO_ROOT}/logo.png" \
      -background none \
      -gravity center \
      -resize "${size}x${size}" \
      -extent "${size}x${size}" \
      "${EXTENSION_DIR}/icons/icon-${size}.png"
  done
fi

bash "${REPO_ROOT}/scripts/stage-extension-builds.sh"
bash "${REPO_ROOT}/scripts/firefox-source-package.sh"
