<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const { data: author } = await useAsyncData(`author-${slug}`, () =>
  queryCollection('authors').where('key', '=', slug).first()
)

useHead({ title: () => author.value?.name_en })

const { data: documents } = await useAsyncData('documents', () =>
  queryCollection('documentsMeta').all()
)

const { data: readings } = await useAsyncData('readings', () =>
  queryCollection('readingsMeta').all()
)

const authorDocuments = computed(() => {
  if (!documents.value) return []
  return documents.value
    .filter((s) => s.author === slug)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
})

const authorReadings = computed(() => {
  if (!readings.value) return []
  return readings.value.filter((r) => r.author === slug)
})

function readingsForDocument(documentKey: string) {
  return authorReadings.value.filter((r) => r.document === documentKey)
}
</script>

<template>
  <AppPage>
  <div v-if="author">
    <div class="flex gap-6">
      <img
        v-if="author.image"
        :src="author.image"
        :alt="author.name_en"
        class="w-32 h-32 rounded-full object-cover shrink-0"
      />
      <div>
        <h1 class="text-2xl font-serif font-bold">
          {{ author.name_en }}
        </h1>
        <p class="mt-1 text-base text-neutral-500 italic font-serif">
          {{ author.name }}
        </p>
        <div v-if="author.born || author.died" class="mt-1 text-sm text-neutral-600">
          {{ author.born }}&ndash;{{ author.died }}
        </div>
        <a
          v-if="author.wikipedia"
          :href="author.wikipedia"
          target="_blank"
          class="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <UIcon name="i-lucide-external-link" /> Wikipedia
        </a>
      </div>
    </div>

    <div class="mt-6 prose prose-stone max-w-prose mx-auto font-serif text-justify">
      <ContentRenderer :value="author" />
    </div>

    <div v-for="doc in authorDocuments" :key="doc.key" class="mt-10">
      <ListItemCard
        :to="`/documents/${doc.key}`"
        :title="doc.title_en"
        :subtitle="doc.title"
        :image="doc.cover || `/d/${doc.key}/cover.jpg`"
      >
        <template #meta>
          <span v-if="doc.year">{{ doc.year }}</span>
          <span v-if="doc.year">&middot;</span>
          <span>{{ doc.pages }} pages</span>
        </template>
      </ListItemCard>

      <div class="mt-4 space-y-3">
        <ListItemCard
          v-for="reading in readingsForDocument(doc.key)"
          :key="reading.key"
          :to="`/readings/${reading.key}`"
          :title="reading.title_en"
          :subtitle="reading.title"
          :description="reading.description"
        >
          <template #meta>
            <span>{{ reading.section }}</span>
            <span>&middot;</span>
            <span>fol. {{ reading.page_start }}&ndash;{{ reading.page_end }}</span>
          </template>
        </ListItemCard>
      </div>
    </div>
  </div>
  </AppPage>
</template>
