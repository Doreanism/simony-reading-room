#!/usr/bin/env python3
"""PDF utility for agent workflows. Wraps PyMuPDF (fitz) operations."""

import argparse
import json
import os
import sys
from pathlib import Path

import fitz


def cmd_info(args):
    """Print page count, file size, and embedded metadata."""
    doc = fitz.open(args.pdf)
    size = os.path.getsize(args.pdf)
    meta = {k: v for k, v in doc.metadata.items() if v}
    print(f"Pages: {doc.page_count}")
    print(f"File size: {size} ({size // (1024 * 1024)}MB)")
    for k, v in meta.items():
        print(f"{k}: {v}")
    doc.close()


def cmd_render(args):
    """Render one or more PDF pages to PNG."""
    doc = fitz.open(args.pdf)
    for page_num in args.pages:
        if page_num < 0 or page_num >= doc.page_count:
            print(f"Page {page_num} out of range (0-{doc.page_count - 1})", file=sys.stderr)
            continue
        page = doc[page_num]
        pix = page.get_pixmap(dpi=args.dpi)
        out = os.path.join(args.out_dir, f"page-{page_num}.png")
        pix.save(out)
        print(f"{out} ({pix.width}x{pix.height})")
    doc.close()


def cmd_trim(args):
    """Remove pages from the start and/or end of a PDF, in place."""
    doc = fitz.open(args.pdf)
    original = doc.page_count
    new_doc = fitz.open()
    end = original - args.end
    new_doc.insert_pdf(doc, from_page=args.start, to_page=end - 1)
    doc.close()
    new_doc.save(args.pdf)
    print(f"Trimmed: {original} → {new_doc.page_count} pages")
    new_doc.close()


def cmd_cover(args):
    """Extract a page as a 3:4 cover image (900x1200 JPG)."""
    from PIL import Image

    doc = fitz.open(args.pdf)
    page = doc[args.page]
    pix = page.get_pixmap(dpi=300)
    pix.save("/tmp/_cover_raw.png")
    doc.close()

    img = Image.open("/tmp/_cover_raw.png")
    w, h = img.size
    target_ratio = 3 / 4
    if w / h > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))
    img = img.resize((900, 1200), Image.LANCZOS)
    img.save(args.output, quality=85)
    print(f"Cover saved: {args.output} (900x1200)")


def cmd_text(args):
    """Extract embedded text from PDF pages."""
    doc = fitz.open(args.pdf)
    for page_num in args.pages:
        if page_num < 0 or page_num >= doc.page_count:
            print(f"Page {page_num} out of range (0-{doc.page_count - 1})", file=sys.stderr)
            continue
        page = doc[page_num]
        text = page.get_text().strip()
        print(f"--- PDF page {page_num} ---")
        print(text[:args.limit] if args.limit else text)
        print()
    doc.close()


def cmd_json(args):
    """Show text from page JSON files (public/d/<doc>/<N>.json)."""
    for page_num in args.pages:
        path = os.path.join("public", "d", args.doc, f"{page_num}.json")
        if not os.path.exists(path):
            print(f"--- page {page_num}: not found ---")
            print()
            continue
        with open(path) as f:
            data = json.load(f)
        folio = data.get("folio", "?")
        lines = data.get("lines", [])
        text = "\n".join(l["text"] for l in lines)
        print(f"--- page {page_num} (folio {folio}) ---")
        print(text[:args.limit] if args.limit else text)
        print()


def parse_page_list(s):
    """Parse a comma-separated list of page numbers and ranges like '1,5,10-15'."""
    pages = []
    for part in s.split(","):
        if "-" in part:
            start, end = part.split("-", 1)
            pages.extend(range(int(start), int(end) + 1))
        else:
            pages.append(int(part))
    return pages


def main():
    parser = argparse.ArgumentParser(description="PDF utility for agent workflows")
    sub = parser.add_subparsers(dest="command", required=True)

    p_info = sub.add_parser("info", help="Show page count, file size, and metadata")
    p_info.add_argument("pdf", help="Path to PDF file")

    p_render = sub.add_parser("render", help="Render pages to PNG")
    p_render.add_argument("pdf", help="Path to PDF file")
    p_render.add_argument("pages", type=parse_page_list, help="Page numbers (0-indexed), e.g. '0,5,10-15'")
    p_render.add_argument("--dpi", type=int, default=150, help="Resolution (default: 150)")
    p_render.add_argument("--out-dir", default="/tmp", help="Output directory (default: /tmp)")

    p_trim = sub.add_parser("trim", help="Remove pages from start/end of PDF (in place)")
    p_trim.add_argument("pdf", help="Path to PDF file")
    p_trim.add_argument("--start", type=int, default=0, help="Number of pages to remove from start")
    p_trim.add_argument("--end", type=int, default=0, help="Number of pages to remove from end")

    p_cover = sub.add_parser("cover", help="Extract a page as a 3:4 cover image (900x1200 JPG)")
    p_cover.add_argument("pdf", help="Path to PDF file")
    p_cover.add_argument("--page", type=int, default=0, help="Page number (0-indexed, default: 0)")
    p_cover.add_argument("--output", required=True, help="Output path for cover JPG")

    p_text = sub.add_parser("text", help="Extract embedded text from pages")
    p_text.add_argument("pdf", help="Path to PDF file")
    p_text.add_argument("pages", type=parse_page_list, help="Page numbers (0-indexed), e.g. '0,5,10-15'")
    p_text.add_argument("--limit", type=int, default=0, help="Max characters per page (0=unlimited)")

    p_json = sub.add_parser("json", help="Show text from page JSON files (public/d/<doc>/<N>.json)")
    p_json.add_argument("doc", help="Document key (e.g. anatomy)")
    p_json.add_argument("pages", type=parse_page_list, help="Page numbers (1-indexed), e.g. '10,15,20-25'")
    p_json.add_argument("--limit", type=int, default=0, help="Max characters per page (0=unlimited)")

    args = parser.parse_args()
    if args.command == "info":
        cmd_info(args)
    elif args.command == "render":
        cmd_render(args)
    elif args.command == "trim":
        cmd_trim(args)
    elif args.command == "cover":
        cmd_cover(args)
    elif args.command == "text":
        cmd_text(args)
    elif args.command == "json":
        cmd_json(args)


if __name__ == "__main__":
    main()
