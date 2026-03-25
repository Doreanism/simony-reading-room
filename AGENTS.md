# Translation Pipeline

This project is a translation pipeline for medieval printed texts. Source PDFs are split into page images, transcribed, and translated. The site is built with Nuxt Content and deployed at simony.sellingjesus.org.

## Pipeline Overview

The canonical source of truth for transcribed text is the **page JSON** in `public/d/`. Only pages within defined readings are hand-transcribed and translated. All pages get OCR-based JSON for the document viewer's text overlay.

```
Source PDF (public/d/{source}.pdf)
  → Page images for ALL pages (public/d/{source}/{N}.webp)
  → OCR JSON for ALL pages (Kraken, for viewer text overlay/search)
  → Per-column transcription .md files for ALL pages (raw OCR text)
  → build:readings combines reading columns into normalized reading-level transcription
  → Reading-level translation written directly (not per-column)
```

Assets in `public/d/` are gitignored. In production they are served from S3 via a `/d/` proxy route. For local development, run `npm run download` to pull assets from S3.

## OCR Setup

Page JSON is generated using [Kraken](https://kraken.re/) with the **Latin Incunabula and Early Prints** model (`10.5281/zenodo.11113737`). Kraken runs in a Python venv:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install kraken pymupdf
```

The model is downloaded automatically on first use via `htrmopo`.

## Build Scripts

### One-time prep (run manually, slow)

These are run once per document and the results are committed or uploaded to S3.

| Script | Command | Purpose |
|--------|---------|---------|
| `build:page-json` | `tsx scripts/build-page-json.ts <doc> <start> [end]` | Run Kraken OCR to produce page JSON (~55s/page, run overnight) |
| `build:transcriptions` | `tsx scripts/generate-transcriptions.ts` | Generate per-column .md transcription files from page JSON (all pages) |

Example: `npm run build:page-json -- john-major-sentences-a`

### Deploy build (runs on every deploy)

| Script | Command | Purpose |
|--------|---------|---------|
| `build:images` | `tsx scripts/build-page-images.ts` | Extract page images from source PDF |
| `build:readings` | `tsx scripts/build-readings.ts` | Combine per-column transcription files into normalized reading-level transcription |
| `build` | `build:images` + `build:normalize-spreads` + `build:readings` + `nuxt build` | Full deploy build |

## `content/` Directory Structure

### `content/authors/`

Markdown files keyed by author slug (e.g., `john-major.md`). Frontmatter contains canonical name forms (Latin and English), Wikipedia link, image path, birth/death years. Body contains a biographical description.

### `content/documents/`

Source materials, organized by type:

- **`meta/`** — Markdown files with metadata per source in frontmatter (title, author, year, provenance URL, page count, file size, `pagination` type, `typeface`, `ocr_model`) and a description of the work in the body. Pagination types: `folio-two-column`, `folio`, `page`. Typeface values: `gothic`, `roman`, etc. The `ocr_model` field is a Zenodo DOI for the Kraken model to use for OCR.
- **`transcription/{source-key}/`** — **Generated** per-column transcription files for all pages. Named by folio position (e.g., `145va.md`). These contain raw OCR text (with historical characters like `ſ`). Do not edit directly; edit the page JSON instead and run `build:transcriptions`.

### `content/readings/`

- **`meta/`** — YAML files defining each reading: source, section, PDF page range (`pdf_page_start`/`pdf_page_end`), folio range (`page_start`/`page_end`).
- **`transcription/`** — **Generated** combined transcription with normalized text (medieval characters like `ſ` → `s`, abbreviations expanded) and inline folio markers.
- **`translation/`** — Hand-written reading-level translation files.

### `public/d/` (gitignored, synced to S3)

- **`{source-key}.pdf`** — Original source PDFs.
- **`{source-key}/{N}.webp`** — Page images rendered from the source PDF at native resolution.
- **`{source-key}/{N}.json`** — **Canonical page data.** Contains line-level text with bounding box coordinates, grouped by column. For reading pages, this is hand-transcribed text; for other pages, OCR text from Tesseract.

Use `npm run upload` to push local changes to S3, `npm run download` to pull from S3.

### `public/covers/`

Cover images for source documents, named `{source-key}.jpg`. Typically extracted from the title page of the source PDF at 300 DPI. Target aspect ratio is approximately **3:4** (width:height), matching a typical book page proportion. Ideal dimensions: ~900-1000px wide. Referenced in the source meta frontmatter as `cover: /covers/{source-key}.jpg`.

## Page JSON Format

```json
{
  "pdf_page": 300,
  "folio": "145v",
  "page_width": 216.0,
  "page_height": 300.0,
  "image_width": 1700,
  "image_height": 2362,
  "lines": [
    { "text": "Diſtinctionis vigeſime qͥnte queſtio vnica.", "x0": 0.346, "y0": 0.049, "x1": 0.664, "y1": 0.066 },
    { "text": "tione queſtionis pretermitiamus...", "x0": 0.141, "y0": 0.063, "x1": 0.890, "y1": 0.086 },
    { "text": "mini ſimonia poteſt ſic difiniri...", "x0": 0.144, "y0": 0.081, "x1": 0.513, "y1": 0.100 }
  ]
}
```

Coordinates are normalized (0-1) relative to page dimensions. Lines are sorted by vertical position. The JSON stores raw OCR output — column splitting is done downstream by `generate-transcriptions.ts` based on the document's pagination type (e.g., `folio-two-column` splits at the horizontal midpoint).

## Reading Transcription and Translation

Reading transcriptions (`content/readings/transcription/`) are **readable, flowing Latin text** produced by reading source page images directly — not from OCR. Reading translations (`content/readings/translation/`) are scholarly English translations of the transcriptions.

Use the skills `/transcribe-reading` and `/translate-reading` for detailed instructions on producing these files. See `.agents/skills/` for the full rules on text formatting, headings, folio markers, and what to omit.

## Vue Conventions

- Always use `defineModel()` for two-way binding instead of the `modelValue` prop + `update:modelValue` emit pattern.
