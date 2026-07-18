#!/usr/bin/env bash
# sync-gm.sh — copy the NEWEST GameMaker build into this Devvit project's public/.
#
# Why: GameMaker's Reddit target compiles the game into its temp folder
# (…/GMS2TEMP/delve_gamemaker_*_VM/runner/) but its "copy to the Devvit project"
# step is unreliable, so the freshly built game never reaches public/ (which is
# what `npm run dev` / vite actually serves). Run this after each GameMaker F5.
#
# Usage (from the infinite-delve folder, in Git Bash):
#   bash tools/sync-gm.sh
set -euo pipefail

GMS_TEMP="$LOCALAPPDATA/GameMakerStudio2-LTS2026/GMS2TEMP"
# Fallbacks if the LTS folder name differs on your machine:
[ -d "$GMS_TEMP" ] || GMS_TEMP="$LOCALAPPDATA/GameMakerStudio2/GMS2TEMP"

DST="$(cd "$(dirname "$0")/.." && pwd)/src/client/public"

# Find the most-recently-built game.unx across all delve_gamemaker_*_VM temp dirs.
newest_runner=""
newest_time=0
for f in "$GMS_TEMP"/delve_gamemaker_*_VM/runner/game.unx; do
  [ -f "$f" ] || continue
  t=$(stat -c %Y "$f")
  if [ "$t" -gt "$newest_time" ]; then
    newest_time=$t
    newest_runner="$(dirname "$f")"
  fi
done

if [ -z "$newest_runner" ]; then
  echo "No GameMaker build found under: $GMS_TEMP"
  echo "Did you press Run (F5) in GameMaker with the Reddit target selected?"
  exit 1
fi

echo "Newest build: $newest_runner"
echo "Built at:     $(date -d "@$newest_time" '+%Y-%m-%d %H:%M:%S')"
echo "Copying ->    $DST"
cp -rf "$newest_runner"/* "$DST"/
echo "Done. npm run dev should now redeploy; then hard-refresh the Reddit post."
