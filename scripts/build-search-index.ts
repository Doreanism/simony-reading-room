#!/usr/bin/env tsx

/**
 * Builds a Pagefind search index from page JSON and reading translation files.
 *
 * Usage:
 *   tsx scripts/build-search-index.ts
 *
 * Reads:
 *   - public/d/{doc}/{N}.json                        (OCR page JSON)
 *   - content/documents/{doc}.md                 (document metadata)
 *   - content/readings/translation/{reading}/{folio}.md (reading translations)
 *   - content/readings/meta/*.md                      (reading metadata)
 *
 * Writes the Pagefind index to public/pagefind/.
 */

import { readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import * as pagefind from "pagefind";
import {
  readYaml, readMarkdown,
  parsePaginationStarts, computeSegmentSuffixes, getSuffixForPdfPage,
} from "./lib/folio.js";
import { processPage, linesToText, readPageJson } from "./lib/ocr.js";
import { normalizeText } from "../utils/normalize-search.js";

const PUBLIC_D = "public/d";
const DOCUMENTS_META = "content/documents";
const TRANSLATION_DIR = "content/readings/translation";
const READINGS_META_DIR = "content/readings/meta";

async function main() {
  const { index } = await pagefind.createIndex({
    forceLanguage: "la",
  });
  if (!index) throw new Error("Failed to create Pagefind index");

  let recordCount = 0;

  // --- Index document transcriptions from page JSON ---
  if (existsSync(DOCUMENTS_META) && existsSync(PUBLIC_D)) {
    const docMetaFiles = readdirSync(DOCUMENTS_META).filter((f) => f.endsWith(".md"));

    for (const metaFile of docMetaFiles) {
      const meta = readYaml(join(DOCUMENTS_META, metaFile));
      const docKey = meta.key || basename(metaFile, ".md");
      const pagesDir = join(PUBLIC_D, docKey);
      if (!existsSync(pagesDir)) continue;

      const twoColumn = meta.pagination === "folio-two-column" || meta.pagination === "page-two-column";
      const segments = meta.pagination_starts
        ? computeSegmentSuffixes(parsePaginationStarts(meta.pagination_starts), meta.pagination)
        : [];

      const jsonFiles = readdirSync(pagesDir)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => parseInt(a) - parseInt(b));

      for (const jsonFile of jsonFiles) {
        const data = readPageJson(join(pagesDir, jsonFile));
        const columnEntries = processPage(data, twoColumn);

        const validFolio = data.folio && /^(\d+(r|v)|\d+)$/.test(data.folio);
        const suffix = getSuffixForPdfPage(data.pdf_page, segments);

        for (const { col, lines } of columnEntries) {
          const folio = validFolio
            ? (col ? `${data.folio}${col}` : data.folio) + suffix
            : String(data.pdf_page);

          // Strip markdown headings for plain text content
          const plainText = linesToText(lines)
            .replace(/^#{1,6}\s+/gm, "")
            .trim();
          if (!plainText) continue;

          const normalized = normalizeText(plainText);

          await index.addCustomRecord({
            url: `/documents/${docKey}/${data.pdf_page}`,
            content: normalized,
            language: "la",
            meta: {
              folio,
              pdfPage: String(data.pdf_page),
              documentKey: docKey,
            },
            filters: {
              type: ["transcription"],
              documentKey: [docKey],
            },
            sort: {
              pdfPage: String(data.pdf_page),
            },
          });
          recordCount++;
        }
      }
    }
  }

  // --- Index reading translations ---
  // Build a map of reading key -> { document, ... } from reading meta
  const readingMeta = new Map<string, { document: string }>();
  if (existsSync(READINGS_META_DIR)) {
    for (const file of readdirSync(READINGS_META_DIR).filter((f) => f.endsWith(".md"))) {
      const meta = readYaml(join(READINGS_META_DIR, file));
      const key = meta.key || basename(file, ".md");
      readingMeta.set(key, { document: meta.document });
    }
  }

  if (existsSync(TRANSLATION_DIR)) {
    const readings = readdirSync(TRANSLATION_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const readingKey of readings) {
      const reading = readingMeta.get(readingKey);
      if (!reading) continue;

      const readingDir = join(TRANSLATION_DIR, readingKey);
      const files = readdirSync(readingDir).filter((f) => f.endsWith(".md"));

      for (const file of files) {
        const folio = basename(file, ".md");
        const { frontmatter, body } = readMarkdown(join(readingDir, file));
        const pdfPage = String(frontmatter.pdf_page);
        if (!pdfPage) continue;

        const plainText = body.replace(/^#{1,6}\s+/gm, "").trim();
        if (!plainText) continue;

        await index.addCustomRecord({
          url: `/readings/${readingKey}#${folio}`,
          content: plainText,
          language: "en",
          meta: {
            folio,
            pdfPage,
            documentKey: reading.document,
            readingKey,
          },
          filters: {
            type: ["translation"],
            documentKey: [reading.document],
          },
          sort: {
            pdfPage,
          },
        });
        recordCount++;
      }
    }
  }

  const { errors } = await index.writeFiles({ outputPath: "public/pagefind" });
  if (errors.length) {
    console.error("Pagefind errors:", errors);
    process.exit(1);
  }

  await pagefind.close();
  console.log(`Search index built: ${recordCount} records → public/pagefind/`);
}

main();
