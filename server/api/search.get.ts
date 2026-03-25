import { queryCollectionSearchSections, queryCollection } from '@nuxt/content/server'
import { normalizeSearch } from '~~/utils/normalize-search'

interface SnippetParts {
  before: string
  match: string
  after: string
}

interface SearchResult {
  type: 'transcription' | 'translation'
  documentKey: string
  folio: string
  pdfPage: number
  readingKey?: string
  snippet: SnippetParts
}

function extractFromId(sectionId: string): { documentKey: string; pageName: string } | null {
  const pathPart = sectionId.replace(/#.*$/, '')
  const segments = pathPart.split(/[\/:]/)
  if (segments.length < 2) return null
  return {
    documentKey: segments[segments.length - 2],
    pageName: segments[segments.length - 1],
  }
}

/**
 * Find the range in `original` that corresponds to `normIdx..normIdx+normLen`
 * in `normalizeSearch(original)`, by normalizing character-by-character.
 */
function mapNormRangeToOriginal(original: string, normIdx: number, normLen: number): [number, number] {
  let ni = 0 // position in normalized string
  let origStart = -1
  let origEnd = original.length
  for (let oi = 0; oi < original.length; oi++) {
    if (ni === normIdx && origStart < 0) origStart = oi
    const normChar = normalizeSearch(original[oi])
    ni += normChar.length
    if (origStart >= 0 && ni >= normIdx + normLen) {
      origEnd = oi + 1
      break
    }
  }
  if (origStart < 0) origStart = original.length
  return [origStart, origEnd]
}

function buildSnippet(text: string, normIdx: number, normLen: number): SnippetParts {
  const [matchStart, matchEnd] = mapNormRangeToOriginal(text, normIdx, normLen)
  const context = 50
  const start = Math.max(0, matchStart - context)
  const end = Math.min(text.length, matchEnd + context)
  return {
    before: (start > 0 ? '...' : '') + text.substring(start, matchStart),
    match: text.substring(matchStart, matchEnd),
    after: text.substring(matchEnd, end) + (end < text.length ? '...' : ''),
  }
}

export default defineEventHandler(async (event) => {
  const { q, documentKey, limit } = getQuery(event)

  if (!q || typeof q !== 'string' || q.length < 2) {
    return { results: [], total: 0 }
  }

  const maxResults = Math.min(Number(limit) || 50, 200)
  const query = normalizeSearch(q)

  const [transSections, transPages, translationSections, translationMeta] = await Promise.all([
    queryCollectionSearchSections(event, 'documentsTranscription'),
    queryCollection(event, 'documentsTranscription').all(),
    queryCollectionSearchSections(event, 'readingsTranslation'),
    queryCollection(event, 'readingsMeta').all(),
  ])

  function findPageMeta(pageName: string, documentKeyVal: string) {
    return transPages.find(p => p.page === pageName && p.path.includes(documentKeyVal))
  }

  const matches: SearchResult[] = []

  // Search transcriptions
  for (const section of transSections) {
    if (matches.length >= maxResults) break
    const idx = normalizeSearch(section.content).indexOf(query)
    if (idx < 0) continue
    const info = extractFromId(section.id)
    if (!info) continue
    if (documentKey && info.documentKey !== documentKey) continue
    const meta = findPageMeta(info.pageName, info.documentKey)
    if (!meta) continue
    matches.push({
      type: 'transcription',
      documentKey: info.documentKey,
      folio: meta.page,
      pdfPage: meta.pdf_page,
      snippet: buildSnippet(section.content, idx, query.length),
    })
  }

  // Search translations (skip if filtering by documentKey — translations are per-reading)
  if (!documentKey) {
    for (const section of translationSections) {
      if (matches.length >= maxResults) break
      const normalized = section.content.toLowerCase()
      const idx = normalized.indexOf(query)
      if (idx < 0) continue
      const sectionKey = section.id.replace(/#.*$/, '').split(/[\/:]/).pop()
      const reading = translationMeta.find(r => r.key === sectionKey)
      if (!reading) continue
      matches.push({
        type: 'translation',
        documentKey: reading.document,
        folio: `${reading.page_start}–${reading.page_end}`,
        pdfPage: reading.pdf_page_start,
        readingKey: reading.key,
        snippet: buildSnippet(section.content, idx, query.length),
      })
    }
  }

  matches.sort((a, b) => a.pdfPage - b.pdfPage)

  return {
    results: matches,
    hasMore: matches.length >= maxResults,
  }
})
