#!/usr/bin/env bash

set -euo pipefail

rm -rf extension/pkg
wasm-pack build --target web --out-dir extension/pkg

if command -v convert >/dev/null 2>&1 && [[ -f logo.png ]]; then
  mkdir -p extension/icons
  for size in 16 32 48 128; do
    convert logo.png \
      -background none \
      -gravity center \
      -resize "${size}x${size}" \
      -extent "${size}x${size}" \
      "extension/icons/icon-${size}.png"
  done
fi

rm -rf extension-firefox/pkg
mkdir -p extension-firefox
cp -R extension/pkg extension-firefox/pkg

if [[ -d extension/icons ]]; then
  rm -rf extension-firefox/icons
  cp -R extension/icons extension-firefox/icons
fi
