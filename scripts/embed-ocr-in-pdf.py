#!/usr/bin/env python3
"""Embed OCR text from page JSON into a PDF as an invisible text layer."""

import json
import sys
from pathlib import Path

import fitz  # PyMuPDF


def embed_ocr(source_key: str):
    base = Path(__file__).resolve().parent.parent / "public" / "d"
    pdf_path = base / f"{source_key}.pdf"
    json_dir = base / source_key

    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}")
        sys.exit(1)

    doc = fitz.open(pdf_path)
    total = len(doc)
    print(f"Opened {pdf_path.name} ({total} pages)")

    pages_with_text = 0
    for page_num in range(total):
        json_path = json_dir / f"{page_num + 1}.json"
        if not json_path.exists():
            continue

        with open(json_path) as f:
            data = json.load(f)

        lines = data.get("lines", [])
        if not lines:
            continue

        page = doc[page_num]
        rect = page.rect
        pw, ph = rect.width, rect.height

        writer = fitz.TextWriter(page.rect)

        for line in lines:
            text = line.get("text", "").strip()
            if not text:
                continue

            # Convert normalized coords to page points
            x0 = line["x0"] * pw
            y0 = line["y0"] * ph
            x1 = line["x1"] * pw
            y1 = line["y1"] * ph

            line_height = y1 - y0
            font_size = line_height * 0.85  # leave a little margin
            if font_size < 1:
                font_size = 1

            # Estimate how wide the text should be, scale font if needed
            font = fitz.Font("helv")
            natural_width = font.text_length(text, fontsize=font_size)
            target_width = x1 - x0
            if natural_width > 0:
                scale = target_width / natural_width
                font_size *= scale

            if font_size < 0.5:
                font_size = 0.5

            # Position at baseline (bottom of the bounding box, minus descender)
            baseline_y = y1 - line_height * 0.15
            pos = fitz.Point(x0, baseline_y)

            try:
                writer.append(pos, text, font=font, fontsize=font_size)
            except Exception:
                # Skip lines that can't be rendered (e.g. unusual characters)
                pass

        writer.write_text(page, render_mode=3)  # 3 = invisible text
        pages_with_text += 1

        if (page_num + 1) % 50 == 0:
            print(f"  {page_num + 1}/{total} pages processed")

    output_path = base / f"{source_key}-ocr.pdf"
    print(f"Saving to {output_path.name} ...")
    doc.save(str(output_path), garbage=4, deflate=True)
    doc.close()
    print(f"Done. {pages_with_text} pages had OCR text embedded.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <source-key>")
        sys.exit(1)
    embed_ocr(sys.argv[1])
