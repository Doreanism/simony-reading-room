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

const tabs = computed(() => [
  { label: sourceLanguageLabel.value, value: 'transcription' as const },
  { label: translationLanguageLabel.value, value: 'translation' as const },
])

const { data: reading } = await useAsyncData(`reading-${slug}`, () =>
  queryCollection('readingsMeta').where('key', '=', slug).first()
)

useHead({ title: () => reading.value?.title_en })

const { data: authors } = await useAsyncData('authors', () =>
  queryCollection('authors').all()
)

const { data: documentMeta } = await useAsyncData(`doc-${slug}`, async () => {
  const r = await queryCollection('readingsMeta').where('key', '=', slug).first()
  if (!r) return null
  return queryCollection('documentsMeta').where('key', '=', r.document).first()
})

const { data: transcriptionColumns } = await useAsyncData(
  `transcription-cols-${slug}`,
  () => queryCollection('readingsTranscription')
    .where('reading', '=', slug)
    .order('sortable_pagination_id', 'ASC')
    .all()
)

const { data: translationColumns } = await useAsyncData(
  `translation-cols-${slug}`,
  () => queryCollection('readingsTranslation')
    .where('reading', '=', slug)
    .order('sortable_pagination_id', 'ASC')
    .all()
)

function wrapBody(nodes: any[]) {
  return { body: { type: 'minimark', value: nodes } }
}

interface Section {
  nodes: any[]
  headingId: string | null
  gridRow: number
}

interface FolioData {
  page: string
  pdfPage: number
  dividerRow: number
  transcriptionSections: Section[]
  translationSections: Section[]
}

const folios = computed<FolioData[]>(() => {
  if (!transcriptionColumns.value) return []
  const transMap = new Map(
    (translationColumns.value ?? []).map((c: any) => [c.page, c])
  )

  let row = 1
  return transcriptionColumns.value.map((tc: any) => {
    const tl = transMap.get(tc.page)
    const dividerRow = row++

    const transNodes: any[] = tc.body?.value ?? []
    const translNodes: any[] = tl?.body?.value ?? []

    let headingCount = 0
    const sectionCount = Math.max(transNodes.length, translNodes.length)
    const transcriptionSections: Section[] = []
    const translationSections: Section[] = []

    for (let i = 0; i < sectionCount; i++) {
      const gridRow = row++
      const tag = Array.isArray(transNodes[i]) ? transNodes[i][0] : transNodes[i]?.tag
      const isHeading = tag && /^h[1-6]$/.test(tag)
      if (isHeading) headingCount++

      const transId = isHeading ? `${tc.page}-s${headingCount}` : null
      const translId = isHeading ? `${tc.page}-l${headingCount}` : null

      if (transNodes[i]) {
        const node = transId && Array.isArray(transNodes[i])
          ? [transNodes[i][0], { ...transNodes[i][1], id: transId }, ...transNodes[i].slice(2)]
          : transNodes[i]
        transcriptionSections.push({ nodes: [node], headingId: transId, gridRow })
      }
      if (translNodes[i]) {
        const node = translId && Array.isArray(translNodes[i])
          ? [translNodes[i][0], { ...translNodes[i][1], id: translId }, ...translNodes[i].slice(2)]
          : translNodes[i]
        translationSections.push({ nodes: [node], headingId: translId, gridRow })
      }
    }

    return { page: tc.page, pdfPage: tc.pdf_page, dividerRow, transcriptionSections, translationSections }
  })
})

const author = computed(() => {
  if (!reading.value) return null
  return authors.value?.find((a) => a.key === reading.value!.author) ?? null
})

const authorName = computed(() => {
  if (reading.value?.author === 'anonymous') return 'Anonymous'
  return author.value?.name_en ?? (reading.value?.author || 'Anonymous')
})

const coverImage = computed(() => {
  if (!documentMeta.value) return null
  return documentMeta.value.cover || `/d/${documentMeta.value.key}/cover.jpg`
})

const sourceLanguageLabel = computed(() => languageLabel(documentMeta.value?.language) || 'Original')

const translationLanguageLabel = computed(() => {
  return documentMeta.value?.language === 'early-english' ? 'Modern English' : 'English'
})

</script>

