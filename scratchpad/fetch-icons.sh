#!/usr/bin/env bash
# Drain the ability-icon manifest: for each "<abilityId> <objectId>" line, poll
# the map-object download endpoint until it returns a real PNG (while generating
# it returns a JSON "still being generated" body), then save it as
# public/icons/<abilityId>.png. Safe to re-run — finished icons are skipped.
#   scratchpad/fetch-icons.sh [manifestFile]
set -uo pipefail
MANIFEST=${1:-scratchpad/icon-manifest.txt}
# Ability icons live in their OWN folder: ability ids collide with status ids
# (both have a 'fortify'), and a bare-id filename would clobber the status icon.
OUT=${2:-src/client/public/icons/abilities}
mkdir -p "$OUT"
pending=1
tries=0
while [ $pending -eq 1 ] && [ $tries -lt 40 ]; do
  pending=0
  tries=$((tries+1))
  while read -r name id; do
    [ -z "${name:-}" ] && continue
    [ -s "$OUT/$name.png" ] && continue
    curl -sL "https://api.pixellab.ai/mcp/map-objects/$id/download" -o "$OUT/.$name.tmp"
    if head -c 4 "$OUT/.$name.tmp" | grep -q 'PNG'; then
      mv "$OUT/.$name.tmp" "$OUT/$name.png"
      echo "OK   $name"
    else
      rm -f "$OUT/.$name.tmp"
      pending=1
    fi
  done < "$MANIFEST"
  [ $pending -eq 1 ] && sleep 10
done
echo "--- final ---"
while read -r name id; do
  [ -z "${name:-}" ] && continue
  if [ -s "$OUT/$name.png" ]; then echo "have $name"; else echo "MISS $name ($id)"; fi
done < "$MANIFEST"
