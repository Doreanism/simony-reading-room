<script setup lang="ts">
useHead({ title: 'Readings' })

const { data: readings } = await useAsyncData('readings', () =>
  queryCollection('readingsMeta').all()
)

const { data: documents } = await useAsyncData('documents', () =>
  queryCollection('documentsMeta').all()
)

function doc(docKey: string) {
  return documents.value?.find((d) => d.key === docKey)
}

const { authors, authorName } = useAuthors()

function authorImage(slug: string) {
  return authors.value?.find((a) => a.key === slug)?.image ?? '/a/anonymous.jpg'
}

const sortedReadings = computed(() => sortByYear(readings.value ?? []))
</script>

<template>
  <AppPage>
  <div class="space-y-3">
    <h1 class="text-2xl font-serif font-bold mb-6">Readings</h1>
    <ListItemCard
      v-for="reading in sortedReadings"
      :key="reading.key"
      :to="`/readings/${reading.key}`"
      :title="reading.title_en"
      :subtitle="reading.title !== reading.title_en ? reading.title : undefined"
      :description="reading.description"
      :image="doc(reading.document)?.cover"
    >
      <template #meta>
        <AuthorBadge :name="authorName(reading.author)" :image="authorImage(reading.author)" />
        <span>&middot;</span>
        <span v-if="reading.year">{{ reading.year }}</span>
        <span v-if="reading.year">&middot;</span>
        <span v-if="languageLabel(doc(reading.document)?.language)">{{ languageLabel(doc(reading.document)?.language) }}</span>
        <span v-if="languageLabel(doc(reading.document)?.language)">&middot;</span>
        <span>{{ reading.section }}</span>
        <span>&middot;</span>
        <span>{{ folioLabel(doc(reading.document)?.pagination, reading.page_start, reading.page_end) }}</span>
      </template>
    </ListItemCard>
  </div>
  </AppPage>
</template>
