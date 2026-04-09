<script setup lang="ts">
interface AlignedLine {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

interface PageData {
  pdf_page: number
  folio: string
  page_width: number
  page_height: number
  image_width: number
  image_height: number
  lines?: AlignedLine[]
  // Legacy format with pre-split columns
  columns?: {
    a: AlignedLine[]
    b: AlignedLine[]
  }
}

const props = defineProps<{
  documentKey: string
  page: number
  highlight?: string
}>()

const pageData = ref<PageData | null>(null)
const jsonCache = inject<Map<string, any>>('pageJsonCache', null)

onMounted(async () => {
  const key = `/d/${props.documentKey}/${props.page}.json`
  const cached = jsonCache?.get(key)
  if (cached) {
    pageData.value = cached
    return
  }
  try {
    const data = await $fetch<PageData>(key)
    pageData.value = data
    jsonCache?.set(key, data)
  } catch {
    // No JSON for this page
  }
})

const allLines = computed(() => {
  if (!pageData.value) return []
  if (pageData.value.lines) return pageData.value.lines
  if (pageData.value.columns) {
    return [...pageData.value.columns.a, ...pageData.value.columns.b]
  }
  return []
})

import { normalizeSearch } from '~~/utils/normalize-search'

const highlights = computed(() => {
  if (!props.highlight || props.highlight.length < 2 || !pageData.value) return []
  const q = normalizeSearch(props.highlight)
  const rects: { x: number; y: number; w: number; h: number }[] = []

  for (const line of allLines.value) {
    const text = normalizeSearch(line.text)
    const lineW = line.x1 - line.x0
    let idx = text.indexOf(q)
    while (idx >= 0) {
      rects.push({
        x: line.x0 + (idx / line.text.length) * lineW,
        y: line.y0,
        w: (q.length / line.text.length) * lineW,
        h: line.y1 - line.y0,
      })
      idx = text.indexOf(q, idx + 1)
    }
  }

  return rects
})
</script>

<template>
  <div class="page-image">
    <img
      :src="`/d/${documentKey}/${page}.webp`"
      :alt="`Page ${page}`"
      :width="pageData?.image_width ?? 1700"
      :height="pageData?.image_height ?? 2362"
    />
    <div
      v-if="pageData"
      class="overlay"
    >
      <!-- Invisible text for Ctrl+F -->
      <span
        v-for="(line, i) in allLines"
        :key="i"
        class="absolute whitespace-pre text-transparent select-text"
        :style="{
          left: `${line.x0 * 100}%`,
          top: `${line.y0 * 100}%`,
          width: `${(line.x1 - line.x0) * 100}%`,
          height: `${(line.y1 - line.y0) * 100}%`,
          fontSize: `${(line.y1 - line.y0) * 100 * 0.8}cqh`,
          lineHeight: '1',
        }"
      >{{ normalizeSearch(line.text) }}</span>
      <!-- Search match highlights -->
      <div
        v-for="(hl, j) in highlights"
        :key="`hl-${j}`"
        class="absolute bg-primary/20 border border-primary/80 rounded-sm pointer-events-none"
        :style="{
          left: `${hl.x * 100}%`,
          top: `${hl.y * 100}%`,
          width: `${hl.w * 100}%`,
          height: `${hl.h * 100}%`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.page-image {
  position: relative;
  max-height: var(--viewer-h, 100vh);
  max-width: 100%;
  width: fit-content;
  height: fit-content;
}

.page-image img {
  display: block;
  max-height: var(--viewer-h, 100vh);
  max-width: 100%;
  height: auto;
  width: auto;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

span::selection {
  background: rgba(59, 130, 246, 0.3);
  color: transparent;
}
</style>
