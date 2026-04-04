#!/bin/bash
#
# Run Kraken OCR on a Vast.ai GPU instance.
#
# Usage:
#   ./scripts/cloud-ocr.sh <document-key> [start-page] [end-page]
#
# Examples:
#   ./scripts/cloud-ocr.sh john-major-sentences-a          # all pages
#   ./scripts/cloud-ocr.sh john-major-sentences-a 1 100    # pages 1-100
#
# Requires: vastai CLI installed and API key set.
# The script will find the cheapest GPU, rent it, run OCR, download results,
# and destroy the instance.

set -euo pipefail

DOCUMENT_KEY="${1:?Usage: cloud-ocr.sh <document-key> [start-page] [end-page]}"
START_PAGE="${2:-}"
END_PAGE="${3:-}"

VENV_PYTHON=".venv/bin/python3"
VASTAI=".venv/bin/vastai"

# Read S3 config from .env
BUCKET=$(grep '^BUCKET=' .env | sed 's/BUCKET=//;s/"//g')
S3_REGION=$(grep '^REGION=' .env | sed 's/REGION=//;s/"//g')

echo "=== Cloud OCR: ${DOCUMENT_KEY} ${START_PAGE:+pages ${START_PAGE}-${END_PAGE:-$START_PAGE}} ==="
echo ""

# 1. Find cheapest offer with decent GPU
echo "Searching for cheapest GPU instance..."
OFFER_ID=$($VASTAI search offers \
  'gpu_ram>=8 num_gpus=1 reliability>0.95 inet_down>100 cuda_vers>=12.0 disk_space>=50' \
  -o 'dph_total' --limit 1 --raw \
  | $VENV_PYTHON -c "import sys,json; offers=json.load(sys.stdin); print(offers[0]['id']) if offers else sys.exit(1)")

OFFER_INFO=$($VASTAI search offers \
  'gpu_ram>=8 num_gpus=1 reliability>0.95 inet_down>100 cuda_vers>=12.0 disk_space>=50' \
  -o 'dph_total' --limit 1 --raw \
  | $VENV_PYTHON -c "
import sys,json
o=json.load(sys.stdin)[0]
print(f\"{o.get('gpu_name','?')} — \${o.get('dph_total',0):.4f}/hr\")
")

echo "Best offer: #${OFFER_ID} (${OFFER_INFO})"
echo ""

# Cleanup trap: destroy instance on any exit
INSTANCE_ID=""
cleanup() {
  if [ -n "$INSTANCE_ID" ]; then
    echo ""
    echo "Destroying instance #${INSTANCE_ID}..."
    $VASTAI destroy instance "$INSTANCE_ID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 2. Create instance
echo "Creating instance..."
INSTANCE_ID=$($VASTAI create instance "$OFFER_ID" \
  --image pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime \
  --disk 50 \
  --ssh --direct \
  --raw \
  | $VENV_PYTHON -c "import sys,json; d=json.load(sys.stdin); print(d.get('new_contract'))")

echo "Instance #${INSTANCE_ID} created. Waiting for it to start..."

# 3. Wait for instance to be running
for i in $(seq 1 60); do
  STATUS=$($VASTAI show instance "$INSTANCE_ID" --raw \
    | $VENV_PYTHON -c "import sys,json; d=json.load(sys.stdin); print(d.get('actual_status',''))")
  if [ "$STATUS" = "running" ]; then
    echo "Instance is running."
    break
  fi
  if [ "$i" = "60" ]; then
    echo "Timed out waiting for instance to start. Destroying..."
    $VASTAI destroy instance "$INSTANCE_ID"
    exit 1
  fi
  echo "  Status: ${STATUS}... (${i}/60)"
  sleep 10
done

# 4. Get SSH connection details (format: ssh://user@host:port)
SSH_URL=$($VASTAI ssh-url "$INSTANCE_ID" 2>&1)
echo "SSH URL: ${SSH_URL}"
SSH_HOST=$(echo "$SSH_URL" | sed 's|ssh://||' | sed 's|:.*||')
SSH_PORT=$(echo "$SSH_URL" | grep -oP ':\K\d+$')

if [ -z "$SSH_HOST" ] || [ -z "$SSH_PORT" ]; then
  echo "Failed to get SSH details. Raw output: ${SSH_URL}"
  echo "Destroying instance..."
  $VASTAI destroy instance "$INSTANCE_ID"
  exit 1
fi

SSH_CMD="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 -p ${SSH_PORT} ${SSH_HOST}"
SCP_CMD="scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P ${SSH_PORT}"

echo "SSH: ${SSH_CMD}"
echo ""

# Wait a bit for SSH to be ready
sleep 15

# 5. Upload files
echo "Uploading build script and document meta..."

$SSH_CMD "mkdir -p /workspace/scripts/lib /workspace/content/documents/meta /workspace/public/d/${DOCUMENT_KEY}"
$SCP_CMD scripts/build-page-json.py "${SSH_HOST}:/workspace/scripts/build-page-json.py"
$SCP_CMD scripts/lib/page_json_helpers.py "${SSH_HOST}:/workspace/scripts/lib/page_json_helpers.py"
$SCP_CMD scripts/lib/page_json_kraken.py "${SSH_HOST}:/workspace/scripts/lib/page_json_kraken.py"
$SCP_CMD "content/documents/meta/${DOCUMENT_KEY}.md" "${SSH_HOST}:/workspace/content/documents/meta/${DOCUMENT_KEY}.md"

# 6. Install dependencies and run OCR
echo "Installing Kraken on remote instance..."
$SSH_CMD "pip install kraken pymupdf python-dotenv 2>&1 | tail -3"

# Build the page range args
PAGE_ARGS=""
if [ -n "$START_PAGE" ]; then
  PAGE_ARGS="$START_PAGE"
  if [ -n "$END_PAGE" ]; then
    PAGE_ARGS="$START_PAGE $END_PAGE"
  fi
fi

echo "Running OCR..."
echo ""

$SSH_CMD "cd /workspace && BUCKET=${BUCKET} REGION=${S3_REGION} python3 scripts/build-page-json.py kraken ${DOCUMENT_KEY} ${PAGE_ARGS}"

# 7. Download results
echo ""
echo "Downloading JSON results..."
mkdir -p "public/d/${DOCUMENT_KEY}"
$SCP_CMD "${SSH_HOST}:/workspace/public/d/${DOCUMENT_KEY}/*.json" "public/d/${DOCUMENT_KEY}/"
echo "Downloaded to public/d/${DOCUMENT_KEY}/"

# 8. Destroy instance
echo ""
echo "Destroying instance #${INSTANCE_ID}..."
$VASTAI destroy instance "$INSTANCE_ID"
INSTANCE_ID=""  # prevent trap from double-destroying

echo ""
echo "=== Done! ==="
