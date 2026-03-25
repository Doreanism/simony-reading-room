<script setup lang="ts">
const query = ref('')

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

interface SearchResponse {
  results: SearchResult[]
  hasMore: boolean
}

const debouncedQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout>

watch(query, (val) => {
  clearTimeout(debounceTimer)
  if (val.length < 2) {
    debouncedQuery.value = ''
    return
  }
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = val
  }, 300)
})

const { data: searchData, status } = await useLazyAsyncData(
  'global-search',
  () => $fetch<SearchResponse>('/api/search', { query: { q: debouncedQuery.value, limit: 50 } }),
  { watch: [debouncedQuery], default: () => ({ results: [], hasMore: false }) }
)

const results = computed(() => searchData.value?.results ?? [])
const hasMore = computed(() => searchData.value?.hasMore ?? false)
const loading = computed(() => status.value === 'pending' && debouncedQuery.value.length >= 2)

function resultUrl(result: SearchResult) {
  if (result.type === 'translation' && result.readingKey) {
    return `/readings/${result.readingKey}`
  }
  return `/documents/${result.documentKey}/${result.pdfPage}?q=${encodeURIComponent(query.value)}`
}
</script>

<template>
  <div class="w-full max-w-xl mx-auto">
    <UInput
      v-model="query"
      icon="i-lucide-search"
      placeholder="Search all texts..."
      color="neutral"
      variant="outline"
      size="lg"
      class="w-full"
    />

    <div v-if="query.length > 0 && query.length < 2" class="mt-2 text-sm text-neutral-500 text-center">
      Type at least 2 characters
    </div>
    <div v-else-if="loading" class="mt-2 text-sm text-neutral-500 text-center">
      Searching...
    </div>
    <div v-else-if="debouncedQuery.length >= 2 && results.length === 0" class="mt-2 text-sm text-neutral-500 text-center">
      No results found
    </div>
    <ul v-else-if="results.length > 0" class="mt-2 rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 max-h-96 overflow-y-auto text-left">
      <li v-for="(result, i) in results" :key="i">
        <NuxtLink
          :to="resultUrl(result)"
          class="block px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
        >
          <div class="text-xs text-neutral-500 mb-0.5">
            <span class="font-medium">fol. {{ result.folio }}</span>
            <span class="ml-2 text-neutral-400">{{ result.type }}</span>
          </div>
          <p class="text-sm font-serif leading-snug">
            <span>{{ result.snippet.before }}</span>
            <mark class="bg-primary/30 rounded-sm px-0.5 text-inherit">{{ result.snippet.match }}</mark>
            <span>{{ result.snippet.after }}</span>
          </p>
        </NuxtLink>
      </li>
      <li v-if="hasMore" class="px-3 py-2 text-xs text-center text-neutral-500">
        More results available — refine your search to narrow them down
      </li>
    </ul>
  </div>
</template>
