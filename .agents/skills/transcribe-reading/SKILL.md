---
name: transcribe-reading
description: Transcribe a reading from source PDF pages into flowing Latin text. Use when asked to transcribe, create, or redo a reading transcription.
argument-hint: "<reading-key>"
allowed-tools: Read, Write, Glob, Grep, Bash, Agent
---

# Transcribe a Reading

Transcribe the reading `$ARGUMENTS` by iteratively improving per-column transcription files against source page images.

## Setup

1. Read the reading meta from `content/readings/meta/$ARGUMENTS.md` to get: `document`, `pdf_page_start`, `pdf_page_end`, `page_start`, `page_end`, `start_text`, `end_text`
2. Read the document meta from `content/documents/meta/{document}.md` to get: `base_pdf_page`, `base_folio`, `base_side`, `pagination`
3. Calculate folio references for each PDF page

## Sources

Each agent operates on one PDF page at a time. For `folio-two-column` documents, each page contains **two columns** (e.g., 145va and 145vb for a verso page) — the agent reads and writes both column files for its page. For `folio` or `page` pagination, each page has a single column file.

Sources per page:

1. **Per-column transcription files** at `content/documents/transcription/{document}/{folio_column}.md` (e.g., `145va.md`, `145vb.md`) — raw OCR text already split into columns with lines in reading order. These contain historical characters (`ſ`) and unexpanded abbreviations.
2. **Page image** at `public/d/{document}/{N}.webp` — high-resolution scan (~1800×2500 pixels) for verification and correction.
3. **OCR JSON** at `public/d/{document}/{N}.json` — Kraken OCR with line-level text and bounding boxes. Use as an additional reference to cross-check the transcription — especially for verifying heading labels (look for `¶` markers), canonical citations, and proper names.

Do **NOT** read:
- Any existing reading transcription or translation files

## Transcription rules

### Text
- Produce **continuous, flowing prose** — join words that are split across line breaks in the original. The output should read as normal text, not preserve the column width of the printed page.
- Use standard Latin characters (`s` not `ſ`), expanding abbreviations where clear (e.g., `ꝙ` → `quod`, `⁊` → `et`)
- Preserve original spelling; do not modernize

### Headings
- `#` — the first heading of the reading (the distinction/question title)
- `##` — major question divisions within a multi-question reading (e.g., "Questio Secunda", "Questio Tertia"). If the reading has only one question, there are no `##` headings.
- `###` — structural divisions within each question, marked by the pilcrow `¶` (in the transcription text or OCR) or ornamental `C` (in the image)
- The heading text is the short label up to the first colon or period. The body text that follows continues on the next line — do NOT include it in the heading.
- Put a blank line before and after every heading
- Example (multi-question reading):
  ```
  # Questio prima Distinct.XXV.Quarti Sententiarum.
  ...
  ## Distinctionis vigesimequinte Questio Secunda.
  ...
  ### Secunda conclusio.
  text continues here...
  ```
- Example (single-question reading):
  ```
  # Distinctionis vigesime quinte questio vnica.
  ...
  ## Sexto sequitur:
  maximus pontifex potest committere simoniam...
  ```

### What to omit
- **Page headers**: the repeated section title centered at the top of each page and folio markers (e.g., "Folio. cxlviii."). These are running headers, not part of the text.
- **Marginal annotations**: text printed outside the column boundaries

### Trimming
- Start the transcription at `start_text` from the reading meta (in the first column)
- End the transcription at `end_text` from the reading meta (in the last column)

## Output

Write per-column files directly to `content/readings/transcription/$ARGUMENTS/{folio_column}.md`.

Each file has this frontmatter:
```yaml
---
reading: $ARGUMENTS
page: {folio_column}
pdf_page: {pdf_page_number}
sortable_pagination_id: "{folio}_{position}"
---
```

Where `sortable_pagination_id` uses the position mapping: ra=001, rb=002, va=003, vb=004. Example: `145rb` → `"145_002"`.

The body is the transcribed text for that column only. Do not include folio markers in the text — the column identity is the filename.

## Process

### Initialization

Launch **initialization agents** in parallel — one per PDF page. For `folio-two-column` documents, each page has two columns (e.g., PDF page 300 has columns 145va and 145vb); for other pagination types, one column per page. Each agent reads the raw OCR column file(s) for its page and writes output column file(s) directly to `content/readings/transcription/$ARGUMENTS/`. The agent applies thorough normalization to each column:

- Strip YAML frontmatter, running headers, and signature marks from column files
- Join lines into continuous flowing prose (remove line breaks within sentences)
- Normalize characters: `ſ`→`s`, `⁊`→`et`, `ꝙ`→`quod`, and other medieval abbreviations
- Format `¶` markers as `##` headings per the transcription rules
- Join words that are hyphenated or split across line breaks within a column
- Write each column as a separate file with the correct frontmatter

The output files should already read as normal text, not raw OCR output. This is critical — when improvement agents receive poorly normalized text, they try to do normalization and error correction simultaneously, which leads to worse results and fabricated text.

### Improvement loop

Launch **improvement agents** in parallel — one per PDF page. Each agent operates on all column file(s) for its page simultaneously (since the page image shows the full page):

1. Reads the column file(s) from `content/readings/transcription/$ARGUMENTS/` for its page (e.g., `145va.md` and `145vb.md` for a two-column page, or just `145r.md` for a single-column page)
2. Reads the `.webp` page image at `public/d/{document}/{N}.webp`
3. Reads the OCR JSON at `public/d/{document}/{N}.json` as an additional reference
4. Compares the transcription of both columns against the image and OCR, looking for:
   - OCR errors to correct (wrong characters, garbled words)
   - Missed or misidentified heading/pilcrow markers — cross-check against `¶` markers in the OCR
   - Words joined or split incorrectly
   - Abbreviations not expanded or expanded wrongly
   - Fabricated text that appears in neither the image nor the OCR
   - Canonical citations, proper names, and biblical references that don't match the OCR
   - Transition issues: does the text start/end mid-word in a way that connects to adjacent pages?
5. If improvements are found: writes the corrected text back to the column file(s) and reports `IMPROVED` with a summary of changes
6. If no improvements are needed: reports `DONE`

Pass each agent:
- The two column file paths
- The `.webp` image path
- The OCR JSON path
- The folio reference and column labels
- The document key and PDF page number
- The full transcription rules
- For the first page: `start_text` and which column to start in
- For the last page: `end_text` and which column to end in

**Critical instruction** — include this verbatim in every agent prompt:
> Compare the transcription text against the page image and OCR JSON. Correct any errors you find — wrong characters, garbled words, missed headings, bad line joins, fabricated text. If sources disagree, trust the image. If you cannot read a word, write `[???]`. NEVER invent text that does not appear in the image. Report IMPROVED if you made changes, DONE if no changes were needed.

After all agents complete, print progress. For any page that reported `IMPROVED`, re-launch an improvement agent in the next round. Pages that reported `DONE` are finished.

Repeat until all pages report `DONE` or a page has been through 5 rounds, whichever comes first.

## Verification

After writing the files, run `npx vitest run` to check:
- Column files are consecutive and within the page range
- `start_text` appears near the beginning of the first column
- `end_text` appears near the end of the last column
- Headings have blank lines around them
- Transcription headings match translation headings per column (if translation exists)
