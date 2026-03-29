#!/usr/bin/env python3
"""
Builds page JSON files with OCR text and line positions.

Usage:
  python3 scripts/build-page-json.py <document-key>
  python3 scripts/build-page-json.py <document-key> <start-page> [end-page]
  python3 scripts/build-page-json.py --reading <reading-key>

Options:
  --from-pdf    Extract text from the PDF's embedded OCR layer (fast, no Kraken)
  --max-dim N   Scale images so the largest dimension is N pixels (default: 2400)
  --no-scale    Disable scaling (process at original resolution)

By default, runs Kraken OCR (slow, high quality). Use --from-pdf when the
source PDF already has acceptable OCR text embedded.

Reads ocr_model and base pagination from document metadata.
Requires kraken, pymupdf, and Pillow (install in .venv).

Uses multiprocessing to OCR pages in parallel. Set WORKERS env var
to control parallelism (default: CPU count).
"""

import json
import os
import re
import sys
import time
import warnings
from multiprocessing import get_context
from pathlib import Path

warnings.filterwarnings("ignore")

DOCUMENTS_META = "content/documents/meta"
READINGS_META = "content/readings/meta"
PUBLIC_D = "public/d"
DEFAULT_OCR_MODEL = "10.5281/zenodo.11113737"
DEFAULT_MAX_DIM = 2400


# ---------------------------------------------------------------------------
# YAML / folio helpers (ported from scripts/lib/folio.ts)
# ---------------------------------------------------------------------------

def read_yaml(path: str) -> dict[str, str]:
    """Simple YAML parser for flat key: value frontmatter files."""
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
    """Derive folio leaf from PDF page number.

    Returns (folio_number, side, leaf_string).
    """
    offset = pdf_page - base_pdf_page
    base_is_recto = base_side == "r"
    abs_index = offset + (0 if base_is_recto else 1)
    folio_offset = abs_index // 2
    is_recto = abs_index % 2 == 0
    folio = base_folio + folio_offset
    side = "r" if is_recto else "v"
    return folio, side, f"{folio}{side}"


# ---------------------------------------------------------------------------
# Worker init / page processor
# ---------------------------------------------------------------------------

rec_model = None
seg_model = None
_worker_counter = None
_worker_total = None


def _download_image_from_s3(document_key: str, page_num: int, img_dir: str) -> str | None:
    """Download a page image from S3 if not present locally. Returns path or None."""
    try:
        from urllib.request import urlretrieve
        from dotenv import dotenv_values
        env = dotenv_values()
        bucket = env.get("BUCKET") or os.environ.get("BUCKET")
        region = env.get("REGION") or os.environ.get("REGION", "us-west-2")
        if not bucket:
            return None
        url = f"https://{bucket}.s3.{region}.amazonaws.com/documents/{document_key}/{page_num}.webp"
        local_path = f"{img_dir}/{page_num}.webp"
        os.makedirs(img_dir, exist_ok=True)
        urlretrieve(url, local_path)
        return local_path
    except Exception:
        return None


def init_worker(mlmodel_path: str, counter, total_workers):
    """Load Kraken models once per worker process."""
    global rec_model, seg_model, _worker_counter, _worker_total
    _worker_counter = counter
    _worker_total = total_workers

    import torch
    import importlib.resources
    from kraken.lib import models, vgsl

    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Recognition model (path resolved once in main process)
    rec_model = models.load_any(mlmodel_path)
    if device == "cuda":
        rec_model.to(device)

    # Segmentation model
    try:
        seg_model_path = importlib.resources.files("kraken").joinpath("blla.mlmodel")
        seg_model = vgsl.TorchVGSLModel.load_model(seg_model_path)
    except (TypeError, FileNotFoundError):
        import kraken as kraken_pkg
        kraken_dir = Path(kraken_pkg.__file__).parent
        seg_model = vgsl.TorchVGSLModel.load_model(str(kraken_dir / "blla.mlmodel"))

    with _worker_counter.get_lock():
        _worker_counter.value += 1
        n = _worker_counter.value
    if n == _worker_total:
        print(f"All {_worker_total} worker(s) ready.", flush=True)


