#!/usr/bin/env python3
"""
Generates WebP images for all pages of each document.
Extracts at native resolution — if a page contains an embedded image
(typical for scanned documents), it renders at the DPI that matches
the embedded image's native resolution. Otherwise falls back to 300 DPI.

Usage:
  python3 scripts/build-page-images.py [doc-key]
"""

import io
import multiprocessing
import sys
from pathlib import Path

import fitz
import yaml
from PIL import Image

DOCUMENTS_META = Path("content/documents")
PUBLIC_D = Path("public/d")


def parse_frontmatter(path: Path) -> dict:
    text = path.read_text()
    if not text.startswith("---"):
        return {}
    end = text.index("---", 3)
    return yaml.safe_load(text[3:end])


def render_page(args):
    pdf_path, page_num, webp_path, doc_key = args
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    pw = page.rect.width

    images = page.get_images()
    if images:
        max_w = max(doc.extract_image(im[0])["width"] for im in images)
        dpi = round(max_w / (pw / 72))
    else:
        dpi = 300

    pix = page.get_pixmap(dpi=dpi)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    img.save(webp_path, "WEBP", quality=90)
    doc.close()
    return doc_key, page_num, dpi, pix.width, pix.height


def main():
    filter_key = sys.argv[1] if len(sys.argv) > 1 else None

    if not DOCUMENTS_META.exists():
        print("No content/documents directory found.")
        sys.exit(0)

    doc_files = sorted(DOCUMENTS_META.glob("*.md"))
    if filter_key:
        doc_files = [f for f in doc_files if f.stem == filter_key]

    tasks = []

    for doc_file in doc_files:
        meta = parse_frontmatter(doc_file)
        doc_key = meta.get("key")
        total_pages = int(meta.get("pages", 0))
        pdf_path = PUBLIC_D / f"{doc_key}.pdf"

        if not pdf_path.exists():
            print(f"  Skipping {doc_key}: no PDF at {pdf_path}")
            continue

        out_dir = PUBLIC_D / doc_key
        out_dir.mkdir(parents=True, exist_ok=True)

        print(f"{doc_key}: {total_pages} pages")

        for page_num in range(1, total_pages + 1):
            webp_path = out_dir / f"{page_num}.webp"
            if not webp_path.exists():
                tasks.append((str(pdf_path), page_num, str(webp_path), doc_key))

    if not tasks:
        print("All pages already converted.")
        return

    cpu_count = multiprocessing.cpu_count()
    print(f"\nConverting {len(tasks)} page(s) using {cpu_count} CPU(s)...\n")

    converted = 0
    with multiprocessing.Pool() as pool:
        for doc_key, page_num, dpi, w, h in pool.imap_unordered(render_page, tasks):
            print(f"  {doc_key}/{page_num}.webp — {dpi} DPI ({w}x{h})")
            converted += 1

    print(f"\nConverted {converted} page(s) to WebP.")


if __name__ == "__main__":
    main()
