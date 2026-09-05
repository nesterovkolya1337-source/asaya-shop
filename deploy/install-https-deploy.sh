#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="${ASAYA_REPO_DIR:-/opt/asaya-shop}"
bare_repo="/opt/asaya.git"
public_key="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJJzkmM63A4H6we+I3o/DckibgghB9TXScOB7c7YDqcf"

install -d -m 0755 /usr/local/lib/asaya-deploy
install -m 0755 "$repo_dir/deploy/https-deploy-server.py" /usr/local/lib/asaya-deploy/server.py
install -d -m 0700 /etc/asaya-deploy
printf 'asaya-codex %s\n' "$public_key" > /etc/asaya-deploy/allowed_signers
chmod 0600 /etc/asaya-deploy/allowed_signers

if [[ ! -d "$bare_repo" ]]; then
  git init --bare --initial-branch=main "$bare_repo"
fi
if ! git --git-dir="$bare_repo" rev-parse --verify refs/heads/main >/dev/null 2>&1; then
  git --git-dir="$bare_repo" fetch "$repo_dir" main:refs/heads/main
fi
git --git-dir="$bare_repo" config receive.denyNonFastForwards true

install -m 0644 "$repo_dir/deploy/asaya-https-deploy.service" /etc/systemd/system/asaya-https-deploy.service
systemctl daemon-reload
systemctl enable --now asaya-https-deploy.service
systemctl restart asaya-https-deploy.service

echo "ASAYA signed HTTPS deployment is ready."
