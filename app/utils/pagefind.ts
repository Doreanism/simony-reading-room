export const MIN_SEARCH_LENGTH = 3

let pagefindPromise: Promise<any> | null = null

function loadPagefind() {
  if (pagefindPromise) return pagefindPromise
  // Nuxt's virtual:public transform converts static asset imports into URL strings.
  // Two-stage import: first get the resolved URL, then import the actual module.
  // Indirect so Rollup doesn't try to resolve the import at build time
  const path = '/pagefind/pagefind.js'
  pagefindPromise = import(/* @vite-ignore */ path)
  return pagefindPromise
}

export interface PagefindSearchResult {
  type: 'transcription' | 'translation'
  documentKey: string
  folio: string
  pdfPage: number
  readingKey?: string
  excerpt: string
}

interface PagefindResult {
  id: string
  data: () => Promise<PagefindResultData>
}

interface PagefindResultData {
  url: string
  excerpt: string
  meta: Record<string, string>
  filters: Record<string, string[]>
}

export async function searchPagefind(
  query: string,
  options?: { documentKey?: string; limit?: number },
): Promise<PagefindSearchResult[]> {
  if (import.meta.server) return []
  const pf = await loadPagefind()

  const filters: Record<string, string> = {}
  if (options?.documentKey) {
    filters.documentKey = options.documentKey
  }

  const wildcarded = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(' ')
  const response = await pf.search(wildcarded, { filters })
  const limit = options?.limit ?? 50
  const results: PagefindSearchResult[] = []

  for (const result of response.results.slice(0, limit) as PagefindResult[]) {
    const data = await result.data()
    const type = data.filters.type?.[0] as 'transcription' | 'translation' ?? 'transcription'
    results.push({
      type,
      documentKey: data.meta.documentKey,
      folio: data.meta.folio,
      pdfPage: Number(data.meta.pdfPage),
      readingKey: data.meta.readingKey || undefined,
      excerpt: data.excerpt,
    })
  }

  return results
}
