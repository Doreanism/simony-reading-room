export function paginationPrefix(pagination: string | undefined | null): string {
  return pagination === 'page' || pagination === 'page-two-column' ? 'p.' : 'fol.'
}

export function isFolioPagination(pagination: string | undefined | null): boolean {
  return pagination?.startsWith('folio') ?? false
}

export function folioLabel(pagination: string | undefined | null, start: string | number, end: string | number): string {
  return `${paginationPrefix(pagination)} ${start}\u2013${end}`
}
