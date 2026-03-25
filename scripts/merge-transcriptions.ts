#!/usr/bin/env tsx

/**
 * Merges transcription JSON from /tmp/transcriptions/ into the project's
 * page JSON files at public/d/, aligning with OCR coordinates.
 *
 * For each pageN.json in /tmp/transcriptions/:
 *   1. Read the transcription text (columns a and b)
 *   2. Read the existing OCR-based JSON from public/d/
 *   3. Align transcription lines with OCR line positions
 *   4. Write the updated JSON back
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const TMP_DIR = process.argv[2] || "/tmp/transcriptions-new";
const documentKey = process.argv[3] || "john-major-sentences-a";
const PUBLIC_PAGES = `public/d/${documentKey}`;

interface TransLine {
  text: string;
}

interface OcrLine {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PageJson {
  pdf_page: number;
  folio: string;
  page_width: number;
  page_height: number;
  image_width: number;
  image_height: number;
  columns: {
    a: OcrLine[];
    b: OcrLine[];
  };
}

function alignLines(ocrLines: OcrLine[], transLines: TransLine[]): OcrLine[] {
  const nOcr = ocrLines.length;
  const nTrans = transLines.length;

  if (nTrans === 0) return [];

  const result: OcrLine[] = [];

  function processLine(text: string, coords: OcrLine): OcrLine {
    const isHeading = text.startsWith("## ");
    const entry: any = { ...coords, text: isHeading ? text.slice(3) : text };
    if (isHeading) entry.type = "heading";
    else delete entry.type;
    return entry;
  }

  if (nOcr === nTrans) {
    for (let i = 0; i < nTrans; i++) {
      result.push(processLine(transLines[i].text, ocrLines[i]));
    }
  } else if (nOcr > 0) {
    // Interpolate
    for (let i = 0; i < nTrans; i++) {
      const ocrIdx = Math.round((i * (nOcr - 1)) / Math.max(nTrans - 1, 1));
      const ocr = ocrLines[Math.min(ocrIdx, nOcr - 1)];
      result.push(processLine(transLines[i].text, ocr));
    }
  } else {
    // No OCR lines — use placeholder coordinates
    for (let i = 0; i < nTrans; i++) {
      const placeholder: OcrLine = { text: "", x0: 0.1, y0: 0.08 + i * 0.85 / Math.max(nTrans, 1), x1: 0.48, y1: 0.08 + (i + 1) * 0.85 / Math.max(nTrans, 1) };
      result.push(processLine(transLines[i].text, placeholder));
    }
  }

  return result;
}

const files = readdirSync(TMP_DIR)
  .filter((f) => f.match(/^page\d+\.json$/))
  .sort((a, b) => {
    const na = parseInt(a.replace("page", "").replace(".json", ""));
    const nb = parseInt(b.replace("page", "").replace(".json", ""));
    return na - nb;
  });

let merged = 0;

for (const file of files) {
  const pageNum = parseInt(file.replace("page", "").replace(".json", ""));
  const transPath = join(TMP_DIR, file);
  const publicPath = join(PUBLIC_PAGES, `${pageNum}.json`);

  if (!existsSync(publicPath)) {
    console.warn(`  No public JSON for page ${pageNum}, skipping`);
    continue;
  }

  const trans: { columns: { a: TransLine[]; b: TransLine[] } } = JSON.parse(
    readFileSync(transPath, "utf-8")
  );
  const existing: PageJson = JSON.parse(readFileSync(publicPath, "utf-8"));

  // Normalize: handle both plain strings and {text: "..."} objects
  function normalize(items: any[]): TransLine[] {
    return (items ?? [])
      .map((l: any) => ({ text: typeof l === "string" ? l : l?.text ?? "" }))
      .filter((l) => l.text.trim().length > 0);
  }

  const transA = normalize(trans.columns?.a);
  const transB = normalize(trans.columns?.b);

  // Align with OCR positions
  const alignedA = alignLines(existing.columns.a, transA);
  const alignedB = alignLines(existing.columns.b, transB);

  // Update
  existing.columns.a = alignedA;
  existing.columns.b = alignedB;

  writeFileSync(publicPath, JSON.stringify(existing, null, 2));
  merged++;

  if (merged % 50 === 0) {
    console.log(`  Merged ${merged} pages...`);
  }
}

console.log(`\nMerged ${merged} pages total.`);
