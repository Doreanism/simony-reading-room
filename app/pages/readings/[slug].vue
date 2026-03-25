<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

const validViews = ['transcription', 'translation'] as const
const queryView = route.query.view as string
const currentView = ref<'transcription' | 'translation'>(
  validViews.includes(queryView as any) ? (queryView as 'transcription' | 'translation') : 'translation'
)

watch(currentView, (view) => {
  navigateTo({
    path: `/readings/${slug}`,
    query: view === 'translation' ? {} : { view },
  }, { replace: true })
})

const tabs = [
  { label: 'Transcription', value: 'transcription' as const },
  { label: 'Translation', value: 'translation' as const },
]

const { data: reading } = await useAsyncData(`reading-${slug}`, () =>
  queryCollection('readingsMeta').where('key', '=', slug).first()
)

const { data: authors } = await useAsyncData('authors', () =>
  queryCollection('authors').all()
)

const { data: documentMeta } = await useAsyncData(`doc-${slug}`, async () => {
  const r = await queryCollection('readingsMeta').where('key', '=', slug).first()
  if (!r) return null
  return queryCollection('documentsMeta').where('key', '=', r.document).first()
})

const authorName = computed(() => {
  if (!reading.value) return ''
  const author = authors.value?.find((a) => a.key === reading.value!.author)
  return author?.name_en ?? reading.value.author
})
</script>

<template>
  <AppPage>
  <Head v-if="reading"><title>{{ reading.title_en }}</title></Head>
  <div v-if="reading">
    <h1 class="text-2xl font-serif font-bold">
      {{ reading.title_en }}
    </h1>
    <p class="mt-1 text-base text-neutral-500 italic font-serif">
      {{ reading.title }}
    </p>
    <div class="mt-2 flex flex-wrap gap-4 text-sm text-neutral-600">
      <NuxtLink :to="`/authors/${reading.author}`" class="text-primary hover:underline">{{ authorName }}</NuxtLink>
      <span>&middot;</span>
      <span>{{ reading.section }}</span>
      <span>&middot;</span>
      <span>fol. {{ reading.page_start }}&ndash;{{ reading.page_end }}</span>
      <NuxtLink
        v-if="documentMeta"
        :to="`/documents/${documentMeta.key}`"
        class="text-primary hover:underline"
      >
        {{ documentMeta.title_en }}
      </NuxtLink>
    </div>

    <!-- View tabs -->
    <UTabs
      :items="tabs"
      class="mt-6"
      @update:model-value="(v: string) => currentView = v as typeof currentView"
      :default-value="currentView"
    />

    <!-- Transcription view -->
    <div v-show="currentView === 'transcription'" class="mt-6">
      <ReadingText collection="readingsTranscription" :slug="slug" />
    </div>

    <!-- Translation view -->
    <div v-show="currentView === 'translation'" class="mt-6">
      <ReadingText collection="readingsTranslation" :slug="slug" />
    </div>
  </div>
  </AppPage>
</template>
