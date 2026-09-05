#!/usr/bin/env bash
set -Eeuo pipefail

public_key="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJJzkmM63A4H6we+I3o/DckibgghB9TXScOB7c7YDqcf asaya-codex-direct-deploy"
authorized_entry="restrict,command=\"/usr/local/sbin/asaya-git-gateway\" $public_key"
bare_repo="/opt/asaya.git"
release_dir="/opt/asaya-release"

install -d -m 0700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 0600 /root/.ssh/authorized_keys
if ! grep -Fq "$public_key" /root/.ssh/authorized_keys; then
  printf '%s\n' "$authorized_entry" >> /root/.ssh/authorized_keys
fi

cat > /usr/local/sbin/asaya-git-gateway <<'GATEWAY'
#!/usr/bin/env bash
set -Eeuo pipefail

case "${SSH_ORIGINAL_COMMAND:-}" in
  "git-receive-pack '/opt/asaya.git'"|"git-receive-pack /opt/asaya.git")
    exec git-receive-pack /opt/asaya.git
    ;;
  *)
    echo "This key can only publish ASAYA." >&2
    exit 1
    ;;
esac
GATEWAY
chmod 0755 /usr/local/sbin/asaya-git-gateway

if [[ ! -d "$bare_repo" ]]; then
  git init --bare --initial-branch=main "$bare_repo"
fi
git --git-dir="$bare_repo" config receive.denyNonFastForwards true
install -d -m 0755 "$release_dir"

cat > "$bare_repo/hooks/post-receive" <<'HOOK'
#!/usr/bin/env bash
set -Eeuo pipefail

bare_repo="/opt/asaya.git"
release_dir="/opt/asaya-release"
deploy_main=false

while read -r _old_revision _new_revision ref_name; do
  if [[ "$ref_name" == "refs/heads/main" ]]; then
    deploy_main=true
  fi
done

if [[ "$deploy_main" != true ]]; then
  exit 0
fi

echo "Deploying ASAYA directly to Selectel..."
git --work-tree="$release_dir" --git-dir="$bare_repo" checkout -f main
cd "$release_dir"
docker compose -p asaya-shop up -d --build --remove-orphans
curl --fail --retry 8 --retry-delay 2 http://127.0.0.1/healthz
docker image prune -f

# The GitHub polling timer is retired only after a successful direct deploy.
systemctl disable --now asaya-autodeploy.timer >/dev/null 2>&1 || true
echo "Direct ASAYA deploy completed successfully."
HOOK
chmod 0755 "$bare_repo/hooks/post-receive"

echo "Direct ASAYA deployment endpoint is ready."
echo "The existing GitHub timer will remain active until the first successful direct push."
