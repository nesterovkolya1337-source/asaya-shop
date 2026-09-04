#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="${ASAYA_REPO_DIR:-/opt/asaya-shop}"

cd "$repo_dir"
install -m 0644 deploy/asaya-autodeploy.service /etc/systemd/system/asaya-autodeploy.service
install -m 0644 deploy/asaya-autodeploy.timer /etc/systemd/system/asaya-autodeploy.timer
install -d -m 0755 /var/lib/asaya-autodeploy
systemctl daemon-reload
systemctl enable --now asaya-autodeploy.timer
systemctl start asaya-autodeploy.service
systemctl status asaya-autodeploy.timer --no-pager
