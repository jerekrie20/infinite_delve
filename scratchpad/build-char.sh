#!/usr/bin/env bash
# Download a finished PixelLab character and composite ONE direction's animations
# into the horizontal strip PNG the game loads (ART_BIBLE §5).
#
#   scratchpad/build-char.sh <characterId> <direction> <out.png> <anim> [anim ...]
#   e.g. build-char.sh 51fb8c06-... east src/client/public/heroes/squire.png idle attack
#
# Animations are concatenated in the order given — that order MUST match
# ANIM_ORDER in src/client/game/charSpecs.ts. Prints the sheet.mjs JSON
# (frame count + base-pose origin) for pasting into the CharSpec.
set -euo pipefail

if [ $# -lt 4 ]; then
  echo "usage: build-char.sh <characterId> <direction> <out.png> <anim> [anim ...]" >&2
  exit 2
fi
CHAR_ID=$1; DIRECTION=$2; OUT=$3; shift 3

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# The download endpoint 423s while any job is still running — --fail surfaces it.
curl -sfL "https://api.pixellab.ai/mcp/characters/$CHAR_ID/download" -o "$TMP/char.zip"
unzip -q "$TMP/char.zip" -d "$TMP/x"
ROOT=$(find "$TMP/x" -mindepth 1 -maxdepth 1 -type d | head -1)

FRAMES=()
for anim in "$@"; do
  dir="$ROOT/animations/$anim/$DIRECTION"
  if [ ! -d "$dir" ]; then
    echo "MISSING animation '$anim' direction '$DIRECTION' for $CHAR_ID" >&2
    exit 1
  fi
  while IFS= read -r f; do FRAMES+=("$f"); done < <(find "$dir" -name 'frame_*.png' | sort)
done

mkdir -p "$(dirname "$OUT")"
node scratchpad/sheet.mjs "$OUT" "${FRAMES[@]}"
