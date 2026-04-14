import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join, basename } from "path";
import imageSize from "image-size";
import { readYaml } from "../scripts/lib/folio.js";

const AUTHORS_DIR = "content/authors";
const DOCUMENTS_META = "content/documents";
const READINGS_META = "content/readings/meta";
const PUBLIC_D = "public/d";

describe("authors", () => {
  const authorFiles = readdirSync(AUTHORS_DIR).filter((f) => f.endsWith(".md"));

  for (const authorFile of authorFiles) {
    const meta = readYaml(join(AUTHORS_DIR, authorFile));
    const key = meta.key || basename(authorFile, ".md");
    const imagePath = meta.image;

    if (imagePath) {
      it(`${key} author image is square`, () => {
        const fullPath = join("public", imagePath.replace(/^\//, ""));
        if (!existsSync(fullPath)) {
          expect.fail(`Missing author image: ${fullPath}`);
        }
        const { width, height } = imageSize(readFileSync(fullPath));
        expect(width, `Author image ${width}×${height} is not square`).toBe(height);
      });
    }
  }
});

describe("documents", () => {
  const metaFiles = readdirSync(DOCUMENTS_META).filter((f) => f.endsWith(".md"));

  for (const metaFile of metaFiles) {
    const meta = readYaml(join(DOCUMENTS_META, metaFile));
    const key = meta.key || basename(metaFile, ".md");
    const pages = parseInt(meta.pages);
    const dir = join(PUBLIC_D, key);

    it(`${key} has all ${pages} webp files`, () => {
      const missing: number[] = [];
      for (let i = 1; i <= pages; i++) {
        if (!existsSync(join(dir, `${i}.webp`))) {
          missing.push(i);
        }
      }
      expect(missing, `Missing webp files: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`).toEqual([]);
    });

    it(`${key} cover image has 3:4 aspect ratio`, () => {
      const coverPath = join(dir, "cover.jpg");
      if (!existsSync(coverPath)) {
        expect.fail(`Missing cover image: ${coverPath}`);
      }
      const { width, height } = imageSize(readFileSync(coverPath));
      expect(width! * 4, `Cover ${width}×${height} is not 3:4`).toBe(height! * 3);
    });

it(`${key} has all ${pages} json files`, () => {
      const missing: number[] = [];
      for (let i = 1; i <= pages; i++) {
        if (!existsSync(join(dir, `${i}.json`))) {
          missing.push(i);
        }
      }
      expect(missing, `Missing json files: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`).toEqual([]);
    });

    if (meta.pagination_starts) {
      it(`${key} pagination_starts have required fields`, () => {
        for (const seg of meta.pagination_starts) {
          expect(seg.pdf_page, `pagination_starts entry missing pdf_page`).toBeDefined();
          expect(seg.printed_page, `pagination_starts entry missing printed_page`).toBeDefined();
          expect(seg.numeral_type, `pagination_starts entry missing numeral_type`).toBeDefined();
          expect(seg.pagination, `pagination_starts entry missing pagination`).toBeDefined();
        }
      });

      it(`${key} pagination_starts have correct parity`, () => {
        for (const seg of meta.pagination_starts) {
          const isFolio = seg.pagination?.startsWith("folio");
          if (isFolio) {
            expect(seg.pdf_page % 2, `Recto pdf_page ${seg.pdf_page} must be odd`).toBe(1);
          }
          // page / page-two-column / column: no parity invariant, since
          // segments may restart anywhere after unpaginated prefatory material.
        }
      });
    }
  }
});

describe("readings", () => {
  const metaFiles = readdirSync(READINGS_META).filter((f) => f.endsWith(".md"));

  for (const metaFile of metaFiles) {
    const meta = readYaml(join(READINGS_META, metaFile));
    const key = meta.key || basename(metaFile, ".md");
    const document = meta.document;
    const author = meta.author;

    it(`${key} references a valid document`, () => {
      expect(existsSync(join(DOCUMENTS_META, `${document}.md`)), `Missing document meta: ${document}.md`).toBe(true);
    });

    it(`${key} references a valid author`, () => {
      if (!author) return; // anonymous works have no author file
      expect(existsSync(join("content/authors", `${author}.md`)), `Missing author: ${author}.md`).toBe(true);
    });

    it(`${key} has page JSON files covering reading pages`, () => {
      const jsonDir = join(PUBLIC_D, document);
      if (!existsSync(jsonDir)) return; // skip when assets not downloaded
      const pdfStart = parseInt(meta.pdf_page_start);
      const pdfEnd = parseInt(meta.pdf_page_end);
      const missing: number[] = [];
      for (let p = pdfStart; p <= pdfEnd; p++) {
        if (!existsSync(join(jsonDir, `${p}.json`))) missing.push(p);
      }
      expect(missing, `Missing JSON files: ${missing.join(", ")}`).toEqual([]);
    });

    it(`${key} has reading transcription files`, () => {
      const dir = join("content/readings/transcription", key);
      expect(
        existsSync(dir),
        `Missing reading transcription directory: ${key}/`
      ).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      expect(files.length, `No transcription files in ${key}/`).toBeGreaterThan(0);
    });

    const translationDir = join("content/readings/translation", key);
    if (existsSync(translationDir)) {
      it(`${key} has reading translation files`, () => {
        const files = readdirSync(translationDir).filter((f) => f.endsWith(".md"));
        expect(files.length, `No translation files in ${key}/`).toBeGreaterThan(0);
      });
    }
  }
});
