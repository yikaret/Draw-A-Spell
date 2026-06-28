#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/output"
VPK_PATH="$OUTPUT_DIR/sorcery-online-vita.vpk"
SHA_PATH="$OUTPUT_DIR/sorcery-online-vita.sha256"
MANIFEST_PATH="$OUTPUT_DIR/sorcery-online-vita-release.txt"
NOW_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

bash "$ROOT_DIR/scripts/build-vita-vpk.sh"

mkdir -p "$OUTPUT_DIR"
shasum -a 256 "$VPK_PATH" > "$SHA_PATH"

{
  echo "Sorcery Native Vita Release"
  echo "Built (UTC): $NOW_UTC"
  echo "Artifact: $VPK_PATH"
  echo "SHA256 file: $SHA_PATH"
  echo
  echo "Package contents:"
  unzip -l "$VPK_PATH"
} > "$MANIFEST_PATH"

echo "Release artifacts:"
echo "  $VPK_PATH"
echo "  $SHA_PATH"
echo "  $MANIFEST_PATH"
