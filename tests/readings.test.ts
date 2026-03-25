import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { parseFolio, readYaml } from "../scripts/lib/folio.js";
import { normalizeSearch } from "../utils/normalize-search.js";

const READINGS_META = "content/readings/meta";
const READINGS_TRANSCRIPTION = "content/readings/transcription";
const READINGS_TRANSLATION = "content/readings/translation";

/**
 * Extract folio markers from a reading file.
 * Markers look like: [145rb](/documents/john-major-sentences-a/299)
 */
function extractFolioMarkers(content: string): string[] {
  const pattern = /^\[(\d+[rv][ab])\]\(/gm;
  const markers: string[] = [];
  let match;
  while ((match = pattern.exec(content))) {
    markers.push(match[1]);
  }
  return markers;
}

/**
 * Extract the body text (after frontmatter) from a reading file.
 */
function extractBody(content: string): string {
  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return content;
  return content.slice(endIdx + 3).trim();
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

    it(`${readingKey} transcription has consecutive folio markers within page range`, () => {
      const transcriptionPath = join(READINGS_TRANSCRIPTION, `${readingKey}.md`);
      const content = readFileSync(transcriptionPath, "utf-8");
      const markers = extractFolioMarkers(content);
      const fullSequence = expectedFolioSequence(meta.page_start, meta.page_end);

      expect(markers.length).toBeGreaterThan(0);

      for (const m of markers) {
        expect(fullSequence).toContain(m);
      }

      // Markers must be consecutive (no gaps)
      for (let i = 1; i < markers.length; i++) {
        const prev = parseFolio(markers[i - 1]);
        const curr = parseFolio(markers[i]);
        expect(curr.sort).toBe(prev.sort + 1);
      }
    });

    if (meta.start_text) {
      it(`${readingKey} transcription starts with start_text`, () => {
        const transcriptionPath = join(READINGS_TRANSCRIPTION, `${readingKey}.md`);
        const content = readFileSync(transcriptionPath, "utf-8");
        const body = normalizeSearch(extractBody(content));
        const startText = normalizeSearch(meta.start_text);

        expect(body).toContain(startText);
        // The start_text should appear before any substantial content
        const idx = body.indexOf(startText);
        // Allow up to 200 chars before start_text (folio marker + minor preamble)
        expect(idx).toBeLessThan(200);
      });
    }

    if (meta.end_text) {
      it(`${readingKey} transcription ends with end_text`, () => {
        const transcriptionPath = join(READINGS_TRANSCRIPTION, `${readingKey}.md`);
        const content = readFileSync(transcriptionPath, "utf-8");
        const body = normalizeSearch(extractBody(content));
        const endText = normalizeSearch(meta.end_text);

        expect(body).toContain(endText);
        // The end_text should appear near the end of the body
        const idx = body.indexOf(endText);
        expect(idx).toBeGreaterThan(body.length - 500);
      });
    }

    const translationPath = join(READINGS_TRANSLATION, `${readingKey}.md`);
    if (existsSync(translationPath)) {
      it(`${readingKey} translation has no straight quotes or apostrophes`, () => {
        const content = readFileSync(translationPath, "utf-8");
        const body = extractBody(content);
        // Strip markdown links and inline code before checking
        const textOnly = body.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/`[^`]+`/g, "");
        const matches = [...textOnly.matchAll(/["']/g)];
        if (matches.length > 0) {
          const examples = matches.slice(0, 5).map((m) => {
            const start = Math.max(0, m.index! - 20);
            const end = Math.min(textOnly.length, m.index! + 20);
            return `  ${m[0]} at offset ${m.index}: ...${textOnly.slice(start, end)}...`;
          });
          expect.fail(
            `Found ${matches.length} straight quote(s)/apostrophe(s) in translation body:\n${examples.join("\n")}`
          );
        }
      });
    }

    it(`${readingKey} transcription headings have blank lines around them`, () => {
      const transcriptionPath = join(READINGS_TRANSCRIPTION, `${readingKey}.md`);
      const content = readFileSync(transcriptionPath, "utf-8");
      const lines = extractBody(content).split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#")) {
          // Line before heading should be blank (or be the first line)
          if (i > 0) {
            expect(lines[i - 1].trim(), `Missing blank line before heading at line ${i}: "${lines[i]}"`).toBe("");
          }
          // Line after heading should be blank or another line (not required to be blank if heading is last)
          if (i < lines.length - 1) {
            expect(lines[i + 1].startsWith("#") || lines[i + 1].trim() === "" || !lines[i + 1].startsWith("["),
              `Heading at line ${i} should be followed by blank line or content: "${lines[i]}"`
            ).toBeTruthy();
          }
        }
      }
    });
  }
});
