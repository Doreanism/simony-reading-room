export interface PaginationStart {
  pdf_page: number
  printed_page: number
  numeral_type?: string
  pagination: string
}

export function paginationPrefix(pagination: string | undefined | null): string {
  if (pagination === 'column') return 'col.'
  return pagination === 'page' || pagination === 'page-two-column' ? 'p.' : 'fol.'
}

export function isFolioPagination(pagination: string | undefined | null): boolean {
  return pagination?.startsWith('folio') ?? false
}

export function folioLabel(pagination: string | undefined | null, start: string | number, end: string | number): string {
  return `${paginationPrefix(pagination)} ${start}\u2013${end}`
}

/**
 * Return the pagination type for the segment covering a given PDF page.
 * Falls back to "folio-two-column" when no segments are defined.
 */
export function paginationForPdfPage(
  starts: PaginationStart[] | undefined | null,
  pdfPage: number,
): string {
  if (!starts?.length) return 'folio-two-column'
  let seg = starts[0]!
  for (const s of starts) {
    if (pdfPage >= s.pdf_page) seg = s
  }
  return seg.pagination
}
