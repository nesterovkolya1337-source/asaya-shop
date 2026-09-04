#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="${ASAYA_REPO_DIR:-/opt/asaya-shop}"
state_dir="${ASAYA_DEPLOY_STATE_DIR:-/var/lib/asaya-autodeploy}"

cd "$repo_dir"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ASAYA deploy stopped: the production working tree has local changes." >&2
  exit 1
fi

git fetch --prune origin main
target_revision="$(git rev-parse origin/main)"
deployed_revision="$(cat "$state_dir/deployed-revision" 2>/dev/null || true)"

if [[ "$target_revision" == "$deployed_revision" ]]; then
  echo "ASAYA is already deployed at $target_revision"
  exit 0
fi

git merge --ff-only origin/main
docker compose up -d --build --remove-orphans
curl --fail --retry 8 --retry-delay 2 http://127.0.0.1/healthz
docker image prune -f

install -d -m 0755 "$state_dir"
printf '%s\n' "$target_revision" > "$state_dir/deployed-revision"
echo "ASAYA deployed successfully at $target_revision"
