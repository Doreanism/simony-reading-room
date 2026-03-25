#!/usr/bin/env tsx

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { normalizeText, normalizeSearch } from "../utils/normalize-search.js";

const CONTENT = "content";
const SOURCES_DIR = join(CONTENT, "documents");
const READINGS_DIR = join(CONTENT, "readings");

interface Folio {
  folio: number;
  side: "r" | "v";
  col: "a" | "b";
  sort: number;
  ref: string;
}

interface ReadingMeta {
  [key: string]: string;
}

/**
 * Parse a folio reference like "145rb" into a sortable structure.
 * Sort order: folio * 4 + (verso ? 2 : 0) + (col_b ? 1 : 0)
 */
function parseFolio(ref: string): Folio {
  const m = ref.match(/^(\d+)(r|v)(a|b)$/);
  if (!m) throw new Error(`Invalid folio reference: ${ref}`);
  const folio = parseInt(m[1]);
  const side = m[2] as "r" | "v";
  const col = m[3] as "a" | "b";
  const sort = folio * 4 + (side === "v" ? 2 : 0) + (col === "b" ? 1 : 0);
  return { folio, side, col, sort, ref };
}

/**
 * Simple YAML parser for flat key: value files.
 */
function readYaml(path: string): ReadingMeta {
  const text = readFileSync(path, "utf-8");
  const result: ReadingMeta = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([\w_]+):\s*(.+)$/);
    if (m) {
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      result[m[1]] = val;
    }
  }
  return result;
}

/**
 * Format YAML value, quoting if needed.
 */
function yamlValue(val: string): string {
  if (val.includes(":") || val.includes("#") || val.includes('"')) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return val;
}

/**
 * Build a combined markdown file for a reading from its per-column source files.
 * type is "transcription" or "translation".
 */
function buildCombined(
  readingKey: string,
  meta: ReadingMeta,
  type: "transcription" | "translation"
): string | null {
  const documentKey = meta.document;
  const start = parseFolio(meta.page_start);
  const end = parseFolio(meta.page_end);

  const sourceDir = join(SOURCES_DIR, type, documentKey);
  if (!existsSync(sourceDir)) return null;

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

  if (selected.length === 0) return null;

  // Build combined markdown with frontmatter
  const lines: string[] = [];

  // Keys used only for build-time trimming, not emitted in output frontmatter
  const buildKeys = new Set([
    "start_text", "end_text",
    "start_text_transcription", "end_text_transcription",
    "start_text_translation", "end_text_translation",
  ]);

  lines.push("---");
  for (const [key, val] of Object.entries(meta)) {
    if (!buildKeys.has(key)) {
      lines.push(`${key}: ${yamlValue(val)}`);
    }
  }
  lines.push("---");
  lines.push("");

  // Collect column blocks: folio marker + content
  const blocks: { marker: string; content: string }[] = [];
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
    const marker = pdfPage
      ? `[${entry.ref}](/documents/${documentKey}/${pdfPage})`
      : `[${entry.ref}]`;
    blocks.push({ marker, content });
  }

  // Join words split across column boundaries (marked with trailing "=")
  for (let i = 0; i < blocks.length - 1; i++) {
    const prev = blocks[i].content;
    const next = blocks[i + 1].content;
    // Check last line for a word split marked with "="
    const lastNewline = prev.lastIndexOf("\n");
    const lastLine = prev.slice(lastNewline + 1);
    const lineMatch = lastLine.match(/(\S+)=\s*.*$/);
    if (lineMatch) {
      const contMatch = next.match(/^(\S+)/);
      if (contMatch) {
        // Strip the split fragment (and any trailing marginal text) from the last line
        blocks[i].content =
          prev.slice(0, lastNewline + 1) +
          lastLine.slice(0, lineMatch.index);
        // Prepend the joined word to the next block
        blocks[i + 1].content =
          lineMatch[1] + contMatch[1] + next.slice(contMatch[0].length);
      }
    }
  }

  for (const block of blocks) {
    lines.push(block.marker);
    // Normalize medieval characters for the combined reading (preserve case)
    lines.push(normalizeText(block.content));
    lines.push("");
  }

  let result = lines.join("\n");

  // Trim to start_text / end_text boundaries if specified.
  // Type-specific keys (e.g. start_text_translation) override the generic key.
  const startText = meta[`start_text_${type}`] ?? meta.start_text;
  const endText = meta[`end_text_${type}`] ?? meta.end_text;

  if (startText) {
    const idx = normalizeSearch(result).indexOf(normalizeSearch(startText));
    if (idx === -1) {
      console.warn(`  WARNING: start_text not found in ${readingKey}/${type}: "${startText}"`);
    } else {
      // Find the preceding newline so we keep the line intact
      const lineStart = result.lastIndexOf("\n", idx);
      // Find the folio link that precedes this text so we can preserve it
      const precedingText = result.slice(0, idx);
      const folioMatch = precedingText.match(/.*(\[[^\]]+\]\([^)]*\))/s);
      const folioMarker = folioMatch ? folioMatch[1] : "";
      result =
        result.slice(0, fmEnd(result)) +
        "\n\n" +
        (folioMarker ? folioMarker + "\n" : "") +
        result.slice(lineStart + 1);
    }
  }

  if (endText) {
    const idx = normalizeSearch(result).indexOf(normalizeSearch(endText));
    if (idx === -1) {
      console.warn(`  WARNING: end_text not found in ${readingKey}/${type}: "${endText}"`);
    } else {
      // Include the end_text line itself, trim after the next newline
      const lineEnd = result.indexOf("\n", idx + endText.length);
      if (lineEnd !== -1) {
        result = result.slice(0, lineEnd) + "\n";
      }
    }
  }

  return result;
}

/**
 * Find the end of the YAML frontmatter in a built combined string.
 * Returns the index of the closing "---" plus its length.
 */
function fmEnd(text: string): number {
  // First "---" is at index 0; find the second
  const idx = text.indexOf("---", 3);
  return idx + 3;
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

  // Only build transcription from per-column files.
  // Translation files are written directly at the reading level, not generated.
  const combined = buildCombined(reading, meta, "transcription");
  if (combined) {
    const outDir = join(READINGS_DIR, "transcription");
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(join(outDir, `${reading}.md`), combined);
    console.log(`  readings/transcription/${reading}.md`);
    built++;
  }
}

console.log(`\nBuilt ${built} file(s).`);
