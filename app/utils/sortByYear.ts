export function sortByYear<T extends { year?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
}
