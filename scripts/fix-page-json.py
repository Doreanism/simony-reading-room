#!/usr/bin/env python3
"""One-off script to clean up page JSON files extracted from embedded PDF OCR.

Fixes:
  1. Cyrillic/CJK/Arabic/Greek characters replaced with Latin equivalents
  2. Marginal noise lines removed (very short fragments at page edges)
  3. Signature marks removed (e.g., "A.ij.", "B.iity")
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

# Cyrillic → Latin lookalike mapping
CYRILLIC_TO_LATIN = {
    '\u0410': 'A',  # А
    '\u0412': 'B',  # В (looks like B)
    '\u0421': 'C',  # С
    '\u0415': 'E',  # Е
    '\u041d': 'H',  # Н
    '\u041a': 'K',  # К
    '\u041c': 'M',  # М
    '\u041e': 'O',  # О
    '\u0420': 'P',  # Р
    '\u0422': 'T',  # Т
    '\u0425': 'X',  # Х
    '\u0430': 'a',  # а
    '\u0431': 'b',  # б (approximate)
    '\u0432': 'v',  # в
    '\u0433': 'r',  # г (in this context, OCR confused r with г)
    '\u0434': 'd',  # д
    '\u0435': 'e',  # е
    '\u0437': 'z',  # з
    '\u0438': 'i',  # и
    '\u0439': 'i',  # й
    '\u043d': 'n',  # н
    '\u043e': 'o',  # о
    '\u043f': 'p',  # п
    '\u0440': 'r',  # р
    '\u0441': 'c',  # с
    '\u0442': 't',  # т
    '\u0443': 'y',  # у
    '\u0444': 'f',  # ф
    '\u0445': 'x',  # х
    '\u0456': 'i',  # і
    '\u044f': 'a',  # я (approximate in OCR context)
    '\u04e3': 'i',  # ӣ
}

# Greek → Latin lookalike mapping
GREEK_TO_LATIN = {
    '\u0391': 'A',  # Α
    '\u0392': 'B',  # Β
    '\u0395': 'E',  # Ε
    '\u0397': 'H',  # Η
    '\u0399': 'I',  # Ι
    '\u039a': 'K',  # Κ
    '\u039c': 'M',  # Μ
    '\u039d': 'N',  # Ν
    '\u039f': 'O',  # Ο
    '\u03a1': 'P',  # Ρ
    '\u03a4': 'T',  # Τ
    '\u03a7': 'X',  # Χ
    '\u03b1': 'a',  # α
    '\u03b2': 'b',  # β
    '\u03b5': 'e',  # ε
    '\u03b9': 'i',  # ι
    '\u03ba': 'k',  # κ
    '\u03bd': 'n',  # ν
    '\u03bf': 'o',  # ο
    '\u03c1': 'r',  # ρ
    '\u03c3': 's',  # σ
    '\u03c5': 'u',  # υ
}

# Vietnamese diacritics → basic Latin
VIETNAMESE_TO_LATIN = {
    '\u1ed5': 'o',  # ổ
    '\u1ee1': 'o',  # ỡ
}

ALL_REPLACEMENTS = {**CYRILLIC_TO_LATIN, **GREEK_TO_LATIN, **VIETNAMESE_TO_LATIN}

# Regex for CJK, Arabic, and other non-Latin/non-expected characters
CJK_RE = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')
ARABIC_RE = re.compile(r'[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufe70-\ufeff]')

# Signature mark pattern (e.g., "A.ij.", "B.iity", "Alý .")
SIGNATURE_RE = re.compile(r'^[A-Z]\s*\.\s*[ivxlj]+\s*[.,]?\s*$', re.IGNORECASE)


def fix_text(text: str) -> str:
    """Replace non-Latin lookalikes with Latin equivalents."""
    result = []
    for ch in text:
        if ch in ALL_REPLACEMENTS:
            result.append(ALL_REPLACEMENTS[ch])
        else:
            result.append(ch)
    # Remove any remaining CJK characters
    s = ''.join(result)
    s = CJK_RE.sub('', s)
    # Remove any remaining Arabic characters
    s = ARABIC_RE.sub('', s)
    return s


def is_noise_line(line: dict) -> bool:
    """Detect marginal noise: very short text at extreme x positions."""
    text = line["text"].strip()
    x0 = line["x0"]
    x1 = line["x1"]
    width = x1 - x0

    # Very short fragments (1-4 chars) at far left margin
    if len(text) <= 4 and x0 < 0.12:
        return True

    # Pure numbers at margins
    if re.match(r'^\d+$', text) and (x0 < 0.12 or width < 0.05):
        return True

    # Signature marks at bottom of page (high y, short text matching pattern)
    if line["y0"] > 0.9 and SIGNATURE_RE.match(text):
        return True

    # Lines that are entirely non-Latin after cleanup
    cleaned = fix_text(text)
    if len(cleaned.strip()) < 2:
        return True

    return False


def fix_page_json(path: Path, dry_run: bool = False) -> dict:
    """Fix a single page JSON file. Returns stats."""
    with open(path) as f:
        data = json.load(f)

    if "lines" not in data:
        return {"file": path.name, "fixed_chars": 0, "removed_lines": 0}

    fixed_chars = 0
    removed_lines = 0
    new_lines = []

    for line in data["lines"]:
        if is_noise_line(line):
            removed_lines += 1
            continue

        original = line["text"]
        fixed = fix_text(original)
        if fixed != original:
            fixed_chars += sum(1 for a, b in zip(original, fixed) if a != b)
            fixed_chars += abs(len(original) - len(fixed))
            line["text"] = fixed

        new_lines.append(line)

    data["lines"] = new_lines

    if not dry_run and (fixed_chars > 0 or removed_lines > 0):
        with open(path, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    return {"file": path.name, "fixed_chars": fixed_chars, "removed_lines": removed_lines}


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    if dry_run:
        args.remove("--dry-run")

    if not args:
        print("Usage: python3 scripts/fix-page-json.py <document-key> <start> <end> [--dry-run]")
        sys.exit(1)

    doc_key = args[0]
    start = int(args[1])
    end = int(args[2])
    doc_dir = Path(f"public/d/{doc_key}")

    total_chars = 0
    total_lines = 0

    for p in range(start, end + 1):
        path = doc_dir / f"{p}.json"
        if not path.exists():
            continue
        stats = fix_page_json(path, dry_run=dry_run)
        if stats["fixed_chars"] > 0 or stats["removed_lines"] > 0:
            prefix = "[DRY RUN] " if dry_run else ""
            print(f"  {prefix}{stats['file']}: fixed {stats['fixed_chars']} chars, removed {stats['removed_lines']} lines")
            total_chars += stats["fixed_chars"]
            total_lines += stats["removed_lines"]

    action = "Would fix" if dry_run else "Fixed"
    print(f"\n{action} {total_chars} characters and removed {total_lines} noise lines across pages {start}-{end}.")


if __name__ == "__main__":
    main()
