import { readFileSync } from "fs";

export interface OcrLine {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  type?: "heading";
}

export interface PageJson {
  pdf_page: number;
  folio: string;
  page_width: number;
  page_height: number;
  image_width: number;
  image_height: number;
  lines: OcrLine[];
  // Legacy format with pre-split columns
  columns?: { a: OcrLine[]; b: OcrLine[] };
}

/**
 * Detect headings based on pilcrow (¶) markers.
 * Lines starting with ¶ contain a heading that runs to the first colon or period.
 * The line is split: heading text becomes a separate heading line, the remainder
 * stays as body text. Mutates the input array.
 */
export function detectHeadings(lines: OcrLine[]): void {
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].text.match(/^¶\s*(.+?[:.])(.+)/);
    if (match) {
      // Split into heading + continuation
      const headingLine: OcrLine = {
        ...lines[i],
        text: match[1].trim(),
        type: "heading",
      };
      const bodyLine: OcrLine = {
        ...lines[i],
        text: match[2].trim(),
      };
      lines.splice(i, 1, headingLine, bodyLine);
    } else if (lines[i].text.match(/^¶\s/)) {
      // Whole line is the heading (no colon/period to split on)
      lines[i].text = lines[i].text.replace(/^¶\s*/, "");
      lines[i].type = "heading";
    }
  }
}

/**
 * Split lines into columns based on horizontal midpoint.
 */
export function splitColumns(lines: OcrLine[]): { a: OcrLine[]; b: OcrLine[] } {
  const a: OcrLine[] = [];
  const b: OcrLine[] = [];
  for (const line of lines) {
    const midX = (line.x0 + line.x1) / 2;
    if (midX < 0.5) {
      a.push(line);
    } else {
      b.push(line);
    }
  }
  a.sort((x, y) => x.y0 - y.y0);
  b.sort((x, y) => x.y0 - y.y0);
  return { a, b };
}

/**
 * Process a page JSON into column entries with heading-detected, sorted lines.
 * Handles both `lines` and legacy `columns` formats.
 */
export function processPage(
  data: PageJson,
  twoColumn: boolean,
): { col: string; lines: OcrLine[] }[] {
  if (twoColumn) {
    const rawLines = data.lines ?? [...(data.columns?.a ?? []), ...(data.columns?.b ?? [])];
    const columns = splitColumns(rawLines);
    const entries = [
      { col: "a", lines: columns.a },
      { col: "b", lines: columns.b },
    ];
    for (const entry of entries) detectHeadings(entry.lines);
    return entries;
  } else {
    const allLines = data.lines ?? [...(data.columns?.a ?? []), ...(data.columns?.b ?? [])];
    allLines.sort((a, b) => a.y0 - b.y0);
    detectHeadings(allLines);
    return [{ col: "", lines: allLines }];
  }
}

/**
 * Convert processed lines to text. Headings become `## {text}`, body lines are plain text.
 */
export function linesToText(lines: OcrLine[]): string {
  return lines
    .map((l) => (l.type === "heading" ? `## ${l.text}` : l.text))
    .join("\n");
}

/**
 * Read and parse a page JSON file.
 */
export function readPageJson(filePath: string): PageJson {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}