<template>
  <AppPage full>
  <div v-if="reading">
    <div class="max-w-3xl mx-auto">
      <div class="flex gap-5 justify-center">
        <NuxtLink v-if="coverImage" :to="`/documents/${reading.document}`" class="shrink-0">
          <img
            :src="coverImage"
            :alt="documentMeta?.title_en"
            class="w-24 rounded shadow-md"
          />
        </NuxtLink>
        <div>
          <h1 class="text-2xl font-serif font-bold">
            {{ reading.title_en }}
          </h1>
          <p v-if="reading.title !== reading.title_en" class="mt-1 text-base text-neutral-500 italic font-serif">
            {{ reading.title }}
          </p>
          <div class="mt-2 flex flex-wrap gap-4 text-sm text-neutral-600">
            <span>{{ reading.section }}</span>
            <span>&middot;</span>
            <span>{{ folioLabel(documentMeta?.pagination, reading.page_start, reading.page_end) }}</span>
          </div>
          <NuxtLink
            v-if="documentMeta"
            :to="`/documents/${documentMeta.key}`"
            class="mt-1 block text-sm text-primary hover:underline"
          >
            {{ documentMeta.title_en }}
          </NuxtLink>
          <NuxtLink v-if="author?.image" :to="`/authors/${reading.author}`" class="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <img
              :src="author.image"
              :alt="authorName"
              class="w-8 h-8 rounded-full object-cover"
            />
            <span>{{ authorName }}</span>
          </NuxtLink>
          <span v-else-if="reading.author === 'anonymous'" class="mt-3 inline-flex items-center gap-2 text-sm text-neutral-500">
            <img
              src="/a/anonymous.jpg"
              alt="Anonymous"
              class="w-8 h-8 rounded-full object-cover"
            />
            <span>Anonymous</span>
          </span>
          <span v-else class="mt-3 block text-sm text-neutral-500">{{ authorName }}</span>
        </div>
      </div>

      <!-- View tabs (small screens only) -->
      <UTabs
        :items="tabs"
        class="mt-6 xl:hidden"
        @update:model-value="(v: string) => currentView = v as typeof currentView"
        :default-value="currentView"
      />
    </div>

    <!-- Column headers (desktop only) -->
    <div class="hidden xl:grid xl:grid-cols-2 gap-x-8 max-w-6xl mx-auto mt-6 mb-2">
      <div class="text-xs font-semibold uppercase tracking-wider text-neutral-400 text-center">{{ sourceLanguageLabel }}</div>
      <div class="text-xs font-semibold uppercase tracking-wider text-neutral-400 text-center">{{ translationLanguageLabel }}</div>
    </div>

    <!-- Side-by-side content: two DOM subtrees with display:contents for grid alignment -->
    <div class="reading-content max-w-6xl mx-auto xl:grid xl:grid-cols-2 gap-x-8" :data-view="currentView">
      <!-- Transcription column (display:contents so children join parent grid) -->
      <div class="reading-col reading-col-transcription xl:contents">
        <template v-for="folio in folios" :key="folio.page">
          <div
            :id="folio.page"
            class="flex items-center gap-3 my-6"
            :style="{ gridRow: folio.dividerRow, gridColumn: '1 / -1' }"
          >
            <div class="flex-1 border-t border-neutral-300" />
            <span class="folio-marker !m-0 !border-0 !p-0 flex items-center gap-1">
              <NuxtLink :to="`#${folio.page}`" class="text-neutral-400">#</NuxtLink>
              <NuxtLink
                :to="`/documents/${reading.document}/${folio.pdfPage}`"
                class="hover:underline"
              >{{ folio.page }}</NuxtLink>
            </span>
            <div class="flex-1 border-t border-neutral-300" />
          </div>
          <div
            v-for="section in folio.transcriptionSections"
            :key="section.gridRow"
            :id="section.headingId ?? undefined"
            class="prose prose-stone prose-lg max-w-prose xl:w-[65ch] font-serif leading-relaxed text-justify mx-auto xl:mx-0 xl:ml-auto"
            :lang="documentMeta?.language === 'latin' ? 'la' : undefined"
            :style="{ gridRow: section.gridRow, gridColumn: 1 }"
          >
            <ContentRenderer :value="wrapBody(section.nodes)" />
          </div>
        </template>
      </div>
      <!-- Translation column -->
      <div class="reading-col reading-col-translation xl:contents">
        <template v-for="folio in folios" :key="folio.page">
          <!-- Mobile-only folio divider -->
          <div class="flex items-center gap-3 my-6 xl:hidden">
            <div class="flex-1 border-t border-neutral-300" />
            <span class="folio-marker !m-0 !border-0 !p-0">{{ folio.page }}</span>
            <div class="flex-1 border-t border-neutral-300" />
          </div>
          <div
            v-for="section in folio.translationSections"
            :key="section.gridRow"
            :id="section.headingId ?? undefined"
            class="prose prose-stone prose-lg max-w-prose font-serif leading-relaxed text-justify mx-auto xl:mx-0"
            :style="{ gridRow: section.gridRow, gridColumn: 2 }"
          >
            <ContentRenderer :value="wrapBody(section.nodes)" />
          </div>
        </template>
      </div>
    </div>
  </div>
  </AppPage>
</template>
