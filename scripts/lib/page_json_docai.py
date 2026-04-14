"""Google Document AI OCR mode (--docai) for build-page-json.py."""

import json
import os
import sys
import time
from pathlib import Path


def process_page_docai(client, processor_name: str, image_bytes: bytes,
                       mime_type: str, page_num: int, folio: str,
                       out_dir: str, idx: int, total: int):
    """Send one page image to Document AI and write its page JSON file."""
    from google.cloud import documentai_v1 as documentai
    from PIL import Image

    raw_document = documentai.RawDocument(
        content=image_bytes, mime_type=mime_type
    )
    request = documentai.ProcessRequest(
        name=processor_name, raw_document=raw_document
    )

    t0 = time.time()
    result = client.process_document(request=request)
    elapsed = time.time() - t0
    document = result.document
    text = document.text

    page = document.pages[0]
    lines = []
    for line in page.lines:
        line_text = ""
        if line.layout.text_anchor.text_segments:
            for seg in line.layout.text_anchor.text_segments:
                start = int(seg.start_index)
                end = int(seg.end_index)
                line_text += text[start:end]
        line_text = line_text.strip()
        if not line_text or len(line_text) < 2:
            continue

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

    img_w, img_h = 0, 0
    img_path = Path(out_dir) / f"{page_num}.webp"
    if img_path.exists():
        with Image.open(img_path) as img:
            img_w, img_h = img.size

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

    print(f"  [{idx}/{total}] page {page_num} ({folio}) — {len(lines)} lines, {elapsed:.1f}s")


def run_docai(page_args: list, pdf_path: str, out_dir: str, chunk_size: int, concurrency: int = 4):
    """Run Google Document AI OCR on the given pages. Sends one page image per RPC."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    del chunk_size  # unused: we send one image per request
    del pdf_path    # unused: we read pre-rendered webp images from out_dir

    try:
        from dotenv import dotenv_values
        env = {**dotenv_values(), **os.environ}
    except ImportError:
        env = dict(os.environ)

    project_id = env.get("GOOGLE_PROJECT_ID")
    location = env.get("GOOGLE_LOCATION", "us")
    processor_id = env.get("GOOGLE_PROCESSOR_ID")

    if not project_id or not processor_id:
        print("Error: set GOOGLE_PROJECT_ID and GOOGLE_PROCESSOR_ID in .env or environment.",
              file=sys.stderr)
        sys.exit(1)

    from google.cloud import documentai_v1 as documentai

    client_options = {"api_endpoint": f"{location}-documentai.googleapis.com"}
    client = documentai.DocumentProcessorServiceClient(client_options=client_options)
    processor_name = client.processor_path(project_id, location, processor_id)

    pages_to_process = [pa for pa in page_args
                        if not Path(os.path.join(out_dir, f"{pa['page']}.json")).exists()]
    for pa in page_args:
        if pa not in pages_to_process:
            print(f"  SKIP page {pa['page']} ({pa['folio']}) — already exists")

    if not pages_to_process:
        print("All pages already processed.")
        return

    total = len(pages_to_process)
    print(f"Processing {total} page(s) via Document AI "
          f"(one image per request, concurrency={concurrency})...")

    def work(i, pa):
        page_num = pa["page"]
        folio = pa["folio"]
        img_path = Path(out_dir) / f"{page_num}.webp"

        if not img_path.exists():
            print(f"  ERROR page {page_num}: missing image {img_path}", file=sys.stderr)
            return

        with open(img_path, "rb") as f:
            image_bytes = f.read()

        try:
            process_page_docai(
                client, processor_name, image_bytes, "image/webp",
                page_num, folio, out_dir, i + 1, total,
            )
        except Exception as e:
            print(f"  ERROR page {page_num} ({folio}): {e}", file=sys.stderr)
            print("  Skipping and continuing...", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(work, i, pa) for i, pa in enumerate(pages_to_process)]
        for fut in as_completed(futures):
            fut.result()
