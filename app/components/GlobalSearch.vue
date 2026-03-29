<script setup lang="ts">
import { searchPagefind, type PagefindSearchResult } from '~/composables/usePagefind'

const query = ref('')
const results = ref<PagefindSearchResult[]>([])
const loading = ref(false)

let debounceTimer: ReturnType<typeof setTimeout>

watch(query, (val) => {
  clearTimeout(debounceTimer)
  if (val.length < 2) {
    results.value = []
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    results.value = await searchPagefind(val, { limit: 50 })
    loading.value = false
  }, 300)
})

function resultUrl(result: PagefindSearchResult) {
  if (result.type === 'translation' && result.readingKey) {
    return `/readings/${result.readingKey}#${result.folio}`
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
    <div v-else-if="query.length >= 2 && results.length === 0" class="mt-2 text-sm text-neutral-500 text-center">
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
          <!-- eslint-disable-next-line vue/no-v-html -->
          <p class="text-sm font-serif leading-snug pagefind-excerpt" v-html="result.excerpt" />
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pagefind-excerpt :deep(mark) {
  background: color-mix(in srgb, var(--ui-primary) 30%, transparent);
  border-radius: 0.125rem;
  padding-inline: 0.125rem;
  color: inherit;
}
</style>
