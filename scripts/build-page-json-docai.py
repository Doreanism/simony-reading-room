#!/usr/bin/env python3
"""
Builds page JSON files using Google Document AI OCR.

Usage:
  python3 scripts/build-page-json-docai.py <document-key> [start-page] [end-page]
  python3 scripts/build-page-json-docai.py --reading <reading-key>

Options:
  --chunk-size N   Pages per API request (default: 15, the online-processing limit)

Environment variables (or .env):
  GOOGLE_PROJECT_ID     GCP project ID
  GOOGLE_LOCATION       Processor location (default: us)
  GOOGLE_PROCESSOR_ID   Document AI OCR processor ID

Requires google-cloud-documentai and pymupdf in the Python venv:
  pip install google-cloud-documentai pymupdf Pillow
"""

import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

DOCUMENTS_META = "content/documents/meta"
READINGS_META = "content/readings/meta"
PUBLIC_D = "public/d"
DEFAULT_CHUNK_SIZE = 15


# ---------------------------------------------------------------------------
# YAML / folio helpers (shared with build-page-json.py)
# ---------------------------------------------------------------------------

def read_yaml(path: str) -> dict[str, str]:
    result = {}
    for line in Path(path).read_text().splitlines():
        m = re.match(r'^([\w_]+):\s*(.+)$', line)
        if m:
            val = m.group(2).strip()
            if (val.startswith('"') and val.endswith('"')) or \
               (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            result[m.group(1)] = val
    return result


def pdf_page_to_folio(pdf_page: int, base_pdf_page: int, base_folio: int,
                      base_side: str) -> tuple[int, str, str]:
    offset = pdf_page - base_pdf_page
    base_is_recto = base_side == "r"
    abs_index = offset + (0 if base_is_recto else 1)
    folio_offset = abs_index // 2
    is_recto = abs_index % 2 == 0
    folio = base_folio + folio_offset
    side = "r" if is_recto else "v"
    return folio, side, f"{folio}{side}"


# ---------------------------------------------------------------------------
# Image dimensions helper
# ---------------------------------------------------------------------------

def get_image_size(img_dir: str, page_num: int) -> tuple[int, int]:
    """Get image dimensions from the webp file, or return (0, 0)."""
    img_path = Path(img_dir) / f"{page_num}.webp"
    if img_path.exists():
        from PIL import Image
        with Image.open(img_path) as img:
            return img.size
    return 0, 0


# ---------------------------------------------------------------------------
# PDF splitting
# ---------------------------------------------------------------------------

def extract_pdf_pages(pdf_path: str, page_numbers: list[int]) -> bytes:
    """Extract specific pages (1-indexed) from a PDF, return as bytes."""
    import fitz

    src = fitz.open(pdf_path)
    dst = fitz.open()
    for page_num in page_numbers:
        dst.insert_pdf(src, from_page=page_num - 1, to_page=page_num - 1)
    pdf_bytes = dst.tobytes()
    dst.close()
    src.close()
    return pdf_bytes


# ---------------------------------------------------------------------------
# Document AI processing
# ---------------------------------------------------------------------------

def process_chunk(client, processor_name: str, pdf_bytes: bytes,
                  page_numbers: list[int], folio_labels: list[str],
                  out_dir: str, img_dir: str, chunk_offset: int, total: int):
    """Send a chunk of PDF pages to Document AI and write page JSON files."""
    from google.cloud import documentai_v1 as documentai

    raw_document = documentai.RawDocument(
        content=pdf_bytes, mime_type="application/pdf"
    )
    request = documentai.ProcessRequest(
        name=processor_name, raw_document=raw_document
    )

    t0 = time.time()
    result = client.process_document(request=request)
    elapsed = time.time() - t0
    document = result.document
    text = document.text

    for i, page in enumerate(document.pages):
        page_num = page_numbers[i]
        folio = folio_labels[i]
        idx = chunk_offset + i + 1

        lines = []
        for line in page.lines:
            # Extract text from text_anchor segments
            line_text = ""
            if line.layout.text_anchor.text_segments:
                for seg in line.layout.text_anchor.text_segments:
                    start = int(seg.start_index)
                    end = int(seg.end_index)
                    line_text += text[start:end]
            line_text = line_text.strip()
            if not line_text or len(line_text) < 2:
                continue

            # Bounding box from normalized vertices
            vertices = line.layout.bounding_poly.normalized_vertices
            if not vertices:
                continue
            x_coords = [v.x for v in vertices]
            y_coords = [v.y for v in vertices]

            lines.append({
                "text": line_text,
                "x0": round(min(x_coords), 4),
                "y0": round(min(y_coords), 4),
                "x1": round(max(x_coords), 4),
                "y1": round(max(y_coords), 4),
            })

        lines.sort(key=lambda l: (l["y0"], l["x0"]))

        img_w, img_h = get_image_size(img_dir, page_num)

        page_json = {
            "pdf_page": page_num,
            "folio": folio,
            "image_width": img_w,
            "image_height": img_h,
            "lines": lines,
        }

        out_path = os.path.join(out_dir, f"{page_num}.json")
        with open(out_path, "w") as f:
            json.dump(page_json, f, indent=2)

        print(f"  [{idx}/{total}] page {page_num} ({folio}) — {len(lines)} lines")

    print(f"  Chunk of {len(page_numbers)} pages processed in {elapsed:.1f}s")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]

    # Parse --chunk-size
    chunk_size = DEFAULT_CHUNK_SIZE
    if "--chunk-size" in args:
        idx = args.index("--chunk-size")
        chunk_size = int(args[idx + 1])
        args = args[:idx] + args[idx + 2:]

    if not args:
        print(__doc__.strip())
        sys.exit(1)

    # Resolve document key + page range
    if args[0] == "--reading":
        reading_key = args[1]
        meta_path = os.path.join(READINGS_META, f"{reading_key}.md")
        if not os.path.exists(meta_path):
            print(f"Reading not found: {meta_path}", file=sys.stderr)
            sys.exit(1)
        meta = read_yaml(meta_path)
        document_key = meta["document"]
        start = int(meta["pdf_page_start"])
        end = int(meta["pdf_page_end"])
    else:
        document_key = args[0]
        doc_meta_path = os.path.join(DOCUMENTS_META, f"{document_key}.md")
        if not os.path.exists(doc_meta_path):
            print(f"Document meta not found: {doc_meta_path}", file=sys.stderr)
            sys.exit(1)
        doc_meta = read_yaml(doc_meta_path)
        total_pages = int(doc_meta["pages"])
        start = int(args[1]) if len(args) > 1 else 1
        end = int(args[2]) if len(args) > 2 else (
            int(args[1]) if len(args) > 1 else total_pages
        )

    # Read document config
    doc_meta_path = os.path.join(DOCUMENTS_META, f"{document_key}.md")
    doc_meta = read_yaml(doc_meta_path)
    base_pdf_page = int(doc_meta["base_pdf_page"])
    base_folio = int(doc_meta["base_folio"])
    base_side = doc_meta["base_side"]

    pdf_path = os.path.join(PUBLIC_D, f"{document_key}.pdf")
    if not os.path.exists(pdf_path):
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    out_dir = os.path.join(PUBLIC_D, document_key)
    os.makedirs(out_dir, exist_ok=True)

    # Build page list, skipping pages that already have JSON
    all_pages = list(range(start, end + 1))
    pages_to_process = []
    folio_for_page = {}
    for p in all_pages:
        _, _, leaf = pdf_page_to_folio(p, base_pdf_page, base_folio, base_side)
        folio_for_page[p] = leaf
        json_path = os.path.join(out_dir, f"{p}.json")
        if os.path.exists(json_path):
            print(f"  SKIP page {p} ({leaf}) — already exists")
        else:
            pages_to_process.append(p)

    if not pages_to_process:
        print("All pages already processed.")
        return

    total = len(pages_to_process)
    print(f"Processing {total} page(s) in chunks of {chunk_size}...")

    # Load environment
    try:
        from dotenv import dotenv_values
        env = {**dotenv_values(), **os.environ}
    except ImportError:
        env = os.environ

    project_id = env.get("GOOGLE_PROJECT_ID")
    location = env.get("GOOGLE_LOCATION", "us")
    processor_id = env.get("GOOGLE_PROCESSOR_ID")

    if not project_id or not processor_id:
        print("Set GOOGLE_PROJECT_ID and GOOGLE_PROCESSOR_ID in .env or environment.",
              file=sys.stderr)
        sys.exit(1)

    # Initialize Document AI client
    from google.cloud import documentai_v1 as documentai

    client_options = {"api_endpoint": f"{location}-documentai.googleapis.com"}
    client = documentai.DocumentProcessorServiceClient(client_options=client_options)
    processor_name = client.processor_path(project_id, location, processor_id)

    # Process in chunks
    for chunk_start in range(0, total, chunk_size):
        chunk_pages = pages_to_process[chunk_start:chunk_start + chunk_size]
        chunk_folios = [folio_for_page[p] for p in chunk_pages]

        print(f"\nChunk: pages {chunk_pages[0]}–{chunk_pages[-1]} "
              f"({len(chunk_pages)} pages)")

        pdf_bytes = extract_pdf_pages(pdf_path, chunk_pages)

        try:
            process_chunk(
                client, processor_name, pdf_bytes,
                chunk_pages, chunk_folios,
                out_dir, out_dir, chunk_start, total,
            )
        except Exception as e:
            print(f"  ERROR processing chunk: {e}", file=sys.stderr)
            print("  Skipping this chunk and continuing...", file=sys.stderr)

    print(f"\nDone. Processed {total} pages → {out_dir}/")


if __name__ == "__main__":
    main()
