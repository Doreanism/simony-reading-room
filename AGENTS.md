# Translation Pipeline

This project is a translation pipeline for medieval printed texts. Source PDFs are split into page images, transcribed, and translated. The site is built with Nuxt Content and deployed at simony.sellingjesus.org.

## Pipeline Overview

The canonical source of truth for transcribed text is the **page JSON** in `public/d/`. Only pages within defined readings are hand-transcribed and translated. All pages get OCR-based JSON for the document viewer's text overlay.

```
Source PDF (public/d/{source}.pdf)
  → Page images for ALL pages (public/d/{source}/{N}.webp)
  → OCR JSON for ALL pages (Kraken, for viewer text overlay/search)
  → Per-column transcription .md files for ALL pages (raw OCR text)
  → build:readings produces per-column normalized reading transcription files
  → Per-column reading translation files written by translate-reading skill
```

Assets in `public/a/` and `public/d/` are gitignored. In production they are served from S3 via `/a/` (authors) and `/d/` (documents) proxy routes. For local development, run `npm run download` to pull assets from S3.

## OCR Setup

Page JSON can be generated four ways via `build:page-json`:

- **kraken:** `npm run build:page-json -- kraken <doc>` — slow (~55s/page), high quality, uses the model specified in `ocr_model` meta field. Requires Kraken in `.venv`.
- **frompdf:** `npm run build:page-json -- frompdf <doc>` — fast (seconds), uses the OCR layer already embedded in the PDF. Only suitable when the PDF has clean embedded text.
- **docai:** `npm run build:page-json -- docai <doc>` — high quality, cloud-based. Requires `GOOGLE_PROJECT_ID` and `GOOGLE_PROCESSOR_ID` in `.env`.
- **vastai:** `npm run build:page-json -- vastai <doc>` — rents a Vast.ai GPU, runs Kraken remotely, downloads results, destroys instance. Requires vastai CLI in `.venv`.

Kraken runs in a Python venv:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install kraken pymupdf
```

The Kraken model is downloaded automatically on first use via `htrmopo`.

## Build Scripts

### One-time prep (run manually, slow)

These are run once per document and the results are committed or uploaded to S3.

| Script | Command | Purpose |
|--------|---------|---------|
| `build:page-json` | `python3 scripts/build-page-json.py <mode> <doc> [start] [end]` | Produce page JSON. Modes: `kraken`, `frompdf`, `docai`, `vastai` |
| `build:transcriptions` | `tsx scripts/generate-transcriptions.ts` | Generate per-column .md transcription files from page JSON (all pages) |
| `build:images` | `tsx scripts/build-page-images.ts` | Extract page images from source PDF |
| `build:normalize-spreads` | `tsx scripts/normalize-spread-sizes.ts` | Normalize spread image dimensions for the book viewer |
| `build:readings` | `tsx scripts/build-readings.ts` | Produce per-column normalized reading transcription files from document-level OCR columns |

Example: `npm run build:page-json -- kraken john-major-sentences-a`

### Deploy build (runs on every deploy)

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsx scripts/build-search-index.ts && nuxt build` | Build Pagefind search index, then full deploy build |
| `build:search-index` | `tsx scripts/build-search-index.ts` | Build Pagefind search index from transcription and translation files |

## `content/` Directory Structure

### `content/authors/`

Markdown files keyed by author slug (e.g., `john-major.md`). Frontmatter contains canonical name forms (Latin and English), Wikipedia link, image path, birth/death years. Body contains a biographical description.

### `content/documents/`

Source materials, organized by type:

- **`meta/`** — Markdown files with metadata per source in frontmatter (title, author, year, provenance URL, page count, file size, `pagination` type, `typeface`, `ocr_model`) and a description of the work in the body. The `year` is the publication year of the specific edition/printing. Pagination types: `folio-two-column`, `folio`, `page`. Typeface values: `gothic`, `roman`, etc. The `ocr_model` field is a Zenodo DOI for the Kraken model to use for OCR.
- **`transcription/{source-key}/`** — **Generated** per-column transcription files for all pages. Named by folio position (e.g., `145va.md`). These contain raw OCR text (with historical characters like `ſ`). Do not edit directly; edit the page JSON instead and run `build:transcriptions`.

### `content/readings/`

