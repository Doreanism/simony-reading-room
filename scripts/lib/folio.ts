import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

export interface Folio {
  folio: number;
  side: "r" | "v";
  col: "a" | "b";
  sort: number;
  ref: string;
}

export interface ReadingMeta {
  [key: string]: string;
}

const POS_MAP: Record<string, string> = {
  ra: "001",
  rb: "002",
  va: "003",
  vb: "004",
};

/**
 * Parse a folio reference like "145rb" into a sortable structure.
 */
export function parseFolio(ref: string): Folio {
  const m = ref.match(/^(\d+)(r|v)(a|b)$/);
  if (!m) throw new Error(`Invalid folio reference: ${ref}`);
  const folio = parseInt(m[1]);
  const side = m[2] as "r" | "v";
  const col = m[3] as "a" | "b";
  const sort = folio * 4 + (side === "v" ? 2 : 0) + (col === "b" ? 1 : 0);
  return { folio, side, col, sort, ref };
}

/**
 * Compute the sortable pagination ID for a folio reference.
 * e.g., "145rb" -> "145_002"
 */
export function sortablePaginationId(ref: string): string {
  const m = ref.match(/^(\d+)(r|v)(a|b)$/);
  if (!m) throw new Error(`Invalid folio reference: ${ref}`);
  const pos = POS_MAP[m[2] + m[3]];
  return `${m[1]}_${pos}`;
}

/**
 * Derive folio leaf from pdf page number.
 * For folio-two-column: consecutive PDF pages alternate recto/verso.
 * basePdfPage is the first PDF page, baseFolio is its folio number.
 * baseSide is whether basePdfPage is recto or verso.
 */
export function pdfPageToFolio(
  pdfPage: number,
  basePdfPage: number,
  baseFolio: number,
  baseSide: "r" | "v"
): { folio: number; side: "r" | "v"; leaf: string } {
  const offset = pdfPage - basePdfPage;
  const baseIsRecto = baseSide === "r";
  const absIndex = offset + (baseIsRecto ? 0 : 1);
  const folioOffset = Math.floor(absIndex / 2);
  const isRecto = absIndex % 2 === 0;
  const folio = baseFolio + folioOffset;
  const side = isRecto ? "r" : "v";
  return { folio, side, leaf: `${folio}${side}` };
}

/**
 * Simple YAML parser for flat key: value files.
 */
export function readYaml(path: string): ReadingMeta {
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
export function yamlValue(val: string): string {
  if (val.includes(":") || val.includes("#") || val.includes('"')) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return val;
}

/**
 * Get the set of PDF page numbers that belong to readings for a given document.
 */
export function getReadingPagesForDocument(documentKey: string): Set<number> {
  const metaDir = join("content/readings/meta");
  const pages = new Set<number>();
  try {
    const files = readdirSync(metaDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const meta = readYaml(join(metaDir, file));
      if (meta.document !== documentKey) continue;
      const start = parseInt(meta.pdf_page_start);
      const end = parseInt(meta.pdf_page_end);
      for (let p = start; p <= end; p++) pages.add(p);
    }
  } catch {
    // No readings meta directory
  }
  return pages;
}

/**
 * Read markdown file, return { frontmatter, body } where body is the text after frontmatter.
 */
export function readMarkdown(path: string): { frontmatter: ReadingMeta; body: string } {
  const text = readFileSync(path, "utf-8");
  const lines = text.split("\n");
  const frontmatter: ReadingMeta = {};
  let bodyStart = 0;

  if (lines[0]?.trim() === "---") {
    const endIdx = lines.indexOf("---", 1);
    if (endIdx !== -1) {
      for (let i = 1; i < endIdx; i++) {
        const m = lines[i].match(/^([\w_]+):\s*(.+)$/);
        if (m) {
          let val = m[2].trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          frontmatter[m[1]] = val;
        }
      }
      bodyStart = endIdx + 1;
    }
  }

  return { frontmatter, body: lines.slice(bodyStart).join("\n") };
}
