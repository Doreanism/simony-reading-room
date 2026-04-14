<script setup lang="ts">
const props = defineProps<{
  documentKey: string
  pageLabel: string
  paginationStarts?: any[]
  canPrev: boolean
  canNext: boolean
}>()

const emit = defineEmits<{
  navigate: [pdfPage: number]
  prev: []
  next: []
  fullscreen: []
  zoomIn: []
  zoomOut: []
}>()

const query = defineModel<string>({ default: '' })

const { results, loading, search } = usePagefindSearch({ query, documentKey: props.documentKey, limit: 200 })

if (query.value) {
  search(query.value)
}

function navigateTo(result: PagefindSearchResult) {
  emit('navigate', result.pdfPage)
}
</script>

<template>
  <div class="flex flex-col h-full text-(--ui-text)">
    <div class="p-3 flex flex-col gap-2">
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="!canPrev"
          aria-label="Previous"
          @click="emit('prev')"
        />
        <UButton
          icon="i-lucide-arrow-right"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="!canNext"
          aria-label="Next"
          @click="emit('next')"
        />
        <span class="text-sm text-(--ui-text-dimmed) ml-1">{{ pageLabel }}</span>
        <div class="ml-auto flex items-center gap-1">
          <UButton
            icon="i-lucide-zoom-out"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Zoom out"
            @click="emit('zoomOut')"
          />
          <UButton
            icon="i-lucide-zoom-in"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Zoom in"
            @click="emit('zoomIn')"
          />
          <UButton
            icon="i-lucide-maximize"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Fullscreen"
            @click="emit('fullscreen')"
          />
        </div>
      </div>
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Search text..."
        color="neutral"
        variant="outline"
        :ui="{ base: 'bg-black' }"
      />
    </div>

    <SearchResults
      :query="query"
      :loading="loading"
      :results="results"
      class="flex-1 overflow-y-auto min-h-0 px-3 py-2"
    >
      <template #result="{ result }">
        <div
          class="border-b border-(--ui-border) cursor-pointer hover:bg-(--ui-bg-elevated) px-3 py-2 -mx-3"
          @click="navigateTo(result)"
        >
          <div class="text-xs text-(--ui-text-dimmed) mb-0.5">
            <span class="font-medium">{{ paginationPrefix(paginationForPdfPage(paginationStarts, Number(result.pdfPage))) }} {{ result.folio }}</span>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <p class="text-sm font-serif leading-snug text-(--ui-text) pagefind-excerpt" v-html="result.excerpt" />
        </div>
      </template>
    </SearchResults>
  </div>
</template>
