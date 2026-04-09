export interface PaginationStartDef {
  pdf_page: number
  printed_page: number
  numeral_type?: string

}

function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
  const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i']
  let result = ''
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]!) {
      result += syms[i]
      n -= vals[i]!
    }
  }
  return result
}

function computeLabel(pdfPage: number, seg: PaginationStartDef, isFolio: boolean): string {
  if (isFolio) {
    const offset = pdfPage - seg.pdf_page
    const absIndex = offset
    const folioOffset = Math.floor(absIndex / 2)
    const isRecto = absIndex % 2 === 0
    const folio = seg.printed_page + folioOffset
    return `${folio}${isRecto ? 'r' : 'v'}`
  }
  const printed = seg.printed_page + (pdfPage - seg.pdf_page)
  if (seg.numeral_type === 'roman') {
    return toRoman(printed)
  }
  return String(printed)
}

/**
 * Build bidirectional maps between PDF page numbers and printed page labels.
 *
 * For folio pagination: labels like "2r", "145v".
 * For page pagination: labels like "42" or "xliv" (roman).
 * When a second numbering sequence collides, labels get a "2." prefix (e.g. "2.2r").
 * Front-matter pages (before the first segment) use their PDF page number.
 */
export function createPaginationMap(
  pagination: string,
  paginationStarts: PaginationStartDef[] | undefined,
  totalPages: number,
) {
  const pdfToLabel = new Map<number, string>()
  const labelToPdf = new Map<string, number>()

  if (!paginationStarts?.length) {
    for (let p = 1; p <= totalPages; p++) {
      const label = String(p)
      pdfToLabel.set(p, label)
      labelToPdf.set(label, p)
    }
    return { pdfToLabel, labelToPdf }
  }

  const isFolio = isFolioPagination(pagination)
  const sorted = [...paginationStarts].sort((a, b) => a.pdf_page - b.pdf_page)

  for (let si = 0; si < sorted.length; si++) {
    const seg = sorted[si]!
    const segEnd = si + 1 < sorted.length ? sorted[si + 1]!.pdf_page : totalPages + 1

    // Detect collision with earlier segments
    const firstLabel = computeLabel(seg.pdf_page, seg, isFolio)
    let n = 1
    let prefix = ''
    while (labelToPdf.has(prefix + firstLabel)) {
      n++
      prefix = `${n}.`
    }

    for (let pdfPage = seg.pdf_page; pdfPage < segEnd; pdfPage++) {
      const label = prefix + computeLabel(pdfPage, seg, isFolio)
      pdfToLabel.set(pdfPage, label)
      labelToPdf.set(label, pdfPage)
    }
  }

  // Pages outside pagination segments use "p{N}" (PDF page number) to avoid
  // collisions with printed page labels.
  for (let p = 1; p < sorted[0]!.pdf_page; p++) {
    const label = `p${p}`
    pdfToLabel.set(p, label)
    labelToPdf.set(label, p)
  }

  return { pdfToLabel, labelToPdf }
}
