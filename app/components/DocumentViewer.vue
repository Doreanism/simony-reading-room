<script setup lang="ts">
const route = useRoute()

const props = defineProps<{
  doc: {
    key: string
    pagination_starts?: any[]
    pages: number
  }
}>()

const { pdfToLabel, labelToPdf } = createPaginationMap(
  props.doc.pagination_starts,
  props.doc.pages,
)

const direction = ref<'forward' | 'back'>('forward')
const searchOpen = ref(false)
const searchQuery = ref((route.query.q as string) || '')
const zoom = ref(1)
const scrollContainer = ref<HTMLElement>()

function zoomKeepCenter(newZoom: number) {
  const el = scrollContainer.value
  const oldZoom = zoom.value

  let centerX = 0.5
  let centerY = 0.5
  if (el && oldZoom > 1) {
    centerX = (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth
    centerY = (el.scrollTop + el.clientHeight / 2) / el.scrollHeight
  }

  zoom.value = newZoom

  if (newZoom > 1) {
    nextTick(() => {
      if (!el) return
      el.scrollLeft = centerX * el.scrollWidth - el.clientWidth / 2
      el.scrollTop = centerY * el.scrollHeight - el.clientHeight / 2
    })
  }
}

function zoomIn() {
  zoomKeepCenter(Math.min(zoom.value + 0.25, 3))
}

function zoomOut() {
  zoomKeepCenter(Math.max(zoom.value - 0.25, 0.5))
}

// Sync search query to ?q= param
watch(searchQuery, () => updateUrl())

const pagePairs = computed(() => {
  const pairs: (number | null)[][] = []
  // First page alone on the right
  pairs.push([null, 1])
  // Remaining pages in pairs
  for (let i = 2; i <= props.doc.pages; i += 2) {
    const pair: (number | null)[] = [i]
    if (i + 1 <= props.doc.pages) pair.push(i + 1)
    pairs.push(pair)
  }
  return pairs
})

const currentPair = computed(() => pagePairs.value[currentSpread.value] ?? [])

// Image & JSON preloading
const loadedImages = new Set<string>()
const jsonCache = new Map<string, any>()
provide('pageJsonCache', jsonCache)

function preloadImage(page: number): Promise<void> {
  const src = `/d/${props.doc.key}/${page}.webp`
  if (loadedImages.has(src)) return Promise.resolve()
  if (!import.meta.client) return Promise.resolve()
  const img = new window.Image()
  img.src = src
  return img.decode().then(
    () => { loadedImages.add(src) },
    () => {},
  )
}

function preloadJson(page: number): Promise<void> {
  const key = `/d/${props.doc.key}/${page}.json`
  if (jsonCache.has(key)) return Promise.resolve()
  return $fetch(key).then(
    (data) => { jsonCache.set(key, data) },
    () => {},
  )
}

function preloadSpread(spreadIdx: number): Promise<void> {
  const pair = pagePairs.value[spreadIdx]
  if (!pair) return Promise.resolve()
  const pages = pair.filter((p): p is number => p !== null)
  return Promise.all([
    ...pages.map(preloadImage),
    ...pages.map(preloadJson),
  ]).then(() => {})
}

// Find spread index containing a given page number
function spreadForPage(page: number): number {
  return pagePairs.value.findIndex((pair) => pair.includes(page))
}

// Resolve a URL label to a PDF page, stripping column suffixes (a/b) if needed
function resolveLabelToPdf(label: string): number | null {
  const direct = labelToPdf.get(label)
  if (direct != null) return direct
  // Strip column suffix: "145ra" -> "145r", "2.42b" -> "2.42"
  const stripped = label.replace(/([rv\d])[ab]$/, '$1')
  if (stripped !== label) {
    const found = labelToPdf.get(stripped)
    if (found != null) return found
  }
  // Bare number: treat as PDF page (matches "p{N}" labels without the prefix)
  const num = Number(label)
  if (num) return labelToPdf.get(`p${num}`) ?? num
  return null
}

// Initialize spread from route param (which is now a printed page label)
const initialPageParam = route.params.page as string | undefined
const initialPdfPage = initialPageParam ? resolveLabelToPdf(initialPageParam) : null
const currentSpread = ref(
  initialPdfPage ? Math.max(0, spreadForPage(initialPdfPage)) : 0,
)

// Preload adjacent spreads
watch(currentSpread, (idx) => {
  if (idx > 0) preloadSpread(idx - 1)
  if (idx < pagePairs.value.length - 1) preloadSpread(idx + 1)
}, { immediate: true })

// Update URL without triggering navigation
function updateUrl() {
  const page = currentPair.value.find((p): p is number => p !== null)
  if (page != null) {
    const label = pdfToLabel.get(page) ?? String(page)
    const query = searchQuery.value
      ? `?q=${encodeURIComponent(searchQuery.value)}`
      : ''
    window.history.replaceState(null, '', `/documents/${props.doc.key}/${label}${query}`)
  }
}

function hasTextSelection() {
  const sel = window.getSelection()
  return sel && sel.toString().length > 0
}

const navigating = ref(false)

async function navigate(targetIdx: number, dir: 'forward' | 'back') {
  if (navigating.value) return
  navigating.value = true
  try {
    await preloadSpread(targetIdx)
    direction.value = dir
    currentSpread.value = targetIdx
    updateUrl()
  } finally {
    navigating.value = false
  }
}

function prev() {
  if (hasTextSelection()) return
  if (currentSpread.value > 0) {
    navigate(currentSpread.value - 1, 'back')
  }
}

function next() {
  if (hasTextSelection()) return
  if (currentSpread.value < pagePairs.value.length - 1) {
    navigate(currentSpread.value + 1, 'forward')
  }
}

const pageLabel = computed(() => {
  const left = currentPair.value[0]
  const right = currentPair.value[1]
  const label = left
    ? right
      ? `${left}\u2013${right}`
      : String(left)
    : right ? String(right) : ''
  return `p. ${label} of ${props.doc.pages}`
})

const viewerEl = ref<HTMLElement>()
const isFullscreen = ref(false)

function toggleFullscreen() {
  if (!viewerEl.value) return
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    viewerEl.value.requestFullscreen()
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
})

