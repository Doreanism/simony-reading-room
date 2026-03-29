import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join, basename } from "path";
import imageSize from "image-size";
import { readYaml, parseFolio } from "../scripts/lib/folio.js";

const DOCUMENTS_META = "content/documents/meta";
const READINGS_META = "content/readings/meta";
const PUBLIC_D = "public/d";

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
  }
});

/**
 * Enumerate all folio column refs between start and end (inclusive).
 * e.g. "145rb" to "146ra" → ["145rb", "145va", "145vb", "146ra"]
 */
function enumFolioRefs(startRef: string, endRef: string): string[] {
  const start = parseFolio(startRef);
  const end = parseFolio(endRef);
  const refs: string[] = [];
  for (let sort = start.sort; sort <= end.sort; sort++) {
    const folio = Math.floor(sort / 4);
    const rem = sort % 4;
    const side = rem >= 2 ? "v" : "r";
    const col = rem % 2 === 1 ? "b" : "a";
    refs.push(`${folio}${side}${col}`);
  }
  return refs;
}

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
      expect(existsSync(join("content/authors", `${author}.md`)), `Missing author: ${author}.md`).toBe(true);
    });

    it(`${key} has per-column transcription files for all pages`, () => {
      const transcriptionDir = join("content/documents/transcription", document);
      if (!existsSync(transcriptionDir)) {
        expect.fail(`Missing transcription directory: ${transcriptionDir}`);
      }
      const expected = enumFolioRefs(meta.page_start, meta.page_end);
      const missing = expected.filter(
        (ref) => !existsSync(join(transcriptionDir, `${ref}.md`))
      );
      expect(missing, `Missing column transcription files: ${missing.join(", ")}`).toEqual([]);
    });

    it(`${key} has reading-level transcription column files`, () => {
      const dir = join("content/readings/transcription", key);
      expect(
        existsSync(dir),
        `Missing reading transcription directory: ${key}/`
      ).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      expect(files.length, `No transcription column files in ${key}/`).toBeGreaterThan(0);
    });

    const translationDir = join("content/readings/translation", key);
    if (existsSync(translationDir)) {
      it(`${key} has reading-level translation column files`, () => {
        const files = readdirSync(translationDir).filter((f) => f.endsWith(".md"));
        expect(files.length, `No translation column files in ${key}/`).toBeGreaterThan(0);
      });
    }
  }
});
