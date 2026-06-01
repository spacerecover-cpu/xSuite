#!/usr/bin/env bash
set -euo pipefail

# Token guard: fail if banned indigo/blue RGB triplets leak into theme sources.
#   99 102 241  -> indigo  #6366F1 (banned focus-ring color)
#   59 130 246  -> blue    #3B82F6 (banned brand blue)
# These tokens must be expressed via the 14 semantic CSS variables instead.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILES=(
  "$ROOT/src/index.css"
  "$ROOT/tailwind.config.js"
)

BANNED=(
  "99 102 241"
  "59 130 246"
)

found=0
for file in "${FILES[@]}"; do
  [ -f "$file" ] || continue
  for triplet in "${BANNED[@]}"; do
    if grep -n -F "$triplet" "$file"; then
      echo "ERROR: banned RGB triplet '$triplet' found in $file (above)" >&2
      found=1
    fi
  done
done

if [ "$found" -ne 0 ]; then
  echo "check-tokens: FAILED — banned RGB triplets present." >&2
  exit 1
fi

echo "check-tokens: OK — no banned RGB triplets found."
exit 0
