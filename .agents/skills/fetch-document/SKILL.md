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
- Once you find a numbered page, work backwards to determine where pagination begins: the PDF page of the first numbered folio/page (always a recto page, i.e. odd PDF page) and the number at that page. This becomes the first entry in `pagination_starts`.

### Layout and typeface

- Determine `pagination` from the page layout: `folio-two-column` (two text columns, folio numbered), `folio` (single column, folio numbered), or `page` (single column, page numbered).
- Determine `typeface` from the text appearance: `gothic` (blackletter/textura) or `roman`.

### Assemble the meta file

Write the meta file to `content/documents/<key>.md` following the format of existing meta files. Include all fields:
- `key`, `title`, `title_en`, `authors` (list of slugs), `year`, `url` (provenance), `document`, `cover` (`/d/<key>/cover.jpg`), `pages`, `filesize`, `pagination`, `language`, `typeface`, `ocr_model` (default: `10.5281/zenodo.11113737` for Latin; find an appropriate model for other languages)
- `pagination_starts` — a list of segments, each with `pdf_page` (1-indexed, must be odd for recto-start pages), `printed_page`, and optionally `numeral_type` (default `arabic`) and `base_side` (default `r`). Example:
  ```yaml
  pagination_starts:
    - pdf_page: 53
      printed_page: 1
      numeral_type: arabic
  ```
  For documents with multiple numbering sequences (e.g., front matter + main text, or two independently numbered sections), add additional entries.

Present the proposed metadata to the user for confirmation before writing.

## Step 4: Create author file and image

Check whether an author file already exists at `content/authors/<author-slug>.md`.

### If the author file does not exist

Create `content/authors/<author-slug>.md` following the format of existing author files:

```yaml
---
key: <author-slug>
name: <canonical Latin or native-language name>
name_en: <English name>
wikipedia: <Wikipedia URL>
image: /a/<author-slug>.jpg
born: <birth year>
died: <death year>
---

<One-paragraph biography in English.>
```

Use information from the document itself (title page, colophon) and general knowledge to fill in the fields. The biography should be 3–5 sentences covering the author's role, major works, and historical significance. Present the proposed author file to the user for confirmation before writing.

### Author portrait image

Search Wikimedia Commons for a public-domain portrait of the author. Prefer a painted or engraved portrait contemporary with the author's lifetime. Download it and save to `public/a/<author-slug>.jpg`.

The image must be a **square crop** — ideally 400×400 px. Crop to the face and shoulders if needed. Use ImageMagick (`convert`) to resize/crop:

```bash
convert <source> -resize 400x400^ -gravity center -extent 400x400 public/a/<author-slug>.jpg
```

If no suitable portrait can be found, inform the user and skip the image (leave the `image` field in the author file but note that it is missing).

## Step 5: Generate page images

Run: `npm run build:images -- <key>`

This extracts WebP images from the PDF for every page. It may take a while for large documents. Wait for it to complete before proceeding — page JSON generation depends on the WebP files being present.

## Step 6: Generate page JSON files

Page JSON files (one per page in `public/d/<key>/`) drive the document viewer text overlay and search index. Generate them now using the appropriate method.

### Assess embedded PDF OCR quality

Use `python3 .agents/tools/pdf-tool.py text <pdf> <pages>` to extract embedded text from 3–5 representative content pages (not the title page or blanks — pick pages from the middle of the text).

Assess quality by reading the output:
- **Good quality**: Lines are mostly coherent words in the source language, minimal stray symbols, recognizable structure.
- **Poor quality**: Garbled words, stray single characters or numbers, symbol soup, large gaps or missing lines.

### If PDF has good embedded OCR

Run the fast extraction:
```
npm run build:page-json -- frompdf <key>
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

After Document AI finishes, embed the OCR text into the PDF so the PDF itself has a usable text layer:
```
python3 scripts/embed-ocr-in-pdf.py <key>
mv public/d/<key>-ocr.pdf public/d/<key>.pdf
```

## Step 7: Run tests

Run the test suite to verify the pipeline is healthy:
```
npm test -- --run
```

If tests fail, investigate the failures and fix them before reporting completion.
