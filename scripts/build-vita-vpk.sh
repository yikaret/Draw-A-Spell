#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VITA_DIR="$ROOT_DIR/vita"
STAGE_ROOT="${VITA_STAGE_ROOT:-/tmp/sorcery-vita-stage}"
BUILD_DIR="${VITA_BUILD_DIR:-$STAGE_ROOT/build}"
STAGE_VITA_DIR="$STAGE_ROOT/vita"

if [[ -z "${VITASDK:-}" ]]; then
  if [[ -d "/tmp/vitasdk" ]]; then
    export VITASDK="/tmp/vitasdk"
  else
    echo "VITASDK is not set and /tmp/vitasdk was not found." >&2
    echo "Install VitaSDK first, then retry." >&2
    exit 1
  fi
fi

export PATH="$VITASDK/bin:$PATH"

if ! command -v pngquant >/dev/null 2>&1; then
  echo "pngquant is required to normalize Vita package PNG assets." >&2
  echo "Install it and retry (macOS): brew install pngquant" >&2
  exit 1
fi
if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required to generate Vita card art." >&2
  exit 1
fi

# Refresh Vita-native data bundle from project sources before packaging.
node "$ROOT_DIR/scripts/generate-vita-data.mjs"
node "$ROOT_DIR/scripts/generate-vita-art.mjs"

# Stage sources into a path without spaces because vita-pack-vpk fails on
# quoted space-containing paths on some setups.
rm -rf "$STAGE_ROOT"
mkdir -p "$STAGE_ROOT"
cp -R "$VITA_DIR" "$STAGE_VITA_DIR"

# VitaShell install failures (e.g. 0x8010113D) are commonly caused by
# full-color/metadata-heavy sce_sys PNGs. Re-encode them as indexed PNGs.
for png in \
  "$STAGE_VITA_DIR/sce_sys/icon0.png" \
  "$STAGE_VITA_DIR/sce_sys/livearea/contents/bg.png" \
  "$STAGE_VITA_DIR/sce_sys/livearea/contents/startup.png"
do
  if [[ -f "$png" ]]; then
    pngquant --force --strip --quality=60-95 --output "$png" -- "$png"
  fi
done

cmake -S "$STAGE_VITA_DIR" -B "$BUILD_DIR" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build "$BUILD_DIR" -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

mkdir -p "$ROOT_DIR/output"
cp "$BUILD_DIR/sorcery_vita_launcher.vpk" "$ROOT_DIR/output/sorcery-online-vita.vpk"

echo "Built VPK:"
echo "  $ROOT_DIR/output/sorcery-online-vita.vpk"
