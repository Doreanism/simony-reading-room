import { searchPagefind, type PagefindSearchResult } from '~/utils/pagefind'

export function usePagefindSearch(options?: { query?: Ref<string>; documentKey?: string; limit?: number }) {
  const query = options?.query ?? ref('')
  const results = ref<PagefindSearchResult[]>([])
  const loading = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout>

  function search(val: string) {
    clearTimeout(debounceTimer)
    if (val.length < 2) {
      results.value = []
      loading.value = false
      return
    }
    loading.value = true
    debounceTimer = setTimeout(async () => {
      results.value = await searchPagefind(val, {
        documentKey: options?.documentKey,
        limit: options?.limit ?? 50,
      })
      loading.value = false
    }, 300)
  }

  watch(query, search)

  return { query, results, loading, search }
}
