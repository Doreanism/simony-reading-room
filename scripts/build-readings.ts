#!/usr/bin/env tsx

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { normalizeText, normalizeSearch } from "../utils/normalize-search.js";
import { parseFolio, sortablePaginationId, readYaml, yamlValue } from "./lib/folio.js";

const CONTENT = "content";
const SOURCES_DIR = join(CONTENT, "documents");
const READINGS_DIR = join(CONTENT, "readings");

interface ReadingMeta {
  [key: string]: string;
}

/**
 * Build per-column markdown files for a reading from its per-column source files.
 * Writes one file per folio column to content/readings/transcription/{reading-key}/{folio}.md
 */
function buildPerColumn(
  readingKey: string,
  meta: ReadingMeta,
): number {
  const documentKey = meta.document;
  const start = parseFolio(meta.page_start);
  const end = parseFolio(meta.page_end);

  const sourceDir = join(SOURCES_DIR, "transcription", documentKey);
  if (!existsSync(sourceDir)) return 0;

  // List and sort available column files
  const files = readdirSync(sourceDir)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => {
      const ref = basename(f, ".md");
      try {
        return [{ file: f, ...parseFolio(ref) }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.sort - b.sort);

  // Select files in the reading's folio range
  const selected = files.filter(
    (f) => f.sort >= start.sort && f.sort <= end.sort
  );

  if (selected.length === 0) return 0;

  // Collect column blocks: ref, pdfPage, content
  const blocks: { ref: string; pdfPage: string; content: string }[] = [];
  for (const entry of selected) {
    const raw = readFileSync(join(sourceDir, entry.file), "utf-8").trim();
    let content = raw;
    let pdfPage = "";
    // Strip frontmatter if present, extracting pdf_page
    if (content.startsWith("---")) {
      const endIdx = content.indexOf("---", 3);
      if (endIdx !== -1) {
        const fm = content.slice(0, endIdx);
        const pageMatch = fm.match(/pdf_page:\s*(\d+)/);
        if (pageMatch) pdfPage = pageMatch[1];
        content = content.slice(endIdx + 3).trim();
      }
    }
    blocks.push({ ref: entry.ref, pdfPage, content });
  }

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
    const outPath = join(outDir, `${block.ref}.md`);
    if (existsSync(outPath)) continue;

    const lines: string[] = [];
    lines.push("---");
    lines.push(`reading: ${yamlValue(readingKey)}`);
    lines.push(`page: ${block.ref}`);
    lines.push(`pdf_page: ${block.pdfPage}`);
    lines.push(`sortable_pagination_id: "${sortablePaginationId(block.ref)}"`);
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

const readings = readdirSync(metaDir)
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
