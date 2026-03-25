<script setup lang="ts">
const props = defineProps<{
  collection: 'readingsTranscription' | 'readingsTranslation'
  slug: string
}>()

const { data: content } = await useAsyncData(
  `${props.collection}-${props.slug}`,
  () => queryCollection(props.collection).where('key', '=', props.slug).first()
)

const articleRef = ref<HTMLElement | null>(null)

onMounted(() => {
  styleFolioLinks()
})

watch(content, () => {
  nextTick(styleFolioLinks)
})

function styleFolioLinks() {
  if (!articleRef.value) return
  const paragraphs = articleRef.value.querySelectorAll('p')
  for (const p of paragraphs) {
    const link = p.querySelector('a')
    if (!link || p.childNodes.length !== 1) continue
    if (!link.getAttribute('href')?.startsWith('/documents/')) continue
    link.className = 'folio-marker'
    const folioRef = link.textContent?.trim()
    if (folioRef) link.id = `p${folioRef}`
    p.replaceWith(link)
  }
}
</script>

<template>
  <article
    v-if="content"
    ref="articleRef"
    class="prose prose-stone prose-lg max-w-prose mx-auto font-serif leading-relaxed text-justify"
  >
    <ContentRenderer :value="content" />
  </article>
</template>
