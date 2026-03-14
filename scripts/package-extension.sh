#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CHROME_DIR="${REPO_ROOT}/build/chrome-extension"
FIREFOX_DIR="${REPO_ROOT}/build/firefox-extension"
DIST_DIR="${REPO_ROOT}/dist"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

read_manifest_version() {
  sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

create_zip() {
  local source_dir="$1"
  local output_zip="$2"

  (
    cd "${source_dir}"
    zip -X -q -r "${output_zip}" . -x '*.DS_Store' '*/.DS_Store'
  )
}

require_command wasm-pack
require_command zip

bash "${REPO_ROOT}/scripts/build-extension.sh"

VERSION="$(read_manifest_version "${CHROME_DIR}/manifest.json")"
if [[ -z "${VERSION}" ]]; then
  echo "Failed to read extension version from ${CHROME_DIR}/manifest.json" >&2
  exit 1
fi

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

CHROME_ZIP="${DIST_DIR}/fire-summary-chrome-v${VERSION}.zip"
FIREFOX_ZIP="${DIST_DIR}/fire-summary-firefox-v${VERSION}.zip"

create_zip "${CHROME_DIR}" "${CHROME_ZIP}"
create_zip "${FIREFOX_DIR}" "${FIREFOX_ZIP}"

printf 'Created release packages:\n- %s\n- %s\n' \
  "${CHROME_ZIP}" \
  "${FIREFOX_ZIP}"
