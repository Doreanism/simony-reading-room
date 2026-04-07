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

The canonical source of truth for transcribed text is the **page JSON** in `public/d/`. Only pages within defined readings are hand-transcribed and translated. All pages get OCR-based JSON for the document viewer.

```
Source PDF (public/d/{doc}.pdf)
  → Page images for ALL pages (public/d/{doc}/{N}.webp)
  → OCR JSON for ALL pages (for viewer text overlay/search)
  → Hand-transcribed page JSON for READING pages only
  → Reading transcription from page JSON (content/readings/transcription/)
  → Reading-level translation (content/readings/translation/)
```

### Pipeline steps

| # | Command | Purpose |
|---|---------|---------|
| 1 | `npm run build:images` | Extract WebP page images from source PDFs |
| 2 | `npm run build:normalize-spreads` | Normalize spread image dimensions for the book viewer |
| 3 | `npm run build:page-json` | Align transcription text with OCR line positions to produce canonical JSON |
| 4 | `npm run build:readings` | Generate reading-level transcription files from page JSON |
| 5 | `npm run build:search-index` | Build Pagefind search index from page JSON and translations |

After running pipeline steps that modify `public/d/`, upload the changes to S3:

```bash
npm run upload                          # upload everything
npm run upload -- john-major-sentences-a  # upload one document
```

The upload script compares file sizes and skips files that are already up to date.

### Transcription and translation (Claude Code agents)

Two content-creation steps are done via Claude Code agents rather than automated scripts:

- **Transcribe**: Read each page image from `public/d/{doc}/{N}.webp`, transcribe both columns line-by-line preserving original spelling, and produce page JSON. Then run `build:page-json` to align coordinates with OCR.
- **Translate**: Read the combined reading transcription and produce an English translation directly at the reading level in `content/readings/translation/`.

After either step, run the remaining pipeline steps to regenerate derived files, then `npm run upload` to sync to S3 (including the Pagefind search index).

## Asset storage

Document assets live in `public/d/` locally and in an S3 bucket in production:

| Local path | S3 key | Description |
|------------|--------|-------------|
| `public/d/{doc}.pdf` | `documents/{doc}.pdf` | Source PDF |
| `public/d/{doc}/{N}.webp` | `documents/{doc}/{N}.webp` | Page image |
| `public/d/{doc}/{N}.json` | `documents/{doc}/{N}.json` | Canonical page JSON |
| `public/pagefind/*` | `pagefind/*` | Pagefind search index |

- `public/d/` and `public/pagefind/` are gitignored — use `npm run download` to populate them
- In production, Nuxt proxies `/d/**` and `/pagefind/**` requests to S3 (configured in `nuxt.config.ts`)
- In development, Nuxt serves `public/d/` and `public/pagefind/` directly from disk

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
  pages/            File-based routes
  layouts/          App layout with header/footer
content/
  authors/          Author biographies and metadata
  readings/         Reading-level content (meta, transcription, translation)
  documents/        Document-level content (meta)
public/
  d/                Page images, page JSON, and source PDFs (gitignored, synced to S3)
  covers/           Document cover images
scripts/            Build pipeline scripts
```

## Deployment

The site is deployed on Netlify. [Deployment logs](https://app.netlify.com/projects/simony-sj/deploys?page=1) are available in the Netlify dashboard.

## Related

- [sellingJesus.org](https://sellingjesus.org) — Main project site
