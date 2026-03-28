<script setup lang="ts">
const { data: readings } = await useAsyncData('readings', () =>
  queryCollection('readingsMeta').all()
)

const { data: authors } = await useAsyncData('authors', () =>
  queryCollection('authors').all()
)

function authorName(slug: string) {
  const author = authors.value?.find((a) => a.key === slug)
  return author?.name_en ?? slug
}

const sortedReadings = computed(() => {
  if (!readings.value) return []
  return [...readings.value].sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
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
        <span v-if="reading.year">{{ reading.year }}</span>
        <span v-if="reading.year">&middot;</span>
        <span>{{ reading.section }}</span>
        <span>&middot;</span>
        <span>fol. {{ reading.page_start }}&ndash;{{ reading.page_end }}</span>
      </template>
    </ListItemCard>
  </div>
  </AppPage>
</template>
