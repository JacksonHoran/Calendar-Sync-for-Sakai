#!/usr/bin/env bash
# Builds the Chrome Web Store upload zip: only runtime files, with the dev-only "key" stripped
# from the manifest (the store manages the key for published items).
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
client_id=$(node -p "require('./manifest.json').oauth2.client_id")
if [[ "$client_id" == REPLACE_ME* ]]; then
  echo "error: manifest.json oauth2.client_id is still a placeholder" >&2
  exit 1
fi

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

cp -R src popup icons "$staging/"
node -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  delete manifest.key;
  fs.writeFileSync(process.argv[1], JSON.stringify(manifest, null, 2) + "\n");
' "$staging/manifest.json"

mkdir -p dist
out="dist/calendar-sync-for-sakai-$version.zip"
rm -f "$out"
(cd "$staging" && zip -qr -X - .) > "$out"

echo "Built $out"
unzip -l "$out"
