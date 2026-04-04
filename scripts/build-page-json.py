#!/usr/bin/env python3
"""
Builds page JSON files with OCR text and line positions.

Usage:
  python3 scripts/build-page-json.py <mode> <document-key>
  python3 scripts/build-page-json.py <mode> <document-key> <start-page> [end-page]
  python3 scripts/build-page-json.py <mode> --reading <reading-key>

Modes:
  kraken    Kraken OCR (slow, high quality). Requires kraken, pymupdf, Pillow in .venv.
  frompdf   Extract text from the PDF's embedded OCR layer (fast, no model required).
  docai     Google Document AI OCR (requires GOOGLE_* env vars in .env).
  vastai    Rent a Vast.ai GPU, run Kraken remotely, download results, destroy instance.

Options:
  --chunk-size N    Pages per Document AI request (default: 15, docai only)
  --max-dim N       Scale images so the largest dimension is N pixels (default: 2400, kraken only)
  --no-scale        Disable scaling (kraken only)

Document AI environment variables (from .env or environment):
  GOOGLE_PROJECT_ID     GCP project ID
  GOOGLE_LOCATION       Processor location (default: us)
  GOOGLE_PROCESSOR_ID   Document AI OCR processor ID

Reads ocr_model and base pagination from document metadata.
Vast.ai requires vastai CLI installed in .venv.

Uses multiprocessing to OCR pages in parallel (kraken only). Set WORKERS env var
to control parallelism (default: CPU count).
"""

import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

# Allow `from lib.xxx import` when run as a script
sys.path.insert(0, str(Path(__file__).parent))

from lib.page_json_helpers import (
    DOCUMENTS_META, READINGS_META, PUBLIC_D,
    DEFAULT_OCR_MODEL, DEFAULT_MAX_DIM, DEFAULT_CHUNK_SIZE,
    read_yaml, pdf_page_to_folio,
)

MODES = ("kraken", "frompdf", "docai", "vastai")


def main():
    args = sys.argv[1:]

    if not args or args[0] not in MODES:
        print(__doc__.strip())
        sys.exit(1)

    mode = args[0]
    args = args[1:]

    # Parse options
    max_dim = DEFAULT_MAX_DIM
    if "--max-dim" in args:
        idx = args.index("--max-dim")
        max_dim = int(args[idx + 1])
        args = args[:idx] + args[idx + 2:]
    if "--no-scale" in args:
        args.remove("--no-scale")
        max_dim = 0

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
        explicit_range = False
    else:
        document_key = args[0]
        doc_meta_path = os.path.join(DOCUMENTS_META, f"{document_key}.md")
        if not os.path.exists(doc_meta_path):
            print(f"Document meta not found: {doc_meta_path}", file=sys.stderr)
            sys.exit(1)
        doc_meta = read_yaml(doc_meta_path)
        total_pages = int(doc_meta["pages"])
        start = int(args[1]) if len(args) > 1 else 1
        end = int(args[2]) if len(args) > 2 else (int(args[1]) if len(args) > 1 else total_pages)
        explicit_range = len(args) > 1

    # Vast.ai: delegate entirely (no local page-building needed)
    if mode == "vastai":
        from lib.page_json_vastai import run_vastai
        run_vastai(
            document_key,
            start if explicit_range else None,
            end if len(args) > 2 else None,
        )
        return

    # Read document config
    doc_meta_path = os.path.join(DOCUMENTS_META, f"{document_key}.md")
    doc_meta = read_yaml(doc_meta_path)
    base_pdf_page = int(doc_meta["base_pdf_page"])
    base_folio = int(doc_meta["base_folio"])
    pagination = doc_meta.get("pagination", "folio-two-column")
    is_page_pagination = pagination == "page"
    base_side = doc_meta.get("base_side", "r") if not is_page_pagination else "r"
    ocr_model = doc_meta.get("ocr_model", DEFAULT_OCR_MODEL)

    out_dir = os.path.join(PUBLIC_D, document_key)
    os.makedirs(out_dir, exist_ok=True)

    # Build page list
    total = end - start + 1
    page_args = []
    for i, p in enumerate(range(start, end + 1)):
        if is_page_pagination:
            leaf = str(p - base_pdf_page + base_folio)
        else:
            _, _, leaf = pdf_page_to_folio(p, base_pdf_page, base_folio, base_side)
        page_args.append({
            "page": p,
            "folio": leaf,
            "document_key": document_key,
            "img_dir": out_dir,
            "out_dir": out_dir,
            "idx": i + 1,
            "total": total,
            "max_dim": max_dim,
        })

    pdf_path = os.path.join(PUBLIC_D, f"{document_key}.pdf")

    if mode == "frompdf":
        if not os.path.exists(pdf_path):
            print(f"PDF not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        print(f"Extracting embedded OCR from PDF for {total} page(s)...")
        from lib.page_json_frompdf import extract_from_pdf
        extract_from_pdf(pdf_path, page_args, out_dir)

    elif mode == "docai":
        if not os.path.exists(pdf_path):
            print(f"PDF not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        from lib.page_json_docai import run_docai
        run_docai(page_args, pdf_path, out_dir, chunk_size)

    else:  # kraken
        from lib.page_json_kraken import run_kraken
        run_kraken(page_args, out_dir, ocr_model, max_dim)

    print(f"Done. Processed {total} pages.")


if __name__ == "__main__":
    main()
