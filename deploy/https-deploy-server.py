#!/usr/bin/env python3
import base64
import binascii
import json
import os
import re
import shutil
import socketserver
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path


SOCKET_PATH = Path("/run/asaya-deploy/deploy.sock")
BARE_REPO = Path("/opt/asaya.git")
RELEASES_DIR = Path("/opt/asaya-releases")
ALLOWED_SIGNERS = Path("/etc/asaya-deploy/allowed_signers")
MAX_BODY_BYTES = 512 * 1024 * 1024
DEPLOY_LOCK = threading.Lock()
SHA_PATTERN = re.compile(r"^[0-9a-f]{40,64}$")


def run(command, *, cwd=None, stdin=None, check=True):
    return subprocess.run(
        command,
        cwd=cwd,
        stdin=stdin,
        text=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=check,
    )


def current_revision():
    result = run(
        ["git", f"--git-dir={BARE_REPO}", "rev-parse", "--verify", "refs/heads/main"],
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout.decode().strip()


def verify_signature(bundle_path, signature_path):
    with bundle_path.open("rb") as payload:
        result = run(
            [
                "ssh-keygen",
                "-Y",
                "verify",
                "-f",
                str(ALLOWED_SIGNERS),
                "-I",
                "asaya-codex",
                "-n",
                "asaya-deploy",
                "-s",
                str(signature_path),
            ],
            stdin=payload,
            check=False,
        )
    if result.returncode != 0:
        raise ValueError("Deployment signature is invalid.")


def bundle_revision(bundle_path):
    result = run(["git", "bundle", "list-heads", str(bundle_path), "refs/heads/main"])
    output = result.stdout.decode().strip().split()
    if len(output) != 2 or output[1] != "refs/heads/main" or not SHA_PATTERN.fullmatch(output[0]):
        raise ValueError("Bundle does not contain a valid main branch.")
    return output[0]


def deploy_bundle(bundle_path):
    target_revision = bundle_revision(bundle_path)
    previous_revision = current_revision()
    if target_revision == previous_revision:
        return {"status": "unchanged", "revision": target_revision}

    run(["git", f"--git-dir={BARE_REPO}", "bundle", "verify", str(bundle_path)])
    run(
        [
            "git",
            f"--git-dir={BARE_REPO}",
            "fetch",
            "--force",
            str(bundle_path),
            "refs/heads/main:refs/asaya/incoming",
        ]
    )
    if previous_revision:
        ancestor = run(
            [
                "git",
                f"--git-dir={BARE_REPO}",
                "merge-base",
                "--is-ancestor",
                previous_revision,
                "refs/asaya/incoming",
            ],
            check=False,
        )
        if ancestor.returncode != 0:
            raise ValueError("Only fast-forward deployments are accepted.")

    RELEASES_DIR.mkdir(mode=0o755, parents=True, exist_ok=True)
    release_dir = RELEASES_DIR / target_revision
    if release_dir.exists():
        shutil.rmtree(release_dir)
    release_dir.mkdir(mode=0o755)
    run(
        [
            "git",
            f"--git-dir={BARE_REPO}",
            f"--work-tree={release_dir}",
            "checkout",
            "--force",
            "refs/asaya/incoming",
            "--",
            ".",
        ]
    )
    if not (release_dir / "compose.yaml").is_file():
        raise ValueError("Deployment is missing compose.yaml.")

    deploy_result = run(
        [
            "docker",
            "compose",
            "-p",
            "asaya-shop",
            "-f",
            str(release_dir / "compose.yaml"),
            "up",
            "-d",
            "--build",
            "--remove-orphans",
        ],
        cwd=release_dir,
    )
    run(
        [
            "curl",
            "--fail",
            "--retry",
            "8",
            "--retry-delay",
            "2",
            "http://127.0.0.1/healthz",
        ]
    )
    run(["git", f"--git-dir={BARE_REPO}", "update-ref", "refs/heads/main", target_revision])
    run(["git", f"--git-dir={BARE_REPO}", "update-ref", "-d", "refs/asaya/incoming"], check=False)

    current_link = Path("/opt/asaya-current")
    temporary_link = Path("/opt/.asaya-current.next")
    temporary_link.unlink(missing_ok=True)
    temporary_link.symlink_to(release_dir, target_is_directory=True)
    os.replace(temporary_link, current_link)

    subprocess.run(
        ["systemctl", "disable", "--now", "asaya-autodeploy.timer"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    subprocess.run(
        ["docker", "image", "prune", "-f"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    releases = sorted(
        (
            path
            for path in RELEASES_DIR.iterdir()
            if path.is_dir() and SHA_PATTERN.fullmatch(path.name)
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for obsolete_release in releases[3:]:
        shutil.rmtree(obsolete_release, ignore_errors=True)
    return {
        "status": "deployed",
        "revision": target_revision,
        "build": deploy_result.stdout.decode(errors="replace")[-12000:],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "ASAYADeploy/1"

    def log_message(self, message, *args):
        print(f"{self.client_address}: {message % args}", flush=True)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/_asaya_deploy/status":
            self.send_json(404, {"error": "Not found"})
            return
        self.send_json(200, {"status": "ready", "revision": current_revision()})

    def do_POST(self):
        if self.path != "/_asaya_deploy/deploy":
            self.send_json(404, {"error": "Not found"})
            return
        if not DEPLOY_LOCK.acquire(blocking=False):
            self.send_json(409, {"error": "Another deployment is running"})
            return
        try:
            self.handle_deploy()
        except Exception as error:
            print(f"Unexpected deployment error: {error!r}", flush=True)
            self.send_json(500, {"error": "Unexpected deployment failure"})
        finally:
            DEPLOY_LOCK.release()

    def handle_deploy(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self.send_json(413, {"error": "Invalid deployment size"})
            return

        signature_header = self.headers.get("X-Asaya-Signature", "")
        try:
            signature = base64.b64decode(signature_header, validate=True)
        except (binascii.Error, ValueError):
            self.send_json(401, {"error": "Invalid deployment signature"})
            return

        with tempfile.TemporaryDirectory(prefix="asaya-deploy-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            bundle_path = temp_dir / "release.bundle"
            signature_path = temp_dir / "release.bundle.sig"
            remaining = content_length
            with bundle_path.open("wb") as bundle:
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ConnectionError("Deployment upload ended early.")
                    bundle.write(chunk)
                    remaining -= len(chunk)
            signature_path.write_bytes(signature)

            try:
                verify_signature(bundle_path, signature_path)
                result = deploy_bundle(bundle_path)
            except (ValueError, subprocess.CalledProcessError) as error:
                details = ""
                if isinstance(error, subprocess.CalledProcessError) and error.stdout:
                    details = error.stdout.decode(errors="replace")[-4000:]
                self.send_json(400, {"error": str(error), "details": details})
                return
            self.send_json(200, result)


class UnixHTTPServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    SOCKET_PATH.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    SOCKET_PATH.unlink(missing_ok=True)
    with UnixHTTPServer(str(SOCKET_PATH), Handler) as server:
        os.chmod(SOCKET_PATH, 0o660)
        server.serve_forever()


if __name__ == "__main__":
    main()
