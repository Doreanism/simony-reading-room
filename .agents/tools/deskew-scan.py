#!/usr/bin/env python3
"""
Deskew and autocrop scanned book pages.

Archive.org / library scans place each cream-colored leaf on a black scanner
background (with a white outer border), often slightly rotated and shifted.
This tool detects the leaf, deskews it, and crops to its bounds — removing the
black background and white border.

For each page in the range it:
  1. Renders the PDF page to a raster image at the given DPI.
  2. Masks the leaf (mid-tone: not black background, not white border).
  3. Picks the largest interior connected component as the leaf.
  4. Finds the leaf's rotation via minAreaRect, deskews, and crops.
  5. Writes a sequential WebP (1.webp, 2.webp, ...) to the output dir.
Finally it reassembles a flattened PDF from the cropped images.

Pages where detection looks implausible (leaf area out of range, or skew angle
too large) fall back to no rotation + a centered crop, and are reported.

Usage:
  deskew-scan.py <pdf> --start N --end N --out-dir DIR --out-pdf PATH [--dpi 300]

Page indices are 0-indexed and inclusive.
"""

import argparse
import multiprocessing
import sys
from pathlib import Path

import cv2
import fitz
import numpy as np

_DOC = None


def _init_worker(pdf_path):
    global _DOC
    _DOC = fitz.open(pdf_path)


def _render(page_index, dpi):
    page = _DOC[page_index]
    pix = page.get_pixmap(dpi=dpi)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        return cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)


def _detect_leaf(img):
    """Return ((cx, cy), (w, h), angle_deg, ok). angle normalized to portrait."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    # Leaf is mid-tone: brighter than the black background, darker than the
    # white outer border.
    mask = ((gray > 45) & (gray < 250)).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)

    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    # Prefer the largest component that does not touch the image border (the
    # leaf sits inside the black background); fall back to the largest overall.
    best = None
    for i in range(1, n):
        x, y, ww, hh, area = stats[i]
        touches = x <= 1 or y <= 1 or x + ww >= w - 1 or y + hh >= h - 1
        if not touches and (best is None or area > stats[best][4]):
            best = i
    if best is None:
        if n <= 1:
            return (w / 2, h / 2), (w, h), 0.0, False
        best = 1 + int(np.argmax(stats[1:, 4]))

    comp = (labels == best).astype(np.uint8)
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    (cx, cy), (rw, rh), ang = cv2.minAreaRect(max(cnts, key=cv2.contourArea))
    if ang < -45:
        ang += 90
        rw, rh = rh, rw

    area_frac = (rw * rh) / (w * h)
    ok = 0.30 < area_frac < 0.95 and abs(ang) < 10 and rh > rw
    return (cx, cy), (rw, rh), ang, ok


def _process(args):
    page_index, out_index, dpi, out_dir = args
    img = _render(page_index, dpi)
    h, w = img.shape[:2]
    (cx, cy), (rw, rh), ang, ok = _detect_leaf(img)

    if not ok:
        # Fallback: no rotation, centered crop at the typical leaf fraction.
        ang = 0.0
        rw, rh = w * 0.82, h * 0.90
        cx, cy = w / 2, h / 2

    M = cv2.getRotationMatrix2D((cx, cy), ang, 1.0)
    rot = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC,
                         borderValue=(255, 255, 255))
    x0 = max(0, int(round(cx - rw / 2)))
    y0 = max(0, int(round(cy - rh / 2)))
    x1 = min(w, int(round(cx + rw / 2)))
    y1 = min(h, int(round(cy + rh / 2)))
    crop = rot[y0:y1, x0:x1]

    out_path = Path(out_dir) / f"{out_index}.webp"
    cv2.imwrite(str(out_path), crop, [cv2.IMWRITE_WEBP_QUALITY, 90])
    return out_index, page_index, ang, crop.shape[1], crop.shape[0], ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--start", type=int, required=True, help="0-indexed, inclusive")
    ap.add_argument("--end", type=int, required=True, help="0-indexed, inclusive")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--out-pdf", required=True)
    ap.add_argument("--dpi", type=int, default=300)
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    page_indices = list(range(args.start, args.end + 1))
    tasks = [(p, i + 1, args.dpi, str(out_dir))
             for i, p in enumerate(page_indices)]
    print(f"Processing {len(tasks)} pages ({args.start}–{args.end}) at {args.dpi} DPI...")

    workers = min(multiprocessing.cpu_count(), 8)
    results = []
    fallbacks = []
    with multiprocessing.Pool(workers, initializer=_init_worker,
                              initargs=(args.pdf,)) as pool:
        for r in pool.imap_unordered(_process, tasks):
            out_index, page_index, ang, cw, ch, ok = r
            results.append(r)
            tag = "" if ok else "  [FALLBACK]"
            if not ok:
                fallbacks.append(out_index)
            if out_index % 50 == 0 or not ok:
                print(f"  {out_index}/{len(tasks)} (pdf p{page_index}) "
                      f"ang={ang:+.2f} {cw}x{ch}{tag}")

    print(f"\nCropped {len(results)} pages. Fallbacks: {len(fallbacks)}")
    if fallbacks:
        print(f"  Fallback output pages: {sorted(fallbacks)}")

    # Reassemble a flattened PDF from the cropped images.
    print(f"\nReassembling PDF -> {args.out_pdf}")
    doc = fitz.open()
    for i in range(1, len(tasks) + 1):
        img_path = out_dir / f"{i}.webp"
        # PyMuPDF cannot read WebP; decode with OpenCV and hand it a JPEG stream.
        bgr = cv2.imread(str(img_path))
        ih, iw = bgr.shape[:2]
        jpg = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()
        wpt = iw * 72.0 / args.dpi
        hpt = ih * 72.0 / args.dpi
        page = doc.new_page(width=wpt, height=hpt)
        page.insert_image(page.rect, stream=jpg)
    doc.save(args.out_pdf, deflate=True, garbage=4)
    doc.close()
    print(f"Done: {len(tasks)} pages.")


if __name__ == "__main__":
    main()
