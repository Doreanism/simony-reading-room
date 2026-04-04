"""PDF embedded-OCR extraction mode (--from-pdf) for build-page-json.py."""

import json
from pathlib import Path


def extract_from_pdf(pdf_path: str, page_args: list, out_dir: str):
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

        img_path = f"{out_dir}/{page_num}.webp"
        if Path(img_path).exists():
            with Image.open(img_path) as img:
                img_w, img_h = img.size
        else:
            images = page.get_images()
            if images:
                max_w = max(doc.extract_image(im[0])["width"] for im in images)
                dpi = round(max_w / (pw / 72))
            else:
                dpi = 300
            img_w = round(pw * dpi / 72)
            img_h = round(ph * dpi / 72)

        text_dict = page.get_text("dict")
        lines = []
        for block in text_dict["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                text = " ".join(span["text"] for span in line["spans"]).strip()
                if not text or len(text) < 2:
                    continue
                bbox = line["bbox"]
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
