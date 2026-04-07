---
name: create-reading
description: Set up a new reading in the pipeline — create the reading meta file, then run transcription and translation. Use when asked to create a reading from a source document.
argument-hint: "<reading-key> <document-key> <description of what passage/section to find>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion
---

# Create a Reading

Set up a new reading from a source document and populate it through the full pipeline.

**Arguments:** `$ARGUMENTS` should contain a reading key, document key, and a description of what passage/section to find, e.g. `perkins-galatians-6-6 perkins-galatians "Galatians 6:6 commentary"`.

## Navigation tip

To navigate the source document, use the already-rendered page images at:
```
public/d/<document_key>/<pdf_page_number>.webp
```

These are 1-indexed and match the PDF page numbers exactly. Read them directly with the Read tool — no rendering needed. This is much faster than using the `pdf-tool.py render` command.

Use the `public/d/<document_key>/<pdf_page_number>.json` page JSON files to extract embedded text from pages (faster than pdf-tool for spot-checking, but OCR quality varies).

## Step 1: Load document metadata

Read `content/documents/<document-key>.md` to get:
- `pagination` — `page`, `folio`, or `folio-two-column`
- `pagination_starts` — list of `{ pdf_page, printed_page }` segments mapping PDF pages to printed page numbers
- `language`

## Step 2: Find the passage in the PDF

Use the webp page images to navigate to the passage. To estimate where to start looking, use the first `pagination_starts` entry:
- For **page** pagination: `pdf_page ≈ seg.pdf_page + (target_page - seg.printed_page)`
- For **folio** pagination: `pdf_page ≈ seg.pdf_page + (target_folio - seg.printed_page) * 2`

Read webp images in the estimated range to locate the exact start and end of the passage. Look for:
- The verse/section/question heading that introduces the passage
- The next heading or verse marker that ends it

Record the **start PDF page**, **end PDF page**, and the printed page/folio numbers you see in the page images (not your calculated estimates — read the actual numbers from the images).

## Step 3: Determine page_start and page_end

From the printed numbers you read in the images:

- **`page` pagination**: `page_start` and `page_end` are the printed page numbers (integers).
- **`folio-two-column` pagination**: `page_start` and `page_end` are folio+column references like `145rb`. Determine which column the passage starts/ends in from the page image.
- **`folio` pagination**: `page_start` and `page_end` are folio references like `145r`.

## Step 4: Determine start_text and end_text

- `start_text`: a short, distinctive phrase from the very beginning of the passage (after any verse/section heading). Should be unique enough to locate the start reliably.
- `end_text`: a short, distinctive phrase from the very end of the passage. Should be the last few words of the final sentence.

Read the actual page images to get these phrases — do not guess from OCR.

## Step 5: Write the reading meta file

Write `content/readings/meta/<reading-key>.md` following the format of existing meta files:

```yaml
---
key: <reading-key>
title: "<title in source language>"
title_en: "<English title>"
author: <author-slug>
document: <document-key>
section: "<section description, e.g. 'Galatians 6:6' or 'Distinctio XXV'>"
year: <year of original composition, not the edition>
pdf_page_start: <start PDF page>
pdf_page_end: <end PDF page>
page_start: <start page/folio>
page_end: <end page/folio>
start_text: "<distinctive phrase from beginning of passage>"
end_text: "<distinctive phrase from end of passage>"
---

<one paragraph description of the reading>
```

Present the proposed meta to the user for confirmation before writing.

## Step 6: Run transcription

After the meta file is confirmed and written, invoke the `transcribe-reading` skill:

```
/transcribe-reading <reading-key>
```

## Step 7: Run translation

After transcription is complete, invoke the `translate-reading` skill:

```
/translate-reading <reading-key>
```
