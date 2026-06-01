#!/usr/bin/env bash
# Activation wrapper for the vendored superpowers skills library.
#
# Superpowers' own SessionStart hook (.agents/skills/superpowers/hooks/session-start)
# injects the "using-superpowers" dispatcher into each session and selects its JSON
# output shape based on CLAUDE_PLUGIN_ROOT. We vendor superpowers as project skills
# rather than installing it as a plugin, so CLAUDE_PLUGIN_ROOT is not set for us.
# This wrapper points it at the vendored copy so the hook emits Claude Code's
# expected hookSpecificOutput.additionalContext format.
set -euo pipefail

# Resolve the repo root: prefer CLAUDE_PROJECT_DIR (set by Claude Code for hooks),
# fall back to walking up from this script's location.
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

export CLAUDE_PLUGIN_ROOT="$ROOT/.agents/skills/superpowers"

exec "$CLAUDE_PLUGIN_ROOT/hooks/run-hook.cmd" session-start
