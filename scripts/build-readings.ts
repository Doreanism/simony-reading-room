#!/usr/bin/env tsx

import { writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { normalizeText, normalizeSearch } from "../utils/normalize-search.js";
import {
  readYaml, yamlValue,
  parsePaginationStarts, pdfPageToPrintedPage, PaginationStart,
  computeSegmentSuffixes, getSuffixForPdfPage,
} from "./lib/folio.js";
import { processPage, linesToText, readPageJson } from "./lib/ocr.js";

const CONTENT = "content";
const SOURCES_DIR = join(CONTENT, "documents");
const READINGS_DIR = join(CONTENT, "readings");
const PUBLIC_D = "public/d";

interface ReadingMeta {
  [key: string]: string;
}

/**
 * Build per-column markdown files for a reading from page JSON.
 * Writes one file per folio column to content/readings/transcription/{reading-key}/{folio}.md
 */
function buildPerColumn(
  readingKey: string,
  meta: ReadingMeta,
): number {
  const documentKey = meta.document;

  const docMetaPath = join(SOURCES_DIR, `${documentKey}.md`);
  const docMeta = existsSync(docMetaPath) ? readYaml(docMetaPath) : {};
  const pagination = docMeta.pagination ?? "folio-two-column";
  const twoColumn = pagination === "folio-two-column" || pagination === "page-two-column";
  const isPagePagination = pagination === "page";

  let paginationStarts: PaginationStart[] | null = null;
  if (isPagePagination && docMeta.pagination_starts) {
    paginationStarts = parsePaginationStarts(docMeta.pagination_starts);
  }

  const pagesDir = join(PUBLIC_D, documentKey);
  if (!existsSync(pagesDir)) return 0;

  // Build segment suffix map for folio label computation
  const segments = docMeta.pagination_starts
    ? computeSegmentSuffixes(parsePaginationStarts(docMeta.pagination_starts), pagination)
    : [];

  const pdfStart = parseInt(meta.pdf_page_start);
  const pdfEnd = parseInt(meta.pdf_page_end);
  if (!pdfStart || !pdfEnd) return 0;

  // Collect column blocks: ref, pdfPage, content
  const blocks: { ref: string; pdfPage: string; content: string }[] = [];

  for (let pdfPage = pdfStart; pdfPage <= pdfEnd; pdfPage++) {
    const jsonPath = join(pagesDir, `${pdfPage}.json`);
    if (!existsSync(jsonPath)) continue;

    const data = readPageJson(jsonPath);
    const columnEntries = processPage(data, twoColumn);

    const validFolio = data.folio && /^(\d+(r|v)|\d+)$/.test(data.folio);
    const suffix = getSuffixForPdfPage(data.pdf_page, segments);

    for (const { col, lines } of columnEntries) {
      const pageLabel = validFolio
        ? (col ? `${data.folio}${col}` : data.folio) + suffix
        : String(data.pdf_page);

      const text = linesToText(lines)
        // Escape :word patterns so MDC doesn't treat them as inline components
        .replace(/:([a-zA-Z])/g, "\\:$1");

      blocks.push({ ref: pageLabel, pdfPage: String(pdfPage), content: text });
    }
  }

  // Sort by pdf_page, then by column (a before b)
  blocks.sort((a, b) => {
    const pa = parseInt(a.pdfPage);
    const pb = parseInt(b.pdfPage);
    if (pa !== pb) return pa - pb;
    return a.ref.localeCompare(b.ref);
  });

  // Join words split across column boundaries (marked with trailing "=")
  for (let i = 0; i < blocks.length - 1; i++) {
    const prev = blocks[i].content;
    const next = blocks[i + 1].content;
    const lastNewline = prev.lastIndexOf("\n");
    const lastLine = prev.slice(lastNewline + 1);
    const lineMatch = lastLine.match(/(\S+)=\s*.*$/);
    if (lineMatch) {
      const contMatch = next.match(/^(\S+)/);
      if (contMatch) {
        blocks[i].content =
          prev.slice(0, lastNewline + 1) +
          lastLine.slice(0, lineMatch.index);
        blocks[i + 1].content =
          lineMatch[1] + contMatch[1] + next.slice(contMatch[0].length);
      }
    }
  }

  // Normalize text in each block
  for (const block of blocks) {
    block.content = normalizeText(block.content);
  }

  // Trim to start_text / end_text boundaries if specified
  const startText = meta.start_text_transcription ?? meta.start_text;
  const endText = meta.end_text_transcription ?? meta.end_text;

  if (startText) {
    const needle = normalizeSearch(startText);
    let found = false;
    for (let i = 0; i < blocks.length; i++) {
      const haystack = normalizeSearch(blocks[i].content);
      const idx = haystack.indexOf(needle);
      if (idx !== -1) {
        // Trim this block to start at the line containing start_text
        const lineStart = blocks[i].content.lastIndexOf("\n", idx);
        blocks[i].content = blocks[i].content.slice(lineStart + 1);
        // Remove all blocks before this one
        blocks.splice(0, i);
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn(`  WARNING: start_text not found in ${readingKey}: "${startText}"`);
    }
  }

  if (endText) {
    const needle = normalizeSearch(endText);
    let found = false;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const haystack = normalizeSearch(blocks[i].content);
      const idx = haystack.indexOf(needle);
      if (idx !== -1) {
        // Trim this block to end after the line containing end_text
        const lineEnd = blocks[i].content.indexOf("\n", idx + endText.length);
        if (lineEnd !== -1) {
          blocks[i].content = blocks[i].content.slice(0, lineEnd);
        }
        // Remove all blocks after this one
        blocks.splice(i + 1);
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn(`  WARNING: end_text not found in ${readingKey}: "${endText}"`);
    }
  }

  // Write per-column files, skipping any that already exist (hand-transcribed)
  const outDir = join(READINGS_DIR, "transcription", readingKey);
  mkdirSync(outDir, { recursive: true });

  for (const block of blocks) {
    // Output ref: for page-pagination with segments, use the printed page number;
    // otherwise use the source file ref unchanged.
    const outputRef = paginationStarts
      ? String(pdfPageToPrintedPage(parseInt(block.pdfPage), paginationStarts))
      : block.ref;

    const outPath = join(outDir, `${outputRef}.md`);
    if (existsSync(outPath)) continue;

    const lines: string[] = [];
    lines.push("---");
    lines.push(`reading: ${yamlValue(readingKey)}`);
    lines.push(`page: ${outputRef}`);
    lines.push(`pdf_page: ${block.pdfPage}`);
    // Format: {pdfPage}.1 or {pdfPage}.2 for two-column pages (folio or page),
    // plain {pdfPage} for single-column pages.
    const isTwoCol = /^\d+([rv][ab]|[ab])(_\d+)?$/.test(block.ref);
    const colSuffix = isTwoCol ? "." + (block.ref.endsWith("a") ? "1" : "2") : "";
    lines.push(`sortable_pagination_id: ${block.pdfPage}${colSuffix}`);
    lines.push("---");
    lines.push("");
    lines.push(block.content.trim());
    lines.push("");

    writeFileSync(outPath, lines.join("\n"));
  }

  return blocks.length;
}

// Main
const metaDir = join(READINGS_DIR, "meta");
if (!existsSync(metaDir)) {
  console.error("No content/readings/meta directory found");
  process.exit(1);
}

const filterKey = process.argv[2];

const readings = filterKey
  ? [filterKey]
  : readdirSync(metaDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => basename(f, ".md"));

let built = 0;

for (const reading of readings) {
  const meta = readYaml(join(metaDir, `${reading}.md`));
  const count = buildPerColumn(reading, meta);
  if (count > 0) {
    console.log(`  readings/transcription/${reading}/ (${count} columns)`);
    built += count;
  }
}

console.log(`\nBuilt ${built} file(s).`);
