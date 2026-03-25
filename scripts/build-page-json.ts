#!/usr/bin/env tsx

/**
 * Builds page JSON files with OCR text and line positions from Kraken.
 *
 * Usage:
 *   tsx scripts/build-page-json.ts <document-key> <pdf-page>
 *   tsx scripts/build-page-json.ts <document-key> <start-page> <end-page>
 *   tsx scripts/build-page-json.ts --reading <reading-key>
 *
 * Reads ocr_model and base pagination from document metadata.
 * Requires the .venv with kraken and pymupdf installed.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { pdfPageToFolio, readYaml } from "./lib/folio.js";

const PUBLIC_D = "public/d";
const DOCUMENTS_META = "content/documents/meta";
const VENV_PYTHON = join(process.cwd(), ".venv/bin/python3");
const OCR_SCRIPT = join(process.cwd(), "scripts/ocr-pages.py");
const DEFAULT_OCR_MODEL = "10.5281/zenodo.11113737";

interface DocumentConfig {
  basePdfPage: number;
  baseFolio: number;
  baseSide: "r" | "v";
  ocrModel: string;
}

function readDocumentConfig(documentKey: string): DocumentConfig {
  const metaPath = join(DOCUMENTS_META, `${documentKey}.md`);
  if (!existsSync(metaPath)) {
    console.error(`Document meta not found: ${metaPath}`);
    process.exit(1);
  }
  const meta = readYaml(metaPath);
  return {
    basePdfPage: parseInt(meta.base_pdf_page),
    baseFolio: parseInt(meta.base_folio),
    baseSide: meta.base_side as "r" | "v",
    ocrModel: meta.ocr_model ?? DEFAULT_OCR_MODEL,
  };
}

function ocrPages(documentKey: string, pageNumbers: number[], config: DocumentConfig): void {
  const pdfPath = join(PUBLIC_D, `${documentKey}.pdf`);
  if (!existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  const outDir = join(PUBLIC_D, documentKey);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const pages = pageNumbers.map((p) => {
    const { leaf } = pdfPageToFolio(p, config.basePdfPage, config.baseFolio, config.baseSide);
    return { page: p, folio: leaf };
  });

  const ocrConfig = JSON.stringify({
    out_dir: outDir,
    pdf_path: pdfPath,
    ocr_model: config.ocrModel,
    pages,
  });

  console.log(`Running Kraken OCR on ${pages.length} page(s)...`);
  execSync(`${VENV_PYTHON} ${OCR_SCRIPT} ${JSON.stringify(ocrConfig)}`, {
    stdio: "inherit",
    timeout: pages.length * 120_000,
  });
}

// CLI
const args = process.argv.slice(2);

if (args[0] === "--reading") {
  const readingKey = args[1];
  const metaPath = join("content/readings/meta", `${readingKey}.md`);
  if (!existsSync(metaPath)) {
    console.error(`Reading not found: ${metaPath}`);
    process.exit(1);
  }
  const meta = readYaml(metaPath);
  const documentKey = meta.document;
  const start = parseInt(meta.pdf_page_start);
  const end = parseInt(meta.pdf_page_end);
  const config = readDocumentConfig(documentKey);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  console.log(`Building JSON for reading ${readingKey}: pages ${start}-${end}`);
  ocrPages(documentKey, pages, config);
} else {
  const documentKey = args[0];

  if (!documentKey) {
    console.error("Usage:");
    console.error("  tsx scripts/build-page-json.ts <document-key> [start-page] [end-page]");
    console.error("  tsx scripts/build-page-json.ts --reading <reading-key>");
    process.exit(1);
  }

  const config = readDocumentConfig(documentKey);
  const metaPath = join(DOCUMENTS_META, `${documentKey}.md`);
  const meta = readYaml(metaPath);
  const totalPages = parseInt(meta.pages);

  const startPage = args[1] ? parseInt(args[1]) : 1;
  const endPage = args[2] ? parseInt(args[2]) : args[1] ? parseInt(args[1]) : totalPages;

  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  ocrPages(documentKey, pages, config);
}
