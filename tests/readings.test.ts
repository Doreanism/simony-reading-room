import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { parseFolio, readYaml, readMarkdown } from "../scripts/lib/folio.js";
import { normalizeSearch } from "../utils/normalize-search.js";

const READINGS_META = "content/readings/meta";
const READINGS_TRANSCRIPTION = "content/readings/transcription";
const READINGS_TRANSLATION = "content/readings/translation";

/**
 * Extract the body text (after frontmatter) from a reading file.
 */
function extractBody(content: string): string {
  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return content;
  return content.slice(endIdx + 3).trim();
}

/**
 * Get sorted column files for a reading directory.
 */
function getColumnFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => {
      return parseFolio(basename(a, ".md")).sort - parseFolio(basename(b, ".md")).sort;
    });
}


/**
 * Return the structural signature of a markdown body: an array describing
 * the sequence of block types. Each entry is either { type: 'heading', depth }
 * or { type: 'paragraph' }. This lets us verify that transcription and
 * translation have the same block structure (not just the same totals).
 */
function blockStructure(body: string): Array<{ type: 'heading'; depth: number } | { type: 'paragraph' }> {
  return body.split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const headingMatch = block.match(/^(#{1,6})\s/);
      if (headingMatch) return { type: 'heading' as const, depth: headingMatch[1].length };
      return { type: 'paragraph' as const };
    });
}

/**
 * Generate the expected sequence of folio column refs from page_start to page_end.
 */
function expectedFolioSequence(pageStart: string, pageEnd: string): string[] {
  const start = parseFolio(pageStart);
  const end = parseFolio(pageEnd);
  const sequence: string[] = [];
  const positions: Array<{ side: "r" | "v"; col: "a" | "b" }> = [
    { side: "r", col: "a" },
    { side: "r", col: "b" },
    { side: "v", col: "a" },
    { side: "v", col: "b" },
  ];

  for (let folio = start.folio; folio <= end.folio + 1; folio++) {
    for (const pos of positions) {
      const ref = `${folio}${pos.side}${pos.col}`;
      const sort = folio * 4 + (pos.side === "v" ? 2 : 0) + (pos.col === "b" ? 1 : 0);
      if (sort >= start.sort && sort <= end.sort) {
        sequence.push(ref);
      }
    }
  }
  return sequence;
}

