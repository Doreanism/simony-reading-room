<script setup lang="ts">
const props = defineProps<{
  modelValue: number
  max: number
  pagePairs: (number | null)[][]
  documentKey: string
  pagination?: string | null
}>()

const emit = defineEmits<{
  "update:modelValue": [value: number]
}>()

// Local drag value updates freely while dragging; emit only on pointer release
const dragValue = ref(props.modelValue)
watch(() => props.modelValue, (v) => { dragValue.value = v })

const isDragging = ref(false)

function onPointerDown() {
  isDragging.value = true
}

function onPointerUp() {
  if (isDragging.value) {
    isDragging.value = false
    emit("update:modelValue", dragValue.value)
  }
}

const sliderTrackEl = ref<HTMLElement>()
const hoverSpread = ref<number | null>(null)
const hoverOffsetX = ref(0)

function offsetForSpread(spread: number): number {
  if (!sliderTrackEl.value) return 0
  return (spread / props.max) * sliderTrackEl.value.getBoundingClientRect().width
}

// While dragging, keep tooltip in sync with the thumb via dragValue
watch(dragValue, (v) => {
  if (!isDragging.value) return
  hoverSpread.value = v
  hoverOffsetX.value = offsetForSpread(v)
})

function onSliderMouseMove(e: MouseEvent) {
  if (isDragging.value || !sliderTrackEl.value) return
  const rect = sliderTrackEl.value.getBoundingClientRect()
  const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  hoverSpread.value = Math.round(fraction * props.max)
  hoverOffsetX.value = e.clientX - rect.left
}

function onSliderMouseLeave() {
  if (!isDragging.value) hoverSpread.value = null
}

// Folio lookup cache: pdf page → folio string (e.g. "145v")
const folioCache = new Map<number, string | null>()

async function getPageFolio(page: number): Promise<string | null> {
  if (folioCache.has(page)) return folioCache.get(page)!
  try {
    const data = await $fetch<{ folio?: string }>(`/d/${props.documentKey}/${page}.json`)
    const folio = data.folio ?? null
    folioCache.set(page, folio)
    return folio
  } catch {
    folioCache.set(page, null)
    return null
  }
}

const hoverFolios = ref<(string | null)[]>([])

watch(hoverSpread, async (spread) => {
  if (spread === null) { hoverFolios.value = []; return }
  const pair = props.pagePairs[spread]
  if (!pair) return
  const pages = pair.filter((p): p is number => p !== null)
  const folios = await Promise.all(pages.map(getPageFolio))
  if (hoverSpread.value === spread) hoverFolios.value = folios
})

const hoverLabel = computed(() => {
  if (hoverSpread.value === null) return ""
  const pair = props.pagePairs[hoverSpread.value]
  if (!pair) return ""
  const pages = pair.filter((p): p is number => p !== null)
  const folios = hoverFolios.value.filter((f): f is string => f !== null)
  if (folios.length === pages.length) {
    const prefix = props.pagination === "page" || props.pagination === "page-two-column" ? "p." : "fol."
    return `${prefix} ${folios.join("\u2013")}`
  }
  return pages.join("\u2013")
})
</script>

<template>
  <div class="px-6 py-3">
    <div
      ref="sliderTrackEl"
      class="relative"
      @mousemove="onSliderMouseMove"
      @mouseleave="onSliderMouseLeave"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
    >
      <div
        v-if="hoverSpread !== null"
        class="absolute bottom-full mb-2 -translate-x-1/2 bg-white text-black text-xs px-2 py-0.5 rounded pointer-events-none whitespace-nowrap"
        :style="{ left: `${hoverOffsetX}px` }"
      >
        {{ hoverLabel }}
      </div>
      <USlider
        v-model="dragValue"
        :min="0"
        :max="max"
        :step="1"
      />
    </div>
  </div>
</template>
