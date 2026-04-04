"""Kraken OCR mode for build-page-json.py."""

import json
import os
import time
from pathlib import Path

DEFAULT_MAX_DIM = 2400

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

    rec_model = models.load_any(mlmodel_path)
    if device == "cuda":
        rec_model.to(device)

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
    """OCR a single page with Kraken. Returns a status message string."""
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

    max_dim = args.get("max_dim", DEFAULT_MAX_DIM)
    if max_dim and max(orig_w, orig_h) > max_dim:
        scale = max_dim / max(orig_w, orig_h)
        img = img.resize((round(orig_w * scale), round(orig_h * scale)),
                         Image.LANCZOS)
    ocr_w, ocr_h = img.size

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

    with open(out_path, "w") as f:
        json.dump(page_json, f, indent=2)

    elapsed = time.time() - t0
    return (f"  [{idx}/{total}] page {page_num} ({folio})"
            f" — {len(lines)} lines ({elapsed:.1f}s)")


def run_kraken(page_args: list, out_dir: str, ocr_model: str, max_dim: int):
    """Run Kraken OCR on the given pages using multiprocessing."""
    import os
    import torch
    from multiprocessing import get_context
    from htrmopo import get_model

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

    device = "cuda" if torch.cuda.is_available() else "cpu"

    if device == "cuda":
        default_workers = 1
    else:
        cpu_based = max(1, (os.cpu_count() or 1) // 2)
        mem_based = max(1, int(mem_available_gib / 2)) if mem_available_gib else cpu_based
        default_workers = min(cpu_based, mem_based)
    workers = int(os.environ.get("WORKERS", default_workers))

    print("Downloading OCR model...", flush=True)
    model_dir = get_model(ocr_model)
    mlmodel_path = str(next(f for f in model_dir.iterdir() if f.suffix == ".mlmodel"))

    total = len(page_args)
    scale_info = f"max {max_dim}px" if max_dim else "no scaling"
    print(f"Running Kraken OCR on {total} page(s) with {workers} worker(s) on {device} ({scale_info})...")
    print("Starting workers...", flush=True)

    ctx = get_context("spawn")
    counter = ctx.Value("i", 0)
    with ctx.Pool(processes=workers, initializer=init_worker, initargs=(mlmodel_path, counter, workers)) as pool:
        for result in pool.imap(process_page, page_args):
            print(result, flush=True)
