<script setup lang="ts">
const { data: readings } = await useAsyncData('readings', () =>
  queryCollection('readingsMeta').all()
)

const { data: documents } = await useAsyncData('documents', () =>
  queryCollection('documentsMeta').all()
)

const { data: authors } = await useAsyncData('authors', () =>
  queryCollection('authors').all()
)

function authorName(slug: string) {
  const author = authors.value?.find((a) => a.key === slug)
  return author?.name_en ?? slug
}

function documentFor(key: string) {
  return documents.value?.find((s) => s.key === key)
}

const sortedReadings = computed(() => {
  if (!readings.value || !documents.value) return []
  return [...readings.value].sort((a, b) => {
    const yearA = documentFor(a.document)?.year ?? 0
    const yearB = documentFor(b.document)?.year ?? 0
    return yearA - yearB
  })
})
</script>

<template>
  <AppPage>
  <Head><title>Readings</title></Head>
  <div class="space-y-3">
    <h1 class="text-2xl font-serif font-bold mb-6">Readings</h1>
    <ListItemCard
      v-for="reading in sortedReadings"
      :key="reading.key"
      :to="`/readings/${reading.key}`"
      :title="reading.title_en"
      :subtitle="reading.title"
      :description="reading.description"
    >
      <template #meta>
        <span>{{ authorName(reading.author) }}</span>
        <span>&middot;</span>
        <span v-if="documentFor(reading.document)?.year">{{ documentFor(reading.document)!.year }}</span>
        <span v-if="documentFor(reading.document)?.year">&middot;</span>
        <span>{{ reading.section }}</span>
        <span>&middot;</span>
        <span>fol. {{ reading.page_start }}&ndash;{{ reading.page_end }}</span>
      </template>
    </ListItemCard>
  </div>
  </AppPage>
</template>
