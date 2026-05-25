#!/usr/bin/env bash
set -euo pipefail

TSC_EXIT=0
TSC_OUT=$(npx tsc --noEmit -p tsconfig.app.json 2>&1) || TSC_EXIT=$?
CURRENT=$(printf '%s\n' "$TSC_OUT" | grep -c "^src/" || true)

if [ "$TSC_EXIT" -ne 0 ] && [ "$CURRENT" -eq 0 ]; then
  echo "FAIL: tsc invocation failed (exit $TSC_EXIT) with no diagnostics — likely a tooling error"
  echo "--- tsc output (last 20 lines): ---"
  printf '%s\n' "$TSC_OUT" | tail -20
  exit 2
fi

if [ "$CURRENT" -gt 0 ]; then
  echo "FAIL: $CURRENT tsc errors in src/ (must be 0)"
  printf '%s\n' "$TSC_OUT" | grep "^src/" | head -20
  exit 1
fi

echo "OK: tsc clean (0 errors)"
