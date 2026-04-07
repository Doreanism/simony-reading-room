#!/usr/bin/env python3
"""Image utility for agent workflows. Operates on webp page images."""

import argparse
import os
import sys
from pathlib import Path

from PIL import Image


def cmd_crop(args):
    """Crop a region from an image using normalized coordinates (0-1)."""
    img = Image.open(args.image)
    w, h = img.size
    x0 = int(args.x0 * w)
    y0 = int(args.y0 * h)
    x1 = int(args.x1 * w)
    y1 = int(args.y1 * h)
    cropped = img.crop((x0, y0, x1, y1))
    if args.scale != 1.0:
        new_w = int(cropped.width * args.scale)
        new_h = int(cropped.height * args.scale)
        cropped = cropped.resize((new_w, new_h), Image.LANCZOS)
    out = args.output or "/tmp/image-tool-crop.webp"
    cropped.save(out)
    print(f"Saved: {out} ({cropped.width}x{cropped.height})")


def cmd_left(args):
    """Extract the left column of a two-column page."""
    img = Image.open(args.image)
    w, h = img.size
    mid = int(w * args.split)
    cropped = img.crop((0, 0, mid, h))
    if args.scale != 1.0:
        new_w = int(cropped.width * args.scale)
        new_h = int(cropped.height * args.scale)
        cropped = cropped.resize((new_w, new_h), Image.LANCZOS)
    out = args.output or "/tmp/image-tool-left.webp"
    cropped.save(out)
    print(f"Saved: {out} ({cropped.width}x{cropped.height})")


def cmd_right(args):
    """Extract the right column of a two-column page."""
    img = Image.open(args.image)
    w, h = img.size
    mid = int(w * args.split)
    cropped = img.crop((mid, 0, w, h))
    if args.scale != 1.0:
        new_w = int(cropped.width * args.scale)
        new_h = int(cropped.height * args.scale)
        cropped = cropped.resize((new_w, new_h), Image.LANCZOS)
    out = args.output or "/tmp/image-tool-right.webp"
    cropped.save(out)
    print(f"Saved: {out} ({cropped.width}x{cropped.height})")


def cmd_info(args):
    """Print image dimensions and file size."""
    img = Image.open(args.image)
    size = os.path.getsize(args.image)
    print(f"Size: {img.width}x{img.height}")
    print(f"Mode: {img.mode}")
    print(f"File size: {size} ({size // 1024}KB)")


def main():
    parser = argparse.ArgumentParser(description="Image utility for agent workflows")
    sub = parser.add_subparsers(dest="command", required=True)

    p_info = sub.add_parser("info", help="Print image dimensions and file size")
    p_info.add_argument("image", help="Path to image file")

    p_crop = sub.add_parser("crop", help="Crop a region using normalized coordinates (0-1)")
    p_crop.add_argument("image", help="Path to image file")
    p_crop.add_argument("x0", type=float, help="Left edge (0-1)")
    p_crop.add_argument("y0", type=float, help="Top edge (0-1)")
    p_crop.add_argument("x1", type=float, help="Right edge (0-1)")
    p_crop.add_argument("y1", type=float, help="Bottom edge (0-1)")
    p_crop.add_argument("--scale", type=float, default=1.0, help="Scale factor for output (default: 1.0)")
    p_crop.add_argument("--output", help="Output path (default: /tmp/image-tool-crop.webp)")

    p_left = sub.add_parser("left", help="Extract left column of a two-column page")
    p_left.add_argument("image", help="Path to image file")
    p_left.add_argument("--split", type=float, default=0.5, help="Horizontal split point (default: 0.5)")
    p_left.add_argument("--scale", type=float, default=1.0, help="Scale factor for output (default: 1.0)")
    p_left.add_argument("--output", help="Output path (default: /tmp/image-tool-left.webp)")

    p_right = sub.add_parser("right", help="Extract right column of a two-column page")
    p_right.add_argument("image", help="Path to image file")
    p_right.add_argument("--split", type=float, default=0.5, help="Horizontal split point (default: 0.5)")
    p_right.add_argument("--scale", type=float, default=1.0, help="Scale factor for output (default: 1.0)")
    p_right.add_argument("--output", help="Output path (default: /tmp/image-tool-right.webp)")

    args = parser.parse_args()
    if args.command == "info":
        cmd_info(args)
    elif args.command == "crop":
        cmd_crop(args)
    elif args.command == "left":
        cmd_left(args)
    elif args.command == "right":
        cmd_right(args)


if __name__ == "__main__":
    main()
