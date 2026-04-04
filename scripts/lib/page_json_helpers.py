"""Shared helpers for build-page-json.py."""

import re
from pathlib import Path

DOCUMENTS_META = "content/documents/meta"
READINGS_META = "content/readings/meta"
PUBLIC_D = "public/d"
DEFAULT_OCR_MODEL = "10.5281/zenodo.11113737"
DEFAULT_MAX_DIM = 2400
DEFAULT_CHUNK_SIZE = 15


def read_yaml(path: str) -> dict[str, str]:
    """Simple YAML parser for flat key: value frontmatter files."""
    result = {}
    for line in Path(path).read_text().splitlines():
        m = re.match(r'^([\w_]+):\s*(.+)$', line)
        if m:
            val = m.group(2).strip()
            if (val.startswith('"') and val.endswith('"')) or \
               (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            result[m.group(1)] = val
    return result


def pdf_page_to_folio(pdf_page: int, base_pdf_page: int, base_folio: int,
                      base_side: str) -> tuple[int, str, str]:
    """Derive folio leaf from PDF page number. Returns (folio_number, side, leaf_string)."""
    offset = pdf_page - base_pdf_page
    base_is_recto = base_side == "r"
    abs_index = offset + (0 if base_is_recto else 1)
    folio_offset = abs_index // 2
    is_recto = abs_index % 2 == 0
    folio = base_folio + folio_offset
    side = "r" if is_recto else "v"
    return folio, side, f"{folio}{side}"
