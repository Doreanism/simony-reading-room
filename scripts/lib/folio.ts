import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import yaml from "js-yaml";

export interface Folio {
  folio: number;
  side: "r" | "v";
  col: "a" | "b";
  sort: number;
  ref: string;
}

export interface ReadingMeta {
  [key: string]: any;
}

const POS_MAP: Record<string, string> = {
  ra: "001",
  rb: "002",
  va: "003",
  vb: "004",
};

/**
 * Parse a folio reference like "145rb", a page-column ref like "42a",
 * or a plain page number like "42" into a sortable structure.
 * Handles segment prefixes (e.g. "2.145rb") for documents with
 * multiple pagination segments that restart numbering.
 */
export function parseFolio(ref: string): Folio {
  // Strip leading segment prefix (2., 3., etc.)
  const segMatch = ref.match(/^(\d+)\./);
  const segNum = segMatch ? parseInt(segMatch[1]) : 0;
  const baseRef = segMatch ? ref.slice(segMatch[0].length) : ref;
  // Each segment level adds a large offset so prefixed folios sort after all unprefixed
  const segOffset = (segNum >= 2 ? segNum - 1 : 0) * 10000000;

  // Plain page number (pagination: page)
  const pageMatch = baseRef.match(/^(\d+)$/);
  if (pageMatch) {
    const page = parseInt(pageMatch[1]);
    return { folio: page, side: "r", col: "a", sort: page + segOffset, ref };
  }
  // Page-column ref (pagination: page-two-column), e.g. "42a", "42b"
  const pageColMatch = baseRef.match(/^(\d+)(a|b)$/);
  if (pageColMatch) {
    const page = parseInt(pageColMatch[1]);
    const col = pageColMatch[2] as "a" | "b";
    const sort = page * 2 + (col === "b" ? 1 : 0);
    return { folio: page, side: "r", col, sort: sort + segOffset, ref };
  }
  // Plain folio ref (pagination: folio), e.g. "3r", "3v"
  const folioOnlyMatch = baseRef.match(/^(\d+)(r|v)$/);
  if (folioOnlyMatch) {
    const folio = parseInt(folioOnlyMatch[1]);
    const side = folioOnlyMatch[2] as "r" | "v";
    const sort = folio * 2 + (side === "v" ? 1 : 0);
    return { folio, side, col: "a", sort: sort + segOffset, ref };
  }
  // Folio-column ref (pagination: folio-two-column), e.g. "145rb"
  const m = baseRef.match(/^(\d+)(r|v)(a|b)$/);
  if (!m) throw new Error(`Invalid folio reference: ${ref}`);
  const folio = parseInt(m[1]);
  const side = m[2] as "r" | "v";
  const col = m[3] as "a" | "b";
  const sort = folio * 4 + (side === "v" ? 2 : 0) + (col === "b" ? 1 : 0);
  return { folio, side, col, sort: sort + segOffset, ref };
}

/**
 * Compute the sortable pagination ID for a folio reference, page-column ref,
 * or plain page number.
 * e.g., "145rb" -> "145_002", "42a" -> "42_001", "42" -> "42"
 */
export function sortablePaginationId(ref: string): string {
  // Strip leading segment prefix (2., 3., etc.)
  const segMatch = ref.match(/^(\d+)\./);
  const segNum = segMatch ? parseInt(segMatch[1]) : 0;
  const baseRef = segMatch ? ref.slice(segMatch[0].length) : ref;
  const segPrefix = segNum >= 2 ? `${segNum}.` : "";

  // Plain page number
  if (/^\d+$/.test(baseRef)) return segPrefix + baseRef;
  // Page-column ref (pagination: page-two-column)
  const pageColMatch = baseRef.match(/^(\d+)(a|b)$/);
  if (pageColMatch) {
    const pos = pageColMatch[2] === "a" ? "001" : "002";
    return `${segPrefix}${pageColMatch[1]}_${pos}`;
  }
  // Plain folio ref (pagination: folio), e.g. "3r"
  const folioOnlyMatch2 = baseRef.match(/^(\d+)(r|v)$/);
  if (folioOnlyMatch2) return segPrefix + baseRef;
  // Folio-column ref (pagination: folio-two-column)
  const m = baseRef.match(/^(\d+)(r|v)(a|b)$/);
  if (!m) throw new Error(`Invalid folio reference: ${ref}`);
  const pos = POS_MAP[m[2] + m[3]];
  return `${segPrefix}${m[1]}_${pos}`;
}

