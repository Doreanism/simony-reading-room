<script setup lang="ts">
import { searchPagefind, type PagefindSearchResult } from '~/composables/usePagefind'

const props = defineProps<{
  documentKey: string
  pageLabel: string
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

const results = ref<PagefindSearchResult[]>([])
const loading = ref(false)

let debounceTimer: ReturnType<typeof setTimeout>

async function search(val: string) {
  clearTimeout(debounceTimer)
  if (val.length < 2) {
    results.value = []
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    results.value = await searchPagefind(val, { documentKey: props.documentKey, limit: 200 })
    loading.value = false
  }, 300)
}

watch(query, search)

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

    <div class="flex-1 overflow-y-auto min-h-0">
      <p v-if="query.length > 0 && query.length < 2" class="px-3 py-2 text-sm text-(--ui-text-dimmed)">
        Type at least 2 characters
      </p>
      <p v-if="loading" class="px-3 py-2 text-sm text-(--ui-text-dimmed)">
        Searching...
      </p>
      <p v-else-if="query.length >= 2 && results.length === 0" class="px-3 py-2 text-sm text-(--ui-text-dimmed)">
        No results found
      </p>
      <ul v-else-if="results.length > 0">
        <li
          v-for="(result, i) in results"
          :key="i"
          class="border-b border-(--ui-border) cursor-pointer hover:bg-(--ui-bg-elevated) px-3 py-2"
          @click="navigateTo(result)"
        >
          <div class="text-xs text-(--ui-text-dimmed) mb-0.5">
            <span class="font-medium">fol. {{ result.folio }}</span>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <p class="text-sm font-serif leading-snug text-(--ui-text) pagefind-excerpt" v-html="result.excerpt" />
        </li>
      </ul>
    </div>
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
