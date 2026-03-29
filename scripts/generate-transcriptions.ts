#!/usr/bin/env tsx

/**
 * Generates per-column transcription .md files from page JSON.
 *
 * Usage:
 *   tsx scripts/generate-transcriptions.ts [document-key]
 *
 * Reads JSON files from public/d/{document-key}/{N}.json, splits lines
 * into columns based on horizontal position, and writes transcription
 * markdown to content/documents/transcription/{document-key}/{folio}{col}.md
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { sortablePaginationId, readYaml } from "./lib/folio.js";

interface OcrLine {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  type?: "heading";
}

interface PageJson {
  pdf_page: number;
  folio: string;
  page_width: number;
  page_height: number;
  image_width: number;
  image_height: number;
  lines: OcrLine[];
  // Legacy format with pre-split columns
  columns?: { a: OcrLine[]; b: OcrLine[] };
}

const PUBLIC_D = "public/d";
const TRANSCRIPTIONS = "content/documents/transcription";

/**
 * Detect headings based on pilcrow (¶) markers.
 * Lines starting with ¶ contain a heading that runs to the first colon or period.
 * The line is split: heading text becomes a separate heading line, the remainder
 * stays as body text. Mutates the input array.
 */
function detectHeadings(lines: OcrLine[]): void {
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].text.match(/^¶\s*(.+?[:.])(.+)/);
    if (match) {
      // Split into heading + continuation
      const headingLine: OcrLine = {
        ...lines[i],
        text: match[1].trim(),
        type: "heading",
      };
      const bodyLine: OcrLine = {
        ...lines[i],
        text: match[2].trim(),
      };
      lines.splice(i, 1, headingLine, bodyLine);
    } else if (lines[i].text.match(/^¶\s/)) {
      // Whole line is the heading (no colon/period to split on)
      lines[i].text = lines[i].text.replace(/^¶\s*/, "");
      lines[i].type = "heading";
    }
  }
}

/**
 * Split lines into columns based on horizontal midpoint.
 */
function splitColumns(lines: OcrLine[]): { a: OcrLine[]; b: OcrLine[] } {
  const a: OcrLine[] = [];
  const b: OcrLine[] = [];
  for (const line of lines) {
    const midX = (line.x0 + line.x1) / 2;
    if (midX < 0.5) {
      a.push(line);
    } else {
      b.push(line);
    }
  }
  a.sort((x, y) => x.y0 - y.y0);
  b.sort((x, y) => x.y0 - y.y0);
  return { a, b };
}

function generateForDocument(documentKey: string) {
  const pagesDir = join(PUBLIC_D, documentKey);
  if (!existsSync(pagesDir)) {
    console.warn(`No pages directory: ${pagesDir}`);
    return;
  }

  // Read document metadata to determine pagination type
  const metaPath = join("content/documents/meta", `${documentKey}.md`);
  const meta = existsSync(metaPath) ? readYaml(metaPath) : {};
  const twoColumn = meta.pagination === "folio-two-column";

  const outDir = join(TRANSCRIPTIONS, documentKey);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const jsonFiles = readdirSync(pagesDir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => parseInt(a) - parseInt(b));

  let written = 0;

  for (const jsonFile of jsonFiles) {
    const data: PageJson = JSON.parse(
      readFileSync(join(pagesDir, jsonFile), "utf-8")
    );

    // Skip pages without valid folio metadata
    if (!data.folio || !data.folio.match(/^\d+(r|v)$/)) continue;

    // Split lines into columns for two-column layouts, or treat as single column
    let columnEntries: { col: string; lines: OcrLine[] }[];

    if (twoColumn) {
      const rawLines = data.lines ?? [...(data.columns?.a ?? []), ...(data.columns?.b ?? [])];
      const columns = splitColumns(rawLines);
      columnEntries = [
        { col: "a", lines: columns.a },
        { col: "b", lines: columns.b },
      ];
    } else {
      // Single-column: all lines go into one file (no column suffix)
      const allLines = data.lines ?? [...(data.columns?.a ?? []), ...(data.columns?.b ?? [])];
      allLines.sort((a, b) => a.y0 - b.y0);
      columnEntries = [{ col: "", lines: allLines }];
    }

    for (const { col, lines } of columnEntries) {
      if (lines.length === 0) continue;
      detectHeadings(lines);

      const ref = col ? `${data.folio}${col}` : data.folio;
      const sid = sortablePaginationId(ref);

      const frontmatter = [
        "---",
        `page: ${ref}`,
        `pdf_page: ${data.pdf_page}`,
        `sortable_pagination_id: "${sid}"`,
        "---",
      ].join("\n");

      const body = lines
        .map((l) => (l.type === "heading" ? `## ${l.text}` : l.text))
        .join("\n")
        // Escape :word patterns so MDC doesn't treat them as inline components
        .replace(/:([a-zA-Z])/g, "\\:$1");
      const outPath = join(outDir, `${ref}.md`);
      writeFileSync(outPath, frontmatter + "\n" + body + "\n");
      written++;
    }
  }

  console.log(`Generated ${written} transcription files for ${documentKey}`);
}

// CLI
const documentKey = process.argv[2];

if (documentKey) {
  generateForDocument(documentKey);
} else {
  // Generate for all documents that have JSON pages
  if (!existsSync(PUBLIC_D)) {
    console.log("No public/d directory found.");
    process.exit(0);
  }
  const documents = readdirSync(PUBLIC_D, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const documentKey of documents) {
    generateForDocument(documentKey);
  }
}

// Rebuild the Pagefind search index
console.log("Rebuilding search index...");
execSync("tsx scripts/build-search-index.ts", { stdio: "inherit" });
