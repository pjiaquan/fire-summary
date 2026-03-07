#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/extension"
BUILD_ROOT="${REPO_ROOT}/build"
CHROME_BUILD_DIR="${BUILD_ROOT}/chrome-extension"
FIREFOX_BUILD_DIR="${BUILD_ROOT}/firefox-extension"

rm -rf "${CHROME_BUILD_DIR}" "${FIREFOX_BUILD_DIR}"
mkdir -p "${BUILD_ROOT}"

cp -R "${SOURCE_DIR}" "${CHROME_BUILD_DIR}"
rm -f "${CHROME_BUILD_DIR}/manifest.firefox.json"

cp -R "${SOURCE_DIR}" "${FIREFOX_BUILD_DIR}"
cp "${SOURCE_DIR}/manifest.firefox.json" "${FIREFOX_BUILD_DIR}/manifest.json"
rm -f "${FIREFOX_BUILD_DIR}/manifest.firefox.json"

printf 'Staged extension builds:\n- %s\n- %s\n' "${CHROME_BUILD_DIR}" "${FIREFOX_BUILD_DIR}"
