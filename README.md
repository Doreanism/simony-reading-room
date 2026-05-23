# Simony Reading Room

A digital library of late-medieval theological and philosophical manuscripts on the topic of simony, with transcriptions, translations, and facsimile page images.

> Simony is "an earnest desire to buy or sell something spiritual or something annexed to a spiritual thing."

**Live site:** [simony.sellingjesus.org](https://simony.sellingjesus.org)

## Features

- **Document viewer** — Browse facsimile page images with a book-spread layout and page-flip animations
- **Transcriptions** — Line-by-line transcriptions of the original Latin, positioned over the page images
- **Translations** — English translations alongside the original text
- **Full-text search** — Search across transcriptions with on-page match highlighting
- **PWA** — Installable, works offline

## Tech Stack

- [Nuxt 4](https://nuxt.com) with [Nuxt Content](https://content.nuxt.com) for content management
- [Nuxt UI](https://ui.nuxt.com) and [Tailwind CSS](https://tailwindcss.com) for styling
- [Vite PWA](https://vite-pwa-org.netlify.app) for offline support
- [AWS S3](https://aws.amazon.com/s3/) for document asset storage

## Setup

```bash
npm install
```

### Environment

Create a `.env` file with your AWS credentials:

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
REGION=us-west-2
BUCKET=simony
```

### Download assets

Document assets (PDFs, page images, page JSON) are stored in S3 and gitignored. Pull them down for local development:

```bash
npm run download                          # download everything
npm run download -- john-major-sentences-a  # download one document
```

This populates `public/d/`, which Nuxt serves directly in dev mode.

### Run the dev server

```bash
npm run dev
```

## Content Pipeline

OCR-based page JSON in `public/d/` powers the document viewer's text overlay and search across the full corpus. Only pages within defined **readings** get hand transcriptions and translations, written as flowing per-column text files under `content/readings/`.

```
Source PDF (public/d/{doc}.pdf)
  → Page images for ALL pages (public/d/{doc}/{N}.webp)
  → OCR page JSON for ALL pages (public/d/{doc}/{N}.json — viewer overlay + search)
  → Per-column reading transcriptions (content/readings/transcription/{reading-key}/{folio}.md)
  → Per-column reading translations (content/readings/translation/{reading-key}/{folio}.md)
  → Pagefind search index (public/pagefind/)
```

### Pipeline steps

| # | Command | Purpose |
|---|---------|---------|
| 1 | `npm run build:images` | Extract WebP page images from source PDFs |
| 2 | `npm run build:normalize-spreads` | Normalize spread image dimensions for the book viewer |
| 3 | `npm run build:page-json -- <mode> <doc>` | Produce OCR page JSON. Modes: `kraken`, `frompdf`, `docai`, `vastai` |
| 4 | `npm run build:readings` | Seed/refresh per-column reading transcription files from page JSON |
| 5 | `npm run build:search-index` | Build the Pagefind search index from page JSON and translations |

After running pipeline steps that modify `public/d/` or `public/pagefind/`, upload the changes to S3:

```bash
npm run upload                          # upload everything
npm run upload -- john-major-sentences-a  # upload one document
```

The upload script compares file sizes and skips files that are already up to date.

### OCR setup (Kraken)

The `kraken` and `vastai` modes of `build:page-json` use a Python venv. The Kraken model specified by each document's `ocr_model` frontmatter is downloaded automatically on first use via `htrmopo`.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install kraken pymupdf
```

`docai` mode uses Google Document AI and requires `GOOGLE_PROJECT_ID` and `GOOGLE_PROCESSOR_ID` in `.env`. `vastai` mode rents a GPU on Vast.ai and requires the `vastai` CLI in `.venv`.

### Transcription and translation (Claude Code skills)

Hand transcription and translation of readings are done via Claude Code skills rather than automated scripts:

- **`/transcribe-reading`** — Reads each page image directly and writes flowing per-column transcription files under `content/readings/transcription/{reading-key}/{folio}.md`, normalizing medieval characters and expanding abbreviations.
- **`/translate-reading`** — Reads the transcription and writes per-column English translations under `content/readings/translation/{reading-key}/{folio}.md` with matching headings.

After either step, rebuild the search index (`npm run build:search-index`) and run `npm run upload` to sync to S3.

## Asset storage

Document assets live in `public/d/` locally and in an S3 bucket in production:

| Local path | S3 key | Description |
|------------|--------|-------------|
| `public/d/{doc}.pdf` | `documents/{doc}.pdf` | Source PDF |
| `public/d/{doc}/{N}.webp` | `documents/{doc}/{N}.webp` | Page image |
| `public/d/{doc}/{N}.json` | `documents/{doc}/{N}.json` | OCR page JSON (text + line bounding boxes) |
| `public/d/{doc}/cover.jpg` | `documents/{doc}/cover.jpg` | Document cover image (3:4 ratio) |
| `public/a/{author}.jpg` | `authors/{author}.jpg` | Author portrait |
| `public/pagefind/*` | `pagefind/*` | Pagefind search index |

- `public/a/`, `public/d/`, and `public/pagefind/` are gitignored — use `npm run download` to populate them
- In production, Nuxt proxies `/a/**`, `/d/**`, and `/pagefind/**` requests to S3 (configured in `nuxt.config.ts`)
- In development, Nuxt serves these directories directly from disk

### Testing S3 in development

To verify the S3 proxy works locally, temporarily move the local assets out of the way:

```bash
mv public/d public/d.bak
npm run dev
# Nuxt will proxy /d/ requests to S3 instead of serving local files
mv public/d.bak public/d
```

## Project structure

```
app/
  components/       Vue components (PageImage, DocumentSearch, etc.)
  composables/      Shared reactive helpers
  layouts/          App layout with header/footer
  pages/            File-based routes
  utils/            Client-side utilities
content/
  authors/          Author biographies and metadata
  documents/        Document-level metadata (source, year, pagination, OCR model)
  readings/
    meta/           Reading definitions (source, page range, year)
    transcription/  Per-column flowing-text transcriptions ({reading}/{folio}.md)
    translation/    Per-column English translations ({reading}/{folio}.md)
public/
  a/                Author portraits (gitignored, synced to S3)
  d/                Source PDFs, page images, page JSON, cover images (gitignored, synced to S3)
  pagefind/         Pagefind search index (gitignored, synced to S3)
scripts/            Build pipeline scripts
tests/              Vitest tests
.agents/            Agent skills and tools (not part of the app)
```

## Deployment

The site is deployed on Netlify. [Deployment logs](https://app.netlify.com/projects/simony-sj/deploys?page=1) are available in the Netlify dashboard.

## Related

- [sellingJesus.org](https://sellingjesus.org) — Main project site
