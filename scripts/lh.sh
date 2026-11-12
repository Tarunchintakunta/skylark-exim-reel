#!/usr/bin/env bash
# Lighthouse performance score and LCP for / and /story, mobile and desktop, median of 3 runs each.
#   scripts/lh.sh <base-url>
set -euo pipefail
cd "$(dirname "$0")/.."
base=${1:?base url}
export CHROME_PATH=${CHROME_PATH:-$(ls -d ~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing" | head -1)}
out=$(mktemp -d "${TMPDIR:-/tmp}/lh.XXXXXX")
for page in / /story; do
  for ff in mobile desktop; do
    scores=()
    for n in 1 2 3; do
      f="$out/$(echo "$page" | tr / _)-$ff-$n.json"
      npx lighthouse "$base$page" --quiet --output=json --output-path="$f" --only-categories=performance \
        $([ $ff = desktop ] && echo --preset=desktop) --chrome-flags="--headless=new" >/dev/null 2>&1 || true
      scores+=("$(node -e "const r=require('$f');console.log(r.categories.performance.score, Math.round(r.audits['largest-contentful-paint'].numericValue))" 2>/dev/null || echo "fail 0")")
    done
    echo "$page $ff: $(printf '%s\n' "${scores[@]}" | sort -n | sed -n 2p) (runs: ${scores[*]})"
  done
done
