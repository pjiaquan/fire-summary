#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <patch|minor|major|x.y.z> [--print-only]" >&2
  exit 1
fi

TARGET_VERSION="$1"
PRINT_ONLY="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

read_current_version() {
  sed -n 's/^version = "\([^"]*\)"$/\1/p' Cargo.toml | head -n 1
}

parse_semver() {
  local version="$1"
  if [[ ! "${version}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "Invalid semantic version: ${version}" >&2
    exit 1
  fi

  echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]}"
}

next_version_for_bump() {
  local current_version="$1"
  local bump_type="$2"
  local major minor patch
  read -r major minor patch <<<"$(parse_semver "${current_version}")"

  case "${bump_type}" in
    patch)
      patch=$((patch + 1))
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    *)
      echo "Unsupported bump type: ${bump_type}" >&2
      exit 1
      ;;
  esac

  echo "${major}.${minor}.${patch}"
}

replace_version_in_file() {
  local file_path="$1"
  local pattern="$2"
  local replacement="$3"
  perl -0pi -e "s/${pattern}/${replacement}/g" "${file_path}"
}

CURRENT_VERSION="$(read_current_version)"
if [[ -z "${CURRENT_VERSION}" ]]; then
  echo "Failed to read current version from Cargo.toml" >&2
  exit 1
fi

if [[ "${TARGET_VERSION}" =~ ^(patch|minor|major)$ ]]; then
  NEXT_VERSION="$(next_version_for_bump "${CURRENT_VERSION}" "${TARGET_VERSION}")"
else
  parse_semver "${TARGET_VERSION}" >/dev/null
  NEXT_VERSION="${TARGET_VERSION}"
fi

if [[ "${PRINT_ONLY}" == "--print-only" ]]; then
  printf '%s\n' "${NEXT_VERSION}"
  exit 0
fi

replace_version_in_file "Cargo.toml" 'version = "[^"]+"' "version = \"${NEXT_VERSION}\""
replace_version_in_file "extension/manifest.json" '"version": "[^"]+"' "\"version\": \"${NEXT_VERSION}\""
replace_version_in_file "extension/manifest.firefox.json" '"version": "[^"]+"' "\"version\": \"${NEXT_VERSION}\""

printf 'Updated version: %s -> %s\n' "${CURRENT_VERSION}" "${NEXT_VERSION}"