describe("readings", () => {
  const metaFiles = readdirSync(READINGS_META).filter((f) => f.endsWith(".md"));

  for (const metaFile of metaFiles) {
    const readingKey = basename(metaFile, ".md");
    const meta = readYaml(join(READINGS_META, metaFile));
    const transcriptionDir = join(READINGS_TRANSCRIPTION, readingKey);
    const translationDir = join(READINGS_TRANSLATION, readingKey);

    if (!existsSync(transcriptionDir)) continue;

    it(`${readingKey} transcription has consecutive column files within page range`, () => {
      const files = getColumnFiles(transcriptionDir);
      const refs = files.map((f) => basename(f, ".md"));
      const fullSequence = expectedFolioSequence(meta.page_start, meta.page_end);

      expect(refs.length).toBeGreaterThan(0);

      for (const ref of refs) {
        expect(fullSequence).toContain(ref);
      }

      // Column files must be consecutive (no gaps)
      for (let i = 1; i < refs.length; i++) {
        const prev = parseFolio(refs[i - 1]);
        const curr = parseFolio(refs[i]);
        expect(curr.sort).toBe(prev.sort + 1);
      }
    });

    it(`${readingKey} transcription columns have valid frontmatter`, () => {
      const files = getColumnFiles(transcriptionDir);
      for (const file of files) {
        const { frontmatter } = readMarkdown(join(transcriptionDir, file));
        expect(frontmatter.reading).toBe(readingKey);
        expect(frontmatter.page).toBe(basename(file, ".md"));
        expect(frontmatter.pdf_page).toBeTruthy();
        expect(frontmatter.sortable_pagination_id).toBeTruthy();
      }
    });

    if (meta.start_text) {
      it(`${readingKey} transcription starts with start_text`, () => {
        const files = getColumnFiles(transcriptionDir);
        const firstFile = readFileSync(join(transcriptionDir, files[0]), "utf-8");
        const body = normalizeSearch(extractBody(firstFile));
        const startText = normalizeSearch(meta.start_text);

        expect(body).toContain(startText);
        const idx = body.indexOf(startText);
        expect(idx).toBeLessThan(200);
      });
    }

    if (meta.end_text) {
      it(`${readingKey} transcription ends with end_text`, () => {
        const files = getColumnFiles(transcriptionDir);
        const lastFile = readFileSync(join(transcriptionDir, files[files.length - 1]), "utf-8");
        const body = normalizeSearch(extractBody(lastFile));
        const endText = normalizeSearch(meta.end_text);

        expect(body).toContain(endText);
        const idx = body.indexOf(endText);
        expect(idx).toBeGreaterThan(body.length - 500);
      });
    }

    it(`${readingKey} transcription has no unresolved [???] placeholders`, () => {
      const files = getColumnFiles(transcriptionDir);
      for (const file of files) {
        const content = readFileSync(join(transcriptionDir, file), "utf-8");
        const body = extractBody(content);
        expect(body, `Found [???] in ${file}`).not.toContain("[???]");
      }
    });

    it(`${readingKey} transcription first heading is h1`, () => {
      const files = getColumnFiles(transcriptionDir);
      const firstFile = readFileSync(join(transcriptionDir, files[0]), "utf-8");
      const body = extractBody(firstFile);
      const firstHeading = body.match(/^(#{1,6})\s/m);
      expect(firstHeading, `No heading found in first column of ${readingKey}`).toBeTruthy();
      expect(firstHeading![1], `First heading in ${readingKey} is h${firstHeading![1].length}, expected h1`).toBe("#");
    });

    it(`${readingKey} transcription headings don't skip levels`, () => {
      const files = getColumnFiles(transcriptionDir);
      let prevDepth = 0;
      for (const file of files) {
        const body = extractBody(readFileSync(join(transcriptionDir, file), "utf-8"));
        const headings = [...body.matchAll(/^(#{1,6})\s/gm)];
        for (const match of headings) {
          const depth = match[1].length;
          if (prevDepth > 0) {
            expect(
              depth,
              `Heading skips from h${prevDepth} to h${depth} in ${file}`
            ).toBeLessThanOrEqual(prevDepth + 1);
          }
          prevDepth = depth;
        }
      }
    });

    it(`${readingKey} transcription headings have blank lines around them`, () => {
      const files = getColumnFiles(transcriptionDir);
      for (const file of files) {
        const content = readFileSync(join(transcriptionDir, file), "utf-8");
        const lines = extractBody(content).split("\n");

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("#")) {
            if (i > 0) {
              expect(
                lines[i - 1].trim(),
                `Missing blank line before heading at line ${i} in ${file}: "${lines[i]}"`
              ).toBe("");
            }
          }
        }
      }
    });

    if (existsSync(translationDir)) {
      it(`${readingKey} translation has no straight quotes or apostrophes`, () => {
        const files = getColumnFiles(translationDir);
        for (const file of files) {
          const content = readFileSync(join(translationDir, file), "utf-8");
          const body = extractBody(content);
          const textOnly = body.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/`[^`]+`/g, "");
          const matches = [...textOnly.matchAll(/["']/g)];
          if (matches.length > 0) {
            const examples = matches.slice(0, 5).map((m) => {
              const start = Math.max(0, m.index! - 20);
              const end = Math.min(textOnly.length, m.index! + 20);
              return `  ${m[0]} at offset ${m.index}: ...${textOnly.slice(start, end)}...`;
            });
            expect.fail(
              `Found ${matches.length} straight quote(s)/apostrophe(s) in ${file}:\n${examples.join("\n")}`
            );
          }
        }
      });

      it(`${readingKey} translation columns match transcription columns`, () => {
        const transFiles = getColumnFiles(transcriptionDir).map((f) => basename(f, ".md"));
        const translFiles = getColumnFiles(translationDir).map((f) => basename(f, ".md"));
        expect(translFiles).toEqual(transFiles);
      });

      it(`${readingKey} transcription and translation block structure matches per column`, () => {
        const transFiles = getColumnFiles(transcriptionDir);
        const translFiles = getColumnFiles(translationDir);
        const translMap = new Map(translFiles.map((f) => [basename(f, ".md"), f]));

        for (const file of transFiles) {
          const page = basename(file, ".md");
          const translFile = translMap.get(page);
          if (!translFile) continue;

          const transBody = extractBody(readFileSync(join(transcriptionDir, file), "utf-8"));
          const translBody = extractBody(readFileSync(join(translationDir, translFile), "utf-8"));

          const transBlocks = blockStructure(transBody);
          const translBlocks = blockStructure(translBody);

          const format = (blocks: typeof transBlocks) =>
            blocks.map((b) => b.type === "heading" ? `h${b.depth}` : "p").join(", ");

          expect(
            translBlocks.length,
            `Column ${page}: structure mismatch\n  transcription: [${format(transBlocks)}]\n  translation:   [${format(translBlocks)}]`
          ).toBe(transBlocks.length);

          for (let i = 0; i < transBlocks.length; i++) {
            expect(
              translBlocks[i].type,
              `Column ${page}, block ${i + 1}: transcription has ${transBlocks[i].type} but translation has ${translBlocks[i]?.type}`
            ).toBe(transBlocks[i].type);

            if (transBlocks[i].type === "heading" && translBlocks[i]?.type === "heading") {
              expect(
                (translBlocks[i] as any).depth,
                `Column ${page}, block ${i + 1}: heading depth mismatch`
              ).toBe((transBlocks[i] as any).depth);
            }
          }
        }
      });
    }
  }
});
