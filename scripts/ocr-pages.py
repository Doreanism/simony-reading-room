#!/usr/bin/env python3
"""
Kraken OCR batch processor. Called by build-page-json.ts.

Usage:
  python3 scripts/ocr-pages.py <config-json>

Where config-json contains:
  { "out_dir", "pdf_path", "ocr_model", "pages": [{"page": N, "folio": "..."}] }
"""

import json
import sys
import time
import warnings
from pathlib import Path

from PIL import Image
from kraken.lib import models, vgsl
from kraken.blla import segment
from kraken.rpred import rpred
from htrmopo import get_model
import fitz
import importlib.resources

warnings.filterwarnings("ignore")


def process_pages(config):
    img_dir = config.get("img_dir", config["out_dir"])
    out_dir = config["out_dir"]
    pdf_path = config["pdf_path"]
    ocr_model_doi = config["ocr_model"]
    pages = config["pages"]

    # Check GPU availability
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}", flush=True)
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}", flush=True)

    # Load models once, placing them on GPU if available
    model_path = get_model(ocr_model_doi)
    mlmodel = next(f for f in model_path.iterdir() if f.suffix == ".mlmodel")
    rec_model = models.load_any(str(mlmodel))

    # Load segmentation model explicitly to avoid importlib.resources issues
    try:
        seg_model_path = importlib.resources.files("kraken").joinpath("blla.mlmodel")
        seg_model = vgsl.TorchVGSLModel.load_model(seg_model_path)
    except (TypeError, FileNotFoundError):
        # Fallback: find it in the installed package directory
        import kraken
        kraken_dir = Path(kraken.__file__).parent
        seg_model = vgsl.TorchVGSLModel.load_model(str(kraken_dir / "blla.mlmodel"))

    # Move recognition model to GPU if available
    if device == "cuda":
        rec_model.to(device)

    # Open PDF for page dimensions
    pdf_doc = fitz.open(pdf_path)

    total = len(pages)
    for idx, entry in enumerate(pages):
        page_num = entry["page"]
        folio = entry["folio"]
        t0 = time.time()

        img_path = f"{img_dir}/{page_num}.webp"
        if not Path(img_path).exists():
            print(
                f"  [{idx+1}/{total}] SKIP page {page_num} (no image)", flush=True
            )
            continue

        img = Image.open(img_path)
        w, h = img.size

        # Segment and recognize
        seg = segment(img, model=seg_model, device=device)
        results = list(rpred(rec_model, img, seg))

        # PDF page dimensions
        pdf_page = pdf_doc[page_num - 1]
        pw, ph = pdf_page.rect.width, pdf_page.rect.height

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
                "x0": round(x0 / w, 4),
                "y0": round(y0 / h, 4),
                "x1": round(x1 / w, 4),
                "y1": round(y1 / h, 4),
            })

        lines.sort(key=lambda l: (l["y0"], l["x0"]))

        page_json = {
            "pdf_page": page_num,
            "folio": folio,
            "page_width": pw,
            "page_height": ph,
            "image_width": w,
            "image_height": h,
            "lines": lines,
        }

        out_path = f"{out_dir}/{page_num}.json"
        with open(out_path, "w") as f:
            json.dump(page_json, f, indent=2)

        elapsed = time.time() - t0
        print(
            f"  [{idx+1}/{total}] page {page_num} ({folio})"
            f" — {len(lines)} lines ({elapsed:.1f}s)",
            flush=True,
        )

    pdf_doc.close()
    print(f"Done. Processed {total} pages.")


if __name__ == "__main__":
    config = json.loads(sys.argv[1])
    process_pages(config)
