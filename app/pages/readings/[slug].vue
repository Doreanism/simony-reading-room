<script setup lang="ts">
const route = useRoute();
const slug = route.params.slug as string;

const validViews = ["transcription", "translation"] as const;
const queryView = route.query.view as string;
const currentView = ref<"transcription" | "translation">(
  validViews.includes(queryView as any)
    ? (queryView as "transcription" | "translation")
    : "translation",
);

watch(currentView, (view) => {
  navigateTo(
    {
      path: `/readings/${slug}`,
      query: view === "translation" ? {} : { view },
    },
    { replace: true },
  );
});

const tabs = computed(() => [
  { label: sourceLanguageLabel.value, value: "transcription" as const },
  { label: translationLanguageLabel.value, value: "translation" as const },
]);

const { data: reading } = await useAsyncData(`reading-${slug}`, () =>
  queryCollection("readingsMeta").where("key", "=", slug).first(),
);

useHead({ title: () => reading.value?.title_en });

const { authors, authorName: resolveAuthorName } = useAuthors();

const { data: documentMeta } = await useAsyncData(`doc-${slug}`, async () => {
  const r = await queryCollection("readingsMeta")
    .where("key", "=", slug)
    .first();
  if (!r) return null;
  return queryCollection("documentsMeta").where("key", "=", r.document).first();
});

const { data: transcriptionColumns } = await useAsyncData(
  `transcription-cols-${slug}`,
  () =>
    queryCollection("readingsTranscription")
      .where("reading", "=", slug)
      .order("sortable_pagination_id", "ASC")
      .all(),
);

const { data: translationColumns } = await useAsyncData(
  `translation-cols-${slug}`,
  () =>
    queryCollection("readingsTranslation")
      .where("reading", "=", slug)
      .order("sortable_pagination_id", "ASC")
      .all(),
);

function wrapBody(nodes: any[]) {
  return { body: { type: "minimark", value: nodes } };
}

const { folios } = useFolioLayout(transcriptionColumns, translationColumns);

const author = computed(() => {
  if (!reading.value) return null;
  return authors.value?.find((a) => a.key === reading.value!.author) ?? null;
});

const authorName = computed(() => resolveAuthorName(reading.value?.author));

const coverImage = computed(() => {
  if (!documentMeta.value) return null;
  return documentMeta.value.cover || `/d/${documentMeta.value.key}/cover.jpg`;
});

const sourceLanguageLabel = computed(
  () => languageLabel(documentMeta.value?.language) || "Original",
);

const translationLanguageLabel = computed(() =>
  translationLabel(documentMeta.value?.language),
);
</script>

<template>
  <AppPage full>
    <div v-if="reading">
      <div class="max-w-3xl mx-auto">
        <div class="flex gap-5 justify-center">
          <NuxtLink
            v-if="coverImage"
            :to="`/documents/${reading.document}`"
            class="shrink-0"
          >
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
            <p
              v-if="reading.title !== reading.title_en"
              class="mt-1 text-base text-neutral-500 italic font-serif"
            >
              {{ reading.title }}
            </p>
            <div class="mt-2 flex flex-wrap gap-4 text-sm text-neutral-600">
              <span>{{ reading.section }}</span>
              <span>&middot;</span>
              <span>{{
                folioLabel(
                  paginationForPdfPage(documentMeta?.pagination_starts, reading.pdf_page_start),
                  reading.page_start,
                  reading.page_end,
                )
              }}</span>
            </div>
            <NuxtLink
              v-if="documentMeta"
              :to="`/documents/${documentMeta.key}`"
              class="mt-1 block text-sm text-primary hover:underline"
            >
              {{ documentMeta.title_en }}
            </NuxtLink>
            <NuxtLink
              v-if="author?.image"
              :to="`/authors/${reading.author}`"
              class="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <img
                :src="author.image"
                :alt="authorName"
                class="w-8 h-8 rounded-full object-cover"
              />
              <span>{{ authorName }}</span>
            </NuxtLink>
            <span
              v-else-if="reading.author === 'anonymous'"
              class="mt-3 inline-flex items-center gap-2 text-sm text-neutral-500"
            >
              <img
                :src="'/a/anonymous.jpg'"
                alt="Anonymous"
                class="w-8 h-8 rounded-full object-cover"
              />
              <span>Anonymous</span>
            </span>
            <span v-else class="mt-3 block text-sm text-neutral-500">{{
              authorName
            }}</span>
          </div>
        </div>

        <!-- View tabs (small screens only) -->
        <UTabs
          :items="tabs"
          class="mt-6 xl:hidden"
          @update:model-value="
            (v: string) => (currentView = v as typeof currentView)
          "
          :default-value="currentView"
        />
      </div>

      <!-- Column headers (desktop only) -->
      <div
        class="hidden xl:grid xl:grid-cols-2 gap-x-8 max-w-6xl mx-auto mt-6 mb-2"
      >
        <div
          class="text-xs font-semibold uppercase tracking-wider text-neutral-400 text-center"
        >
          {{ sourceLanguageLabel }}
        </div>
        <div
          class="text-xs font-semibold uppercase tracking-wider text-neutral-400 text-center"
        >
          {{ translationLanguageLabel }}
        </div>
      </div>

      <!--
      Side-by-side content: two DOM subtrees with display:contents for grid alignment.
      IMPORTANT: Dividers must be separate from column wrappers, and all transcription
      sections must be grouped in one wrapper, all translation in another. This ensures
      that text selection in two-column (desktop) mode stays within a single column.
      Interleaving dividers with per-folio column wrappers would fix small-screen folio
      divider ordering but breaks copy-paste by mixing columns in DOM order.
    -->
      <div
        class="reading-content max-w-6xl mx-auto grid xl:grid-cols-2 gap-x-8"
        :data-view="currentView"
      >
        <!-- Folio dividers (outside both columns so they're never hidden by column toggle) -->
        <FolioDivider
          v-for="folio in folios"
          :key="`divider-${folio.page}`"
          :id="folio.page"
          :page="folio.page"
          :document-key="reading.document"
          :style="{ gridRow: folio.dividerRow, gridColumn: '1 / -1' }"
        />
        <!-- Transcription column (display:contents so children join parent grid) -->
        <div class="reading-col reading-col-transcription contents">
          <template v-for="folio in folios" :key="folio.page">
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
        <div class="reading-col reading-col-translation contents">
          <template v-for="folio in folios" :key="folio.page">
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

<style scoped>
@media (max-width: 1279px) {
  .reading-content[data-view="translation"] .reading-col-transcription {
    display: none;
  }
  .reading-content[data-view="transcription"] .reading-col-translation {
    display: none;
  }
  .reading-content > :deep(*),
  .reading-content > .reading-col > :deep(*) {
    grid-column: 1 !important;
  }
}
</style>