function onSliderChange(value: number) {
  const dir = value > currentSpread.value ? 'forward' : 'back'
  navigate(value, dir)
}

function goToPage(pdfPage: number) {
  const idx = spreadForPage(pdfPage)
  if (idx >= 0) {
    searchOpen.value = false
    const dir: 'forward' | 'back' =
      pdfPage > (currentPair.value[0] ?? 0) ? 'forward' : 'back'
    navigate(idx, dir)
  }
}
</script>

<template>
  <div ref="viewerEl" class="dark flex flex-col bg-black" :style="{ height: isFullscreen ? '100vh' : 'calc(100vh - 3rem)' }">
    <div class="flex flex-1 min-h-0" :style="{ '--viewer-h': isFullscreen ? 'calc(100vh - 2.5rem)' : 'calc(100vh - 5.5rem)' }">
      <!-- Main viewer area -->
      <div class="flex-1 min-w-0 relative">
        <UButton
          icon="i-lucide-search"
          variant="ghost"
          color="neutral"
          class="lg:hidden absolute top-2 right-2 z-10"
          aria-label="Search"
          @click="searchOpen = true"
        />
        <div
          ref="scrollContainer"
          class="book-container flex px-4 h-full"
          :class="zoom > 1 ? 'overflow-auto items-start justify-start' : 'overflow-hidden items-center justify-center'"
        >
          <div
            :style="zoom > 1 ? { width: `${zoom * 100}%`, height: `${zoom * 100}%`, flexShrink: 0 } : {}"
            :class="zoom <= 1 ? 'h-full flex items-center justify-center max-w-full' : ''"
          >
            <div class="grid grid-cols-2 max-w-full origin-top-left" :class="zoom <= 1 ? 'h-full grid-rows-[minmax(0,1fr)]' : ''" :style="zoom > 1 ? { transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: `${100 / zoom}%` } : {}">
              <!-- Left page -->
              <div
                class="page-slot overflow-hidden h-full"
                :class="{ 'cursor-pointer': currentPair[0] }"
                @click="prev"
              >
                <Transition
                  :name="
                    direction === 'forward'
                      ? 'flip-left-forward'
                      : 'flip-left-back'
                  "
                >
                  <PageImage
                    v-if="currentPair[0]"
                    :key="currentPair[0]"
                    :document-key="doc.key"
                    :page="currentPair[0]"
                    :highlight="searchQuery"
                    class="justify-self-end"
                  />
                  <div v-else class="h-full" />
                </Transition>
              </div>
              <!-- Right page -->
              <div
                class="page-slot overflow-hidden h-full"
                :class="{ 'cursor-pointer': currentPair[1] }"
                @click="next"
              >
                <Transition
                  :name="
                    direction === 'forward'
                      ? 'flip-right-forward'
                      : 'flip-right-back'
                  "
                >
                  <PageImage
                    v-if="currentPair[1]"
                    :key="currentPair[1]"
                    :document-key="doc.key"
                    :page="currentPair[1]"
                    :highlight="searchQuery"
                    class="justify-self-start"
                  />
                  <div v-else class="h-full" />
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Search sidebar (desktop) -->
      <aside class="hidden lg:flex flex-col w-80 shrink-0 h-full">
        <DocumentSearch
          v-model="searchQuery"
          :document-key="doc.key"
          :page-label="pageLabel"
          :pagination-starts="doc.pagination_starts"
          :pdf-to-label="pdfToLabel"
          :can-prev="currentSpread > 0"
          :can-next="currentSpread < pagePairs.length - 1"
          @navigate="goToPage"
          @prev="prev"
          @next="next"
          @fullscreen="toggleFullscreen"
          @zoom-in="zoomIn"
          @zoom-out="zoomOut"
        />
      </aside>
    </div>

    <!-- Navigation slider -->
    <DocumentSlider
      :model-value="currentSpread"
      :max="pagePairs.length - 1"
      :page-pairs="pagePairs"
      :document-key="doc.key"
      :pagination-starts="doc.pagination_starts"
      :pdf-to-label="pdfToLabel"
      @update:model-value="onSliderChange"
    />
  </div>

  <!-- Mobile search slideover -->
  <USlideover
    v-model:open="searchOpen"
    side="right"
    title="Search"
    class="lg:hidden"
  >
    <template #body>
      <DocumentSearch
        v-model="searchQuery"
        :document-key="doc.key"
        :page-label="pageLabel"
        :pagination-starts="doc.pagination_starts"
        :can-prev="currentSpread > 0"
        :can-next="currentSpread < pagePairs.length - 1"
        @navigate="goToPage"
        @prev="prev"
        @next="next"
        @fullscreen="toggleFullscreen"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
      />
    </template>
  </USlideover>
