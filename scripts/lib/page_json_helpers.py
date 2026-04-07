"""Shared helpers for build-page-json.py."""

import re
from pathlib import Path

import yaml

DOCUMENTS_META = "content/documents"
READINGS_META = "content/readings/meta"
PUBLIC_D = "public/d"
DEFAULT_OCR_MODEL = "10.5281/zenodo.11113737"
DEFAULT_MAX_DIM = 2400
DEFAULT_CHUNK_SIZE = 15


def read_yaml(path: str) -> dict:
    """Parse YAML frontmatter from a markdown file."""
    text = Path(path).read_text()
    lines = text.splitlines()
    if not lines or lines[0].strip() != '---':
        return {}
    try:
        end_idx = lines.index('---', 1)
    except ValueError:
        return {}
    fm = '\n'.join(lines[1:end_idx])
    return yaml.safe_load(fm) or {}


def pdf_page_to_printed_page(pdf_page: int, pagination_starts: list[dict]) -> int:
    """Compute printed page number for a PDF page using pagination segments."""
    segment = pagination_starts[0]
    for s in pagination_starts:
        if pdf_page >= s['pdf_page']:
            segment = s
    return segment['printed_page'] + (pdf_page - segment['pdf_page'])


def pdf_page_to_folio(pdf_page: int, base_pdf_page: int, base_folio: int) -> tuple[int, str, str]:
    """Derive folio leaf from PDF page number. Returns (folio_number, side, leaf_string)."""
    offset = pdf_page - base_pdf_page
    abs_index = offset
    folio_offset = abs_index // 2
    is_recto = abs_index % 2 == 0
    folio = base_folio + folio_offset
    side = "r" if is_recto else "v"
    return folio, side, f"{folio}{side}"
