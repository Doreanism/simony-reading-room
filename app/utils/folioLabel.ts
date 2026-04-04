export function folioLabel(pagination: string | undefined | null, start: string | number, end: string | number): string {
  const prefix = pagination === 'page' || pagination === 'page-two-column' ? 'p.' : 'fol.'
  return `${prefix} ${start}\u2013${end}`
}
