export function folioLabel(pagination: string | undefined | null, start: string | number, end: string | number): string {
  const prefix = pagination === 'page' ? 'p.' : 'fol.'
  return `${prefix} ${start}\u2013${end}`
}
