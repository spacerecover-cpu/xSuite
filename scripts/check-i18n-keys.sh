#!/usr/bin/env bash
# Portal-scoped i18n missing-key gate (Country Engine Phase 2, A3).
#
# Asserts every t('portal.KEY') / t("portal.KEY") call site under the portal
# surface resolves to a string in portal.en.json (the fallbackLng namespace
# slice). Scope is intentionally bounded to the portal (the externally visible
# non-English surface) so the gate is real but does not block on the ~1,684
# not-yet-extracted app strings.
#
# Source of truth: src/locales/portal.en.json (the portal subtree, WITHOUT a
# top-level "portal" wrapper key — keys are addressed directly as login.heading
# etc. inside that file).
set -euo pipefail

PORTAL_DIRS=(src/pages/portal src/components/portal src/components/layout)
EN_JSON="src/locales/portal.en.json"

existing=()
for d in "${PORTAL_DIRS[@]}"; do
  [ -d "$d" ] && existing+=("$d")
done
if [ ${#existing[@]} -eq 0 ]; then
  echo "OK: no portal directories present — i18n key gate is a no-op."
  exit 0
fi

# Extract keys from t('portal.KEY') / t("portal.KEY") calls.
# Strip the leading 'portal.' prefix before walking portal.en.json, since that
# file stores the subtree without a top-level "portal" wrapper key.
keys=$(grep -rhoE "t\(\s*['\"]portal\.[a-zA-Z0-9_.]+['\"]" "${existing[@]}" 2>/dev/null \
  | sed -E "s/.*portal\.([a-zA-Z0-9_.]+).*/\1/" | sort -u || true)

if [ -z "$keys" ]; then
  echo "OK: no portal t('portal.…') call sites yet — i18n key gate is a no-op."
  exit 0
fi

if [ ! -f "$EN_JSON" ]; then
  echo "FAIL: portal t('portal.…') calls exist but $EN_JSON (en namespace) is missing." >&2
  exit 1
fi

printf '%s\n' "$keys" | node --input-type=commonjs -e '
  const fs = require("fs");
  const en = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const keys = fs.readFileSync(0, "utf8").trim().split("\n").filter(Boolean);
  const missing = keys.filter((k) => {
    let cur = en;
    for (const seg of k.split(".")) {
      if (cur && typeof cur === "object" && seg in cur) cur = cur[seg];
      else return true;
    }
    return typeof cur !== "string";
  });
  if (missing.length) {
    console.error("FAIL: unresolved portal i18n keys (no en value): " + missing.join(", "));
    process.exit(1);
  }
  console.log("OK: " + keys.length + " portal t() keys resolve in en.");
' "$EN_JSON"