def process_page(args: dict) -> str:
    """OCR a single page. Returns a status message string."""
    import torch
    from PIL import Image
    from kraken.blla import segment
    from kraken.rpred import rpred

    page_num = args["page"]
    folio = args["folio"]
    img_dir = args["img_dir"]
    out_dir = args["out_dir"]
    idx = args["idx"]
    total = args["total"]

    t0 = time.time()
    device = "cuda" if torch.cuda.is_available() else "cpu"

    out_path = f"{out_dir}/{page_num}.json"
    if Path(out_path).exists():
        return f"  [{idx}/{total}] SKIP page {page_num} ({folio}) — already exists"

    img_path = f"{img_dir}/{page_num}.webp"
    if not Path(img_path).exists():
        img_path = _download_image_from_s3(args["document_key"], page_num, img_dir)
        if not img_path:
            return f"  [{idx}/{total}] SKIP page {page_num} (no image)"

    img = Image.open(img_path)
    orig_w, orig_h = img.size

    # Scale down for faster OCR; coordinates are normalized so this is safe
    max_dim = args.get("max_dim", DEFAULT_MAX_DIM)
    if max_dim and max(orig_w, orig_h) > max_dim:
        scale = max_dim / max(orig_w, orig_h)
        img = img.resize((round(orig_w * scale), round(orig_h * scale)),
                         Image.LANCZOS)
    ocr_w, ocr_h = img.size

    # Segment and recognize
    seg = segment(img, model=seg_model, device=device)
    results = list(rpred(rec_model, img, seg))

    lines = []
    for r in results:
        text = r.prediction.strip()
        if not text or len(text) < 2:
            continue
        xs = [p[0] for p in r.boundary]
        ys = [p[1] for p in r.boundary]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        lines.append({
            "text": text,
            "x0": round(x0 / ocr_w, 4),
            "y0": round(y0 / ocr_h, 4),
            "x1": round(x1 / ocr_w, 4),
            "y1": round(y1 / ocr_h, 4),
        })

    lines.sort(key=lambda l: (l["y0"], l["x0"]))

    page_json = {
        "pdf_page": page_num,
        "folio": folio,
        "image_width": orig_w,
        "image_height": orig_h,
        "lines": lines,
    }

    out_path = f"{out_dir}/{page_num}.json"
    with open(out_path, "w") as f:
        json.dump(page_json, f, indent=2)

    elapsed = time.time() - t0
    return (f"  [{idx}/{total}] page {page_num} ({folio})"
            f" — {len(lines)} lines ({elapsed:.1f}s)")


# ---------------------------------------------------------------------------
# PDF-embedded OCR extraction (--from-pdf)
# ---------------------------------------------------------------------------

