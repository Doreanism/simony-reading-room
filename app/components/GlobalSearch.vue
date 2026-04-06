<script setup lang="ts">
const { query, results, loading } = usePagefindSearch({ limit: 50 })

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

    <SearchResults
      :query="query"
      :loading="loading"
      :results="results"
      list-class="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 max-h-96 overflow-y-auto text-left"
      class="mt-2 text-center"
    >
      <template #result="{ result }">
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
      </template>
    </SearchResults>
  </div>
</template>
