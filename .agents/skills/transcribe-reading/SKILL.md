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

The only source per page:

1. **Page image** at `public/d/{document}/{N}.webp` — high-resolution scan (~1800×2500 pixels). This is the sole source of truth.

Do **NOT** read:
- Any existing reading transcription or translation files
- OCR column files (`content/documents/transcription/{document}/*.md`) — these are machine-generated and full of errors
- OCR JSON files (`public/d/{document}/{N}.json`) — these are for the document viewer text overlay, not for transcription

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

Launch **initialization agents** in parallel — one per PDF page. For `folio-two-column` documents, each page has two columns (e.g., PDF page 300 has columns 145va and 145vb); for other pagination types, one column per page.

**The page image is the sole source of truth.** Each agent must read the `.webp` page image and transcribe what it sees in the columns. Do NOT read OCR column files or OCR JSON — they are full of errors and using them in any way (even for "orientation") leads to error propagation.

Each agent:
1. Reads the `.webp` page image at `public/d/{document}/{N}.webp` — this is the only source
2. Transcribes the text it sees in each column of the image into flowing prose
3. Writes output column file(s) directly to `content/readings/transcription/$ARGUMENTS/`

**NEVER crop, resize, extract regions from, or otherwise manipulate the page image.** Do not use Python, Bash, or any tool to process the image before reading it. Simply read the full `.webp` file with the Read tool and transcribe from what you see. Scans can be crooked, and any cropping risks cutting off text or mixing columns.

The agent should:
- Read the full page image with the Read tool and transcribe directly from it
- Read each column of the image from top to bottom, producing continuous flowing prose
- Use standard Latin characters (`s` not `ſ`), expanding abbreviations where clear
- Format `¶` markers and ornamental initials as headings per the transcription rules
- Omit running page headers, folio numbers, and marginal annotations
- Use `[???]` for words that cannot be read from the image
- NEVER fabricate text that does not appear in the image

The output files should read as clean, flowing Latin text transcribed directly from the source image.

### Improvement loop

Launch **improvement agents** in parallel — one per PDF page. Each agent operates on all column file(s) for its page simultaneously (since the page image shows the full page):

1. Reads the column file(s) from `content/readings/transcription/$ARGUMENTS/` for its page
2. Reads the `.webp` page image at `public/d/{document}/{N}.webp` — **this is the primary source**
3. Re-reads each column from the image and compares against the existing transcription, looking for:
   - Words that don't match what the image shows (the image always wins)
   - Text from the wrong column spliced into the transcription
   - Missed or misidentified heading/pilcrow markers
   - Words joined or split incorrectly
   - Abbreviations not expanded or expanded wrongly
   - Fabricated text that does not appear in the image
   - Transition issues: does the text start/end mid-word in a way that connects to adjacent pages?
5. If improvements are found: writes the corrected text back to the column file(s) and reports `IMPROVED` with a summary of changes
6. If no improvements are needed: reports `DONE`

Pass each agent:
- The two column file paths
- The `.webp` image path
- The folio reference and column labels
- The document key and PDF page number
- The full transcription rules
- For the first page: `start_text` and which column to start in
- For the last page: `end_text` and which column to end in

**Critical instruction** — include this verbatim in every agent prompt:
> Read the page image as your sole source. Compare the transcription text against what you see in the image. The image is the ground truth — if the transcription disagrees with the image, correct it to match the image. Do NOT read or use OCR files of any kind (column files or JSON). Correct any errors you find — wrong characters, garbled words, missed headings, bad line joins, text from the wrong column, fabricated text. If you cannot read a word, write `[???]`. NEVER invent text that does not appear in the image. Report IMPROVED if you made changes, DONE if no changes were needed.

After all agents complete, print a summary table (folio, change count). Then immediately launch the next round for any page that reported `IMPROVED`. Pages that reported `DONE` are finished and do not need further rounds.

Keep going without asking the user — repeat automatically until all pages report `DONE` or a page has been through 5 rounds, whichever comes first.

## Verification

After writing the files, run `npx vitest run` to check:
- Column files are consecutive and within the page range
- `start_text` appears near the beginning of the first column
- `end_text` appears near the end of the last column
- Headings have blank lines around them
- Transcription headings match translation headings per column (if translation exists)