</template>

<style scoped>
.book-container {
  perspective: 1800px;
}

.page-slot {
  position: relative;
  display: grid;
  align-items: center;
}

.page-slot > * {
  grid-area: 1 / 1;
  will-change: transform;
}

@keyframes flip-in-from-right {
  from { transform: rotateY(-90deg); }
  to { transform: rotateY(0); }
}

@keyframes flip-in-from-left {
  from { transform: rotateY(90deg); }
  to { transform: rotateY(0); }
}

/* Forward right: old page flips away over spine, new page visible immediately underneath */
.flip-right-forward-leave-active {
  z-index: 10;
  transform-origin: left center;
  transition: transform 0.4s ease-in;
  backface-visibility: hidden;
}
.flip-right-forward-leave-to {
  transform: rotateY(-90deg);
}

/* Forward left: old stays visible until flip-in completes, new flips in from spine after delay */
.flip-left-forward-leave-active {
  transition: opacity 0.01s 0.8s;
}
.flip-left-forward-leave-to {
  opacity: 0;
}
.flip-left-forward-enter-active {
  z-index: 10;
  transform-origin: right center;
  animation: flip-in-from-right 0.4s ease-out 0.4s both;
  backface-visibility: hidden;
}

/* Back left: old page flips away over spine, new page visible immediately underneath */
.flip-left-back-leave-active {
  z-index: 10;
  transform-origin: right center;
  transition: transform 0.4s ease-in;
  backface-visibility: hidden;
}
.flip-left-back-leave-to {
  transform: rotateY(90deg);
}

/* Back right: old stays visible until flip-in completes, new flips in from spine after delay */
.flip-right-back-leave-active {
  transition: opacity 0.01s 0.8s;
}
.flip-right-back-leave-to {
  opacity: 0;
}
.flip-right-back-enter-active {
  z-index: 10;
  transform-origin: left center;
  animation: flip-in-from-left 0.4s ease-out 0.4s both;
  backface-visibility: hidden;
}
</style>
