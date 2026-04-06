#!/usr/bin/env tsx

/**
 * Builds a Pagefind search index from document transcription and reading
 * translation files.
 *
 * Usage:
 *   tsx scripts/build-search-index.ts
 *
 * Reads:
 *   - content/documents/transcription/{doc}/{folio}.md  (OCR transcriptions)
 *   - content/readings/translation/{reading}/{folio}.md (reading translations)
 *   - content/readings/meta/*.md                        (reading metadata)
 *
 * Writes the Pagefind index to public/pagefind/.
 */

import { readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import * as pagefind from "pagefind";
import { readMarkdown, readYaml } from "./lib/folio.js";
import { normalizeText } from "../utils/normalize-search.js";

const TRANSCRIPTION_DIR = "content/documents/transcription";
const TRANSLATION_DIR = "content/readings/translation";
const READINGS_META_DIR = "content/readings/meta";

async function main() {
  const { index } = await pagefind.createIndex({
    forceLanguage: "la",
  });
  if (!index) throw new Error("Failed to create Pagefind index");

  let recordCount = 0;

  // --- Index document transcriptions ---
  if (existsSync(TRANSCRIPTION_DIR)) {
    const docs = readdirSync(TRANSCRIPTION_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const docKey of docs) {
      const docDir = join(TRANSCRIPTION_DIR, docKey);
      const files = readdirSync(docDir).filter((f) => f.endsWith(".md"));

      for (const file of files) {
        const { frontmatter, body } = readMarkdown(join(docDir, file));
        const folio = String(frontmatter.page || basename(file, ".md"));
        const pdfPage = String(frontmatter.pdf_page);
        if (!pdfPage) continue;

        // Strip markdown headings for plain text content
        const plainText = body
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/\\:/g, ":")
          .trim();
        if (!plainText) continue;

        // Normalize medieval characters so searches for modern text match
        const normalized = normalizeText(plainText);

        await index.addCustomRecord({
          url: `/documents/${docKey}/${pdfPage}`,
          content: normalized,
          language: "la",
          meta: {
            folio,
            pdfPage,
            documentKey: docKey,
          },
          filters: {
            type: ["transcription"],
            documentKey: [docKey],
          },
          sort: {
            pdfPage,
          },
        });
        recordCount++;
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
