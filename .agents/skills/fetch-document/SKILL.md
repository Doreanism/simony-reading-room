---
name: fetch-document
description: Download a source PDF and set up a new document in the pipeline (meta, images, and optionally transcription files). Use when asked to fetch, import, or add a new source document.
argument-hint: "<url> <document-key>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, AskUserQuestion
---

# Fetch Document

Download a source PDF and bootstrap a new document in the pipeline.

**Arguments:** `$ARGUMENTS` should contain a URL and a document key, e.g. `https://example.com/book.pdf my-document-key`. Parse the URL and key from the arguments.

## Step 1: Download the PDF

Download the PDF to `public/d/<key>.pdf`.

- If the URL is a Google Books page (books.google.com), construct the PDF download URL: `https://books.google.com/books/download/?id=<GOOGLE_BOOKS_ID>&output=pdf`. Use `curl -L` to follow redirects.
- If the URL is an Archive.org details page, download via `https://archive.org/download/<identifier>/<identifier>.pdf`. Use `curl -L` to follow redirects.
- Otherwise, download the URL directly with `curl -L`.

Verify the downloaded file is a valid PDF (check the file starts with `%PDF`). If the download fails or produces an HTML error page, inform the user and stop.

## Step 2: Get PDF metadata

Use `python3 -c` with PyMuPDF (`fitz`) to extract:
- Total page count
- File size (from the filesystem)

## Step 3: Determine metadata from the PDF

Examine the PDF to determine metadata yourself. Do not ask the user for values you can figure out from the document.

### Title, author, year, and description

- Extract the embedded PDF metadata (title, author) using PyMuPDF as a starting point.
- Render the **title page** (typically the first or second page of content) at 150+ DPI and read it to get the exact title, author, publisher, and place of publication.
- Render the **colophon** or publication page (typically one of the last few pages, or verso of title page) at 300 DPI and read it to find the publication date. The colophon also confirms the printer.
- Draft a brief description of the work based on what you've read.

### Pagination base

- Render pages at 150 DPI and scan for folio/page numbers in the headers or margins. Start around pages 20-35 of the PDF, as the first numbered folio typically appears after prefatory material (title page, indices, prooemium).
- Folio numbers appear as "fo.I.", "fo.II.", "Fo.III.", or similar in the top corner of recto pages. Page numbers appear as Arabic numerals.
- Once you find a numbered page, work backwards to determine `base_pdf_page` (the PDF page of the first numbered folio/page), `base_folio` (the number at that page), and `base_side` (`r` or `v` for folio pagination).

### Layout and typeface

- Determine `pagination` from the page layout: `folio-two-column` (two text columns, folio numbered), `folio` (single column, folio numbered), or `page` (single column, page numbered).
- Determine `typeface` from the text appearance: `gothic` (blackletter/textura) or `roman`.

### Assemble the meta file

Write the meta file to `content/documents/meta/<key>.md` following the format of existing meta files. Include all fields:
- `key`, `title`, `title_en`, `author` (slug), `year`, `url` (provenance), `document`, `cover` (`/d/<key>/cover.jpg`), `pages`, `filesize`, `pagination`, `language`, `typeface`, `ocr_model` (default: `10.5281/zenodo.11113737` for Latin; find an appropriate model for other languages), `base_pdf_page`, `base_folio`, `base_side`

Present the proposed metadata to the user for confirmation before writing.

## Step 4: Generate page images

Run: `npm run build:images -- <key>`

This extracts WebP images from the PDF for every page. It may take a while for large documents. Report the result to the user.

## Step 5: Generate page JSON files

Page JSON files (one per page in `public/d/<key>/`) drive the document viewer text overlay and search index. Generate them now using the appropriate method.

### Assess embedded PDF OCR quality

Use `python3 .agents/tools/pdf-tool.py text <pdf> <pages>` to extract embedded text from 3–5 representative content pages (not the title page or blanks — pick pages from the middle of the text).

Assess quality by reading the output:
- **Good quality**: Lines are mostly coherent words in the source language, minimal stray symbols, recognizable structure.
- **Poor quality**: Garbled words, stray single characters or numbers, symbol soup, large gaps or missing lines.

### If PDF has good embedded OCR

Run the fast extraction:
```
npm run build:page-json -- <key> --from-pdf
```

This reads the PDF's embedded text layer directly (seconds, not hours). Report the result.

### If PDF has poor embedded OCR

Use Google Document AI (high-quality OCR, requires API credentials in `.env`):
```
npm run build:page-json -- <key> --docai
```

Required `.env` variables:
- `GOOGLE_PROJECT_ID` — GCP project ID
- `GOOGLE_PROCESSOR_ID` — Document AI OCR processor ID
- `GOOGLE_LOCATION` — processor region (default: `us`)

If these are not set, inform the user and offer the alternative of running Kraken OCR overnight instead (`npm run build:page-json -- <key>`), which takes ~55s/page.

### After page JSON is generated

Run transcription file generation (fast):
```
npm run build:transcriptions -- <key>
```

Report the number of transcription files generated.
