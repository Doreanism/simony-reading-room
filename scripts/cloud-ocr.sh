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
START_PAGE="${2:-1}"

# Read total pages from document meta if end page not specified
if [ -z "${3:-}" ]; then
  END_PAGE=$(grep '^pages:' "content/documents/meta/${DOCUMENT_KEY}.md" | awk '{print $2}')
  echo "No end page specified, using total pages from meta: ${END_PAGE}"
else
  END_PAGE="$3"
fi

VENV_PYTHON=".venv/bin/python3"
VASTAI=".venv/bin/vastai"

echo "=== Cloud OCR: ${DOCUMENT_KEY} pages ${START_PAGE}-${END_PAGE} ==="
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
echo "Uploading OCR script and page images..."

# Create remote directories
$SSH_CMD "mkdir -p /workspace/pages /workspace/output"

# Upload the OCR script
$SCP_CMD scripts/ocr-pages.py "${SSH_HOST}:/workspace/ocr-pages.py"

# Upload page images (only the ones we need)
echo "Uploading ${START_PAGE}-${END_PAGE} page images..."
for page in $(seq "$START_PAGE" "$END_PAGE"); do
  IMG="public/d/${DOCUMENT_KEY}/${page}.webp"
  if [ -f "$IMG" ]; then
    echo -ne "\r  Uploading page ${page}..."
    $SCP_CMD "$IMG" "${SSH_HOST}:/workspace/pages/${page}.webp" 2>/dev/null
  fi
done
echo ""

# Upload the PDF (for page dimensions)
echo "Uploading PDF..."
$SCP_CMD "public/d/${DOCUMENT_KEY}.pdf" "${SSH_HOST}:/workspace/${DOCUMENT_KEY}.pdf"

# 6. Build config and run OCR on the remote
echo "Installing Kraken on remote instance..."
$SSH_CMD "pip install kraken pymupdf 2>&1 | tail -3"

# Read document meta for folio mapping
OCR_MODEL=$(grep '^ocr_model:' "content/documents/meta/${DOCUMENT_KEY}.md" | sed 's/ocr_model: *//;s/"//g' || echo "10.5281/zenodo.11113737")
BASE_PDF_PAGE=$(grep '^base_pdf_page:' "content/documents/meta/${DOCUMENT_KEY}.md" | awk '{print $2}')
BASE_FOLIO=$(grep '^base_folio:' "content/documents/meta/${DOCUMENT_KEY}.md" | awk '{print $2}')
BASE_SIDE=$(grep '^base_side:' "content/documents/meta/${DOCUMENT_KEY}.md" | awk '{print $2}')

# Build page/folio list using our local folio library
PAGES_JSON=$($VENV_PYTHON -c "
import json, sys
sys.path.insert(0, 'scripts/lib')

# Inline folio calculation
base_pdf = ${BASE_PDF_PAGE}
base_folio = ${BASE_FOLIO}
base_side = '${BASE_SIDE}'

pages = []
for p in range(${START_PAGE}, ${END_PAGE} + 1):
    offset = p - base_pdf
    base_is_recto = base_side == 'r'
    abs_index = offset + (0 if base_is_recto else 1)
    folio_offset = abs_index // 2
    is_recto = abs_index % 2 == 0
    folio = base_folio + folio_offset
    side = 'r' if is_recto else 'v'
    pages.append({'page': p, 'folio': f'{folio}{side}'})

print(json.dumps(pages))
")

CONFIG_JSON=$(cat <<ENDJSON
{
  "img_dir": "/workspace/pages",
  "out_dir": "/workspace/output",
  "pdf_path": "/workspace/${DOCUMENT_KEY}.pdf",
  "ocr_model": "${OCR_MODEL}",
  "pages": ${PAGES_JSON}
}
ENDJSON
)

echo "Running OCR on ${START_PAGE}-${END_PAGE} ($(echo "$PAGES_JSON" | $VENV_PYTHON -c "import sys,json;print(len(json.load(sys.stdin)))") pages)..."
echo ""

# Write config to remote and run
echo "$CONFIG_JSON" | $SSH_CMD "cat > /workspace/config.json"
$SSH_CMD 'cd /workspace && python3 ocr-pages.py "$(cat config.json)"'

# 7. Download results
echo ""
echo "Downloading JSON results..."
mkdir -p "public/d/${DOCUMENT_KEY}"
$SCP_CMD "${SSH_HOST}:/workspace/output/*.json" "public/d/${DOCUMENT_KEY}/"
echo "Downloaded to public/d/${DOCUMENT_KEY}/"

# 8. Destroy instance
echo ""
echo "Destroying instance #${INSTANCE_ID}..."
$VASTAI destroy instance "$INSTANCE_ID"
INSTANCE_ID=""  # prevent trap from double-destroying

echo ""
echo "=== Done! ==="
