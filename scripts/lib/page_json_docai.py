"""Google Document AI OCR mode (--docai) for build-page-json.py."""

import json
import os
import sys
import time
from pathlib import Path


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


def process_chunk_docai(client, processor_name: str, pdf_bytes: bytes,
                        page_numbers: list[int], folio_labels: list[str],
                        out_dir: str, chunk_offset: int, total: int):
    """Send a chunk of PDF pages to Document AI and write page JSON files."""
    from google.cloud import documentai_v1 as documentai
    from PIL import Image

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

        print(f"  [{idx}/{total}] page {page_num} ({folio}) — {len(lines)} lines")

    print(f"  Chunk of {len(page_numbers)} pages processed in {elapsed:.1f}s")


def run_docai(page_args: list, pdf_path: str, out_dir: str, chunk_size: int):
    """Run Google Document AI OCR on the given pages."""
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

    # Skip pages that already have JSON
    pages_to_process = [pa for pa in page_args
                        if not Path(os.path.join(out_dir, f"{pa['page']}.json")).exists()]
    for pa in page_args:
        if pa not in pages_to_process:
            print(f"  SKIP page {pa['page']} ({pa['folio']}) — already exists")

    if not pages_to_process:
        print("All pages already processed.")
        return

    total = len(pages_to_process)
    print(f"Processing {total} page(s) in chunks of {chunk_size} via Document AI...")

    for chunk_start in range(0, total, chunk_size):
        chunk = pages_to_process[chunk_start:chunk_start + chunk_size]
        chunk_pages = [pa["page"] for pa in chunk]
        chunk_folios = [pa["folio"] for pa in chunk]

        print(f"\nChunk: pages {chunk_pages[0]}–{chunk_pages[-1]} ({len(chunk_pages)} pages)")

        pdf_bytes = extract_pdf_pages(pdf_path, chunk_pages)

        try:
            process_chunk_docai(
                client, processor_name, pdf_bytes,
                chunk_pages, chunk_folios,
                out_dir, chunk_start, total,
            )
        except Exception as e:
            print(f"  ERROR processing chunk: {e}", file=sys.stderr)
            print("  Skipping this chunk and continuing...", file=sys.stderr)