- **`meta/`** — YAML files defining each reading: source, section, PDF page range (`pdf_page_start`/`pdf_page_end`), folio range (`page_start`/`page_end`). The `year` is the original composition or first publication date of the text, not the edition year of the source document.
- **`transcription/{reading-key}/`** — Per-column transcription files, one per folio column (e.g., `145rb.md`). Frontmatter: `reading`, `page`, `pdf_page`, `sortable_pagination_id`. Body is normalized text (medieval characters like `ſ` → `s`, abbreviations expanded). Initially generated by `build:readings` from OCR, then improved by `transcribe-reading` skill.
- **`translation/{reading-key}/`** — Per-column translation files matching the transcription columns. Same frontmatter structure. Written by `translate-reading` skill.

### `public/a/` (gitignored, synced to S3)

Author images. Referenced in author meta frontmatter as `image: /a/{author-slug}.jpg`.

### `public/d/` (gitignored, synced to S3)

- **`{source-key}.pdf`** — Original source PDFs.
- **`{source-key}/{N}.webp`** — Page images rendered from the source PDF at native resolution.
- **`{source-key}/{N}.json`** — **Canonical page data.** Contains line-level text with bounding box coordinates, grouped by column. For reading pages, this is hand-transcribed text; for other pages, OCR text from Tesseract.

Use `npm run upload` to push local changes to S3, `npm run download` to pull from S3.

Cover images live at `{source-key}/cover.jpg` inside `public/d/`. Typically extracted from the title page of the source PDF. Aspect ratio must be exactly **3:4** (width:height). Ideal dimensions: 900×1200px. Referenced in the source meta frontmatter as `cover: /d/{source-key}/cover.jpg`.

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

Reading transcriptions and translations are stored as **per-column files** in `content/readings/transcription/{reading-key}/` and `content/readings/translation/{reading-key}/`. Each file corresponds to one folio column (e.g., `145rb.md`) and contains flowing text for that column only.

Reading transcriptions are **readable, flowing text** in the source language, produced by reading source page images directly — not from OCR. Reading translations are scholarly English translations of the transcriptions. Transcription and translation column files must have matching headings (same count and depth per column).

Use the skills `/transcribe-reading` and `/translate-reading` for detailed instructions on producing these files. See `.agents/skills/` for the full rules on text formatting, headings, and what to omit.

## Search

Full-text search uses [Pagefind](https://pagefind.app/), a client-side static search library. The search index is built at deploy time by `scripts/build-search-index.ts`, which indexes document transcription files (`content/documents/transcription/`) and reading translation files (`content/readings/translation/`). The index is written to `public/pagefind/` (gitignored).

Document transcription files are **not** registered as a Nuxt Content collection — the volume (~4000+ files) causes the dev server and build to hang. They remain in `content/documents/transcription/` in git but are only read by the Pagefind build script.

Each indexed record carries metadata (`folio`, `pdfPage`, `documentKey`) and filters (`type: transcription|translation`, `documentKey`) so the client can filter and display results appropriately.

For local development, run `npm run build:search-index` to generate the index before starting the dev server.

## Agent Tools

Reusable scripts for agent workflows live in `.agents/tools/`. These are not part of the application — they exist solely for agent use during development tasks.

| Tool | Command | Purpose |
|------|---------|---------|
| `pdf-tool.py` | `python3 .agents/tools/pdf-tool.py <command>` | PDF operations (metadata, page rendering) |

### pdf-tool.py

- `info <pdf>` — Print page count, file size, and embedded metadata.
- `render <pdf> <pages> [--dpi N] [--out-dir DIR]` — Render pages to PNG. Pages are 0-indexed, comma-separated, with ranges (e.g., `0,5,10-15`). Default DPI: 150, default output: `/tmp`.
- `trim <pdf> [--start N] [--end N]` — Remove N pages from the start/end of a PDF, in place.
- `cover <pdf> --output <path> [--page N]` — Extract a page as a 3:4 cover image (900x1200 JPG).
- `text <pdf> <pages> [--limit N]` — Extract embedded text from pages. Limit chars per page with `--limit`.
- `json <doc-key> <pages> [--limit N]` — Show text from page JSON files (`public/d/<doc>/<N>.json`). Pages are 1-indexed.

## Vue Conventions

- Always use `defineModel()` for two-way binding instead of the `modelValue` prop + `update:modelValue` emit pattern.
