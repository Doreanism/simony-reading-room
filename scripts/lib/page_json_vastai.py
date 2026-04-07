"""Vast.ai cloud Kraken OCR mode (--vastai) for build-page-json.py."""

import json
import os
import subprocess
import sys
import time
from pathlib import Path


def _run(cmd: list[str], capture=False) -> subprocess.CompletedProcess:
    if capture:
        return subprocess.run(cmd, check=True, capture_output=True, text=True)
    return subprocess.run(cmd, check=True)


def run_vastai(document_key: str, start_page: int | None, end_page: int | None):
    """Rent a Vast.ai GPU, run Kraken OCR remotely, download results, destroy instance."""
    venv_python = ".venv/bin/python3"
    vastai = ".venv/bin/vastai"

    # Read S3 config from .env
    env_vars = {}
    try:
        for line in Path(".env").read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    bucket = env_vars.get("BUCKET") or os.environ.get("BUCKET", "")
    region = env_vars.get("REGION") or os.environ.get("REGION", "us-west-2")

    page_desc = f"pages {start_page}-{end_page}" if start_page else "all pages"
    print(f"=== Cloud OCR: {document_key} {page_desc} ===\n")

    # Find cheapest offer
    print("Searching for cheapest GPU instance...")
    query = "gpu_ram>=8 num_gpus=1 reliability>0.95 inet_down>100 cuda_vers>=12.0 disk_space>=50"
    raw = _run([vastai, "search", "offers", query, "-o", "dph_total", "--limit", "1", "--raw"],
               capture=True).stdout
    offers = json.loads(raw)
    if not offers:
        print("No suitable offers found.", file=sys.stderr)
        sys.exit(1)
    offer = offers[0]
    offer_id = str(offer["id"])
    print(f"Best offer: #{offer_id} ({offer.get('gpu_name','?')} — ${offer.get('dph_total',0):.4f}/hr)\n")

    # Create instance
    print("Creating instance...")
    raw = _run([vastai, "create", "instance", offer_id,
                "--image", "pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime",
                "--disk", "50", "--ssh", "--direct", "--raw"], capture=True).stdout
    instance_id = str(json.loads(raw)["new_contract"])
    print(f"Instance #{instance_id} created. Waiting for it to start...")

    def destroy():
        print(f"\nDestroying instance #{instance_id}...")
        subprocess.run([vastai, "destroy", "instance", instance_id], check=False)

    try:
        # Wait for running
        for i in range(1, 61):
            raw = _run([vastai, "show", "instance", instance_id, "--raw"], capture=True).stdout
            status = json.loads(raw).get("actual_status", "")
            if status == "running":
                print("Instance is running.")
                break
            if i == 60:
                print("Timed out waiting for instance to start.", file=sys.stderr)
                sys.exit(1)
            print(f"  Status: {status}... ({i}/60)")
            time.sleep(10)

        # Get SSH details
        ssh_url = _run([vastai, "ssh-url", instance_id], capture=True).stdout.strip()
        print(f"SSH URL: {ssh_url}")
        # Format: ssh://user@host:port
        without_scheme = ssh_url.replace("ssh://", "")
        ssh_host, _, ssh_port = without_scheme.rpartition(":")
        if not ssh_host or not ssh_port:
            print(f"Failed to parse SSH URL: {ssh_url}", file=sys.stderr)
            sys.exit(1)

        ssh_opts = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                    "-o", "ConnectTimeout=30"]
        ssh_cmd = ["ssh"] + ssh_opts + ["-p", ssh_port, ssh_host]
        scp_opts = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                    "-P", ssh_port]

        print()
        time.sleep(15)

        # Upload files
        print("Uploading build script and lib files...")
        _run(ssh_cmd + [f"mkdir -p /workspace/scripts/lib /workspace/content/documents /workspace/public/d/{document_key}"])

        lib_dir = Path(__file__).parent
        script_dir = lib_dir.parent
        for f in [
            (str(script_dir / "build-page-json.py"), f"{ssh_host}:/workspace/scripts/build-page-json.py"),
            (str(lib_dir / "page_json_helpers.py"), f"{ssh_host}:/workspace/scripts/lib/page_json_helpers.py"),
            (str(lib_dir / "page_json_kraken.py"), f"{ssh_host}:/workspace/scripts/lib/page_json_kraken.py"),
        ]:
            _run(["scp"] + scp_opts + [f[0], f[1]])

        _run(["scp"] + scp_opts +
             [f"content/documents/{document_key}.md",
              f"{ssh_host}:/workspace/content/documents/{document_key}.md"])

        # Install deps
        print("Installing Kraken on remote instance...")
        _run(ssh_cmd + ["pip install kraken pymupdf python-dotenv 2>&1 | tail -3"])

        # Run OCR
        page_args = ""
        if start_page:
            page_args = str(start_page)
            if end_page:
                page_args += f" {end_page}"

        print("Running OCR...\n")
        env_str = f"BUCKET={bucket} REGION={region}"
        _run(ssh_cmd + [f"cd /workspace && {env_str} python3 scripts/build-page-json.py kraken {document_key} {page_args}"])

        # Download results
        print("\nDownloading JSON results...")
        Path(f"public/d/{document_key}").mkdir(parents=True, exist_ok=True)
        _run(["scp"] + scp_opts +
             [f"{ssh_host}:/workspace/public/d/{document_key}/*.json",
              f"public/d/{document_key}/"])
        print(f"Downloaded to public/d/{document_key}/")

    finally:
        destroy()

    print("\n=== Done! ===")
