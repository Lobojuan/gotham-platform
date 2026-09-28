#!/usr/bin/env bash
# Git (origin/main on GitHub) is the single source of truth for what runs in production.
# Sourced by the deploy scripts: refuse to ship anything that is not exactly origin/main.
# Emergency override (say why in the next commit): FORCE_DEPLOY=1
git_guard() {
  local root="$1"
  git -C "$root" fetch -q origin main || { echo "✗ cannot reach GitHub to check origin/main"; [ "${FORCE_DEPLOY:-}" = 1 ] || exit 1; }
  local dirty; dirty=$(git -C "$root" status --porcelain -- apps scripts)
  local head; head=$(git -C "$root" rev-parse HEAD)
  local main; main=$(git -C "$root" rev-parse origin/main)
  if [ -n "$dirty" ] || [ "$head" != "$main" ]; then
    echo "✗ refusing to deploy: this folder is not exactly origin/main"
    [ -n "$dirty" ] && { echo "  uncommitted or untracked changes:"; echo "$dirty" | sed 's/^/    /' | head -20; }
    [ "$head" != "$main" ] && echo "  HEAD $head, origin/main $main (commit + push, or git pull --rebase)"
    if [ "${FORCE_DEPLOY:-}" = 1 ]; then echo "  FORCE_DEPLOY=1 set: deploying anyway"; else exit 1; fi
  fi
  DEPLOY_COMMIT="$head"
  echo "→ deploying commit ${head:0:7} ($(git -C "$root" log -1 --format=%s "$head" | cut -c1-70))"
}