def extract_from_pdf(pdf_path: str, page_args: list, out_dir: str,
                     base_pdf_page: int, base_folio: int, base_side: str):
    """Extract text from the PDF's embedded OCR layer using PyMuPDF."""
    import fitz
    from PIL import Image

    doc = fitz.open(pdf_path)
    total = len(page_args)

    for pa in page_args:
        page_num = pa["page"]
        folio = pa["folio"]
        idx = pa["idx"]

        out_path = f"{out_dir}/{page_num}.json"
        if Path(out_path).exists():
            print(f"  [{idx}/{total}] SKIP page {page_num} ({folio}) — already exists")
            continue

        page = doc[page_num - 1]
        pw, ph = page.rect.width, page.rect.height

        # Get image dimensions from webp if available
        img_path = f"{out_dir}/{page_num}.webp"
        if Path(img_path).exists():
            with Image.open(img_path) as img:
                img_w, img_h = img.size
        else:
            # Estimate from native embedded image resolution
            images = page.get_images()
            if images:
                max_w = max(doc.extract_image(im[0])["width"] for im in images)
                dpi = round(max_w / (pw / 72))
            else:
                dpi = 300
            img_w = round(pw * dpi / 72)
            img_h = round(ph * dpi / 72)

        # Extract text as dict to get line-level bounding boxes
        text_dict = page.get_text("dict")
        lines = []
        for block in text_dict["blocks"]:
            if block["type"] != 0:  # text blocks only
                continue
            for line in block["lines"]:
                text = " ".join(span["text"] for span in line["spans"]).strip()
                if not text or len(text) < 2:
                    continue
                bbox = line["bbox"]  # (x0, y0, x1, y1) in points
                lines.append({
                    "text": text,
                    "x0": round(bbox[0] / pw, 4),
                    "y0": round(bbox[1] / ph, 4),
                    "x1": round(bbox[2] / pw, 4),
                    "y1": round(bbox[3] / ph, 4),
                })

        lines.sort(key=lambda l: (l["y0"], l["x0"]))

        page_json = {
            "pdf_page": page_num,
            "folio": folio,
            "image_width": img_w,
            "image_height": img_h,
            "lines": lines,
        }

        with open(out_path, "w") as f:
            json.dump(page_json, f, indent=2)

        print(f"  [{idx}/{total}] page {page_num} ({folio}) — {len(lines)} lines")

    doc.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]

    # Parse flags
    from_pdf = "--from-pdf" in args
    if from_pdf:
        args.remove("--from-pdf")

    max_dim = DEFAULT_MAX_DIM
    if "--max-dim" in args:
        idx = args.index("--max-dim")
        max_dim = int(args[idx + 1])
        args = args[:idx] + args[idx + 2:]
    if "--no-scale" in args:
        args.remove("--no-scale")
        max_dim = 0

    if not args:
        print("Usage:")
        print("  python3 scripts/build-page-json.py <document-key> [start-page] [end-page]")
        print("  python3 scripts/build-page-json.py --reading <reading-key>")
        print("  Options: --from-pdf, --max-dim N (default 2400), --no-scale")
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
        end = int(args[2]) if len(args) > 2 else (int(args[1]) if len(args) > 1 else total_pages)

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
    page_args = []
    total = end - start + 1
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

    if from_pdf:
        pdf_path = os.path.join(PUBLIC_D, f"{document_key}.pdf")
        if not os.path.exists(pdf_path):
            print(f"PDF not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        print(f"Extracting embedded OCR from PDF for {total} page(s)...")
        extract_from_pdf(pdf_path, page_args, out_dir,
                         base_pdf_page, base_folio, base_side)
    else:
        # Each worker uses ~1.1GB RAM; default to whichever is lower:
        # half the CPU count, or available memory / 2GB (with headroom)
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemAvailable:"):
                        mem_available_gib = int(line.split()[1]) / (1024 * 1024)
                        break
                else:
                    mem_available_gib = None
        except OSError:
            mem_available_gib = None

        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"

        if device == "cuda":
            default_workers = 1
        else:
            cpu_based = max(1, (os.cpu_count() or 1) // 2)
            mem_based = max(1, int(mem_available_gib / 2)) if mem_available_gib else cpu_based
            default_workers = min(cpu_based, mem_based)
        workers = int(os.environ.get("WORKERS", default_workers))

        # Resolve OCR model path once, so workers don't repeat the slow DOI lookup
        from htrmopo import get_model
        print("Downloading OCR model...", flush=True)
        model_dir = get_model(ocr_model)
        mlmodel_path = str(next(f for f in model_dir.iterdir() if f.suffix == ".mlmodel"))

        scale_info = f"max {max_dim}px" if max_dim else "no scaling"
        print(f"Running Kraken OCR on {total} page(s) with {workers} worker(s) on {device} ({scale_info})...")
        print("Starting workers...", flush=True)

        ctx = get_context("spawn")
        counter = ctx.Value("i", 0)
        with ctx.Pool(processes=workers, initializer=init_worker, initargs=(mlmodel_path, counter, workers)) as pool:
            for result in pool.imap(process_page, page_args):
                print(result, flush=True)

    print(f"Done. Processed {total} pages.")


if __name__ == "__main__":
    main()