/**
 * A pagination segment mapping a PDF page to a printed page number.
 * Documents may have multiple segments when unnumbered pages (e.g. half-title
 * pages) are inserted mid-document, or when page numbering restarts.
 */
export interface PaginationStart {
  pdfPage: number;
  printedPage: number;
  numeralType: string;
}

/**
 * Convert raw YAML pagination_starts list into typed PaginationStart[].
 */
export function parsePaginationStarts(value: any[]): PaginationStart[] {
  return value.map((item) => ({
    pdfPage: item.pdf_page,
    printedPage: item.printed_page,
    numeralType: item.numeral_type ?? "arabic",
  }));
}

/**
 * Compute the printed page number for a given PDF page using pagination segments.
 * Finds the last segment whose pdfPage is <= the given pdf page.
 */
export function pdfPageToPrintedPage(
  pdfPage: number,
  starts: PaginationStart[]
): number {
  let segment = starts[0];
  for (const s of starts) {
    if (pdfPage >= s.pdfPage) segment = s;
  }
  return segment.printedPage + (pdfPage - segment.pdfPage);
}

/**
 * Derive folio leaf from pdf page number.
 * For folio-two-column: consecutive PDF pages alternate recto/verso.
 * basePdfPage is the first PDF page (always recto), baseFolio is its folio number.
 */
export function pdfPageToFolio(
  pdfPage: number,
  basePdfPage: number,
  baseFolio: number,
): { folio: number; side: "r" | "v"; leaf: string } {
  const offset = pdfPage - basePdfPage;
  const absIndex = offset;
  const folioOffset = Math.floor(absIndex / 2);
  const isRecto = absIndex % 2 === 0;
  const folio = baseFolio + folioOffset;
  const side = isRecto ? "r" : "v";
  return { folio, side, leaf: `${folio}${side}` };
}

/**
 * Extract YAML frontmatter from a markdown file and return the text between
 * the opening and closing `---` delimiters.
 */
function extractFrontmatter(text: string): string {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return "";
  const endIdx = lines.indexOf("---", 1);
  if (endIdx === -1) return "";
  return lines.slice(1, endIdx).join("\n");
}

/**
 * Parse YAML frontmatter from a markdown file.
 */
export function readYaml(path: string): ReadingMeta {
  const text = readFileSync(path, "utf-8");
  const fm = extractFrontmatter(text);
  if (!fm) return {};
  return (yaml.load(fm) as ReadingMeta) ?? {};
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
 * Compute the segment prefix for each pagination segment.
 * When a later segment's first label collides with an earlier segment,
 * it gets a "2." prefix (or "3." for a third collision, etc.).
 * Returns segments sorted by pdfPage with their prefix.
 */
export function computeSegmentPrefixes(
  starts: PaginationStart[],
  pagination: string,
): { pdfPage: number; prefix: string }[] {
  const isFolio = pagination.startsWith("folio");
  const sorted = [...starts].sort((a, b) => a.pdfPage - b.pdfPage);
  const seenFirstLabels = new Set<string>();

  return sorted.map((seg) => {
    const firstLabel = isFolio
      ? `${seg.printedPage}r`
      : String(seg.printedPage);

    let n = 1;
    let prefix = "";
    while (seenFirstLabels.has(prefix + firstLabel)) {
      n++;
      prefix = `${n}.`;
    }
    seenFirstLabels.add(prefix + firstLabel);

    return { pdfPage: seg.pdfPage, prefix };
  });
}

/**
 * Look up the segment prefix for a given PDF page number.
 * segments must be sorted by pdfPage (as returned by computeSegmentPrefixes).
 */
export function getPrefixForPdfPage(
  pdfPage: number,
  segments: { pdfPage: number; prefix: string }[],
): string {
  let prefix = "";
  for (const seg of segments) {
    if (pdfPage >= seg.pdfPage) prefix = seg.prefix;
  }
  return prefix;
}

/**
 * Read markdown file, return { frontmatter, body } where body is the text after frontmatter.
 */
export function readMarkdown(path: string): { frontmatter: ReadingMeta; body: string } {
  const text = readFileSync(path, "utf-8");
  const lines = text.split("\n");

  if (lines[0]?.trim() === "---") {
    const endIdx = lines.indexOf("---", 1);
    if (endIdx !== -1) {
      const fm = lines.slice(1, endIdx).join("\n");
      const frontmatter = (yaml.load(fm) as ReadingMeta) ?? {};
      const body = lines.slice(endIdx + 1).join("\n");
      return { frontmatter, body };
    }
  }

  return { frontmatter: {}, body: text };
}
