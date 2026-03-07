#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fire-summary-source.XXXXXX")"

cleanup() {
  rm -rf "${STAGING_DIR}"
}

trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

copy_item() {
  local source_path="$1"
  if [[ ! -e "${REPO_ROOT}/${source_path}" ]]; then
    echo "Missing required source item: ${source_path}" >&2
    exit 1
  fi

  mkdir -p "${STAGING_DIR}/$(dirname "${source_path}")"
  cp -R "${REPO_ROOT}/${source_path}" "${STAGING_DIR}/${source_path}"
}

read_manifest_version() {
  sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

require_command zip

VERSION="$(read_manifest_version "${REPO_ROOT}/extension/manifest.firefox.json")"
if [[ -z "${VERSION}" ]]; then
  echo "Failed to read extension version from extension/manifest.firefox.json" >&2
  exit 1
fi

mkdir -p "${DIST_DIR}"

for item in \
  .github \
  Cargo.lock \
  Cargo.toml \
  PRIVACY.md \
  README.md \
  STORE_LISTING.md \
  extension \
  logo.png \
  scripts \
  src
do
  copy_item "${item}"
done

rm -rf "${STAGING_DIR}/extension/pkg"

SOURCE_ZIP="${DIST_DIR}/fire-summary-firefox-source-v${VERSION}.zip"
rm -f "${SOURCE_ZIP}"

(
  cd "${STAGING_DIR}"
  zip -X -q -r "${SOURCE_ZIP}" . -x '*.DS_Store' '*/.DS_Store'
)

printf 'Created Firefox source package:\n- %s\n' "${SOURCE_ZIP}"
