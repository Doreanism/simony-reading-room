<script setup lang="ts">
const route = useRoute();
const slug = route.params.slug as string;

const { data: doc } = await useAsyncData(`doc-${slug}`, () =>
  queryCollection("documentsMeta").where("key", "=", slug).first(),
);

useHead({ title: () => doc.value?.title_en });

const { authors: allAuthors, authorName } = useAuthors();

const docAuthors = computed(() => {
  if (!doc.value?.authors?.length || !allAuthors.value) return [];
  return doc.value.authors
    .map((key) => allAuthors.value!.find((a) => a.key === key))
    .filter(Boolean);
});

function authorImage(slug: string) {
  return allAuthors.value?.find((a) => a.key === slug)?.image ?? '/a/anonymous.jpg'
}

const { data: docReadings } = await useAsyncData(`readings-for-${slug}`, () =>
  queryCollection("readingsMeta").where("document", "=", slug).all(),
);
</script>

<template>
  <AppPage full no-px no-pt>
  <div v-if="doc">
    <DocumentViewer :doc="doc" />

    <!-- Document info (narrow) -->
    <div class="max-w-3xl mx-auto mt-8">
      <h1 class="text-2xl font-serif font-bold">
        {{ doc.title_en }}
      </h1>
      <p class="mt-1 text-base text-neutral-500 italic font-serif">
        {{ doc.title }}
      </p>
      <div class="mt-2 flex flex-wrap gap-4 text-sm text-neutral-600">
        <span v-if="doc.year">{{ doc.year }}</span>
        <span v-if="doc.year">&middot;</span>
        <span v-if="languageLabel(doc.language)">{{ languageLabel(doc.language) }}</span>
        <span v-if="languageLabel(doc.language)">&middot;</span>
        <span>{{ doc.pages }} pages</span>
        <a
          v-if="doc.document"
          :href="doc.document"
          download
          class="text-primary hover:underline"
        >
          <UIcon name="i-lucide-download" class="align-middle" /> PDF<span
            v-if="doc.filesize"
          >
            ({{ doc.filesize }})</span
          >
        </a>
        <a
          v-if="doc.url"
          :href="doc.url"
          target="_blank"
          class="text-primary hover:underline"
        >
          <UIcon name="i-lucide-external-link" class="align-middle" /> Source
        </a>
      </div>

      <!-- Description -->
      <div class="mt-4 prose prose-stone max-w-prose mx-auto font-serif text-justify">
        <ContentRenderer :value="doc" />
      </div>

      <!-- Authors -->
      <h2 v-if="doc" class="mt-8 mb-2 text-lg font-serif font-semibold">{{ docAuthors && docAuthors.length > 1 ? 'Authors' : 'Author' }}</h2>
      <template v-if="docAuthors?.length">
        <ListItemCard
          v-for="author in docAuthors"
          :key="author!.key"
          :to="`/authors/${author!.key}`"
          :title="author!.name_en"
          :subtitle="author!.name"
          :image="author!.image"
        >
          <template #meta>
            <span v-if="author!.born || author!.died">{{ author!.born }}&ndash;{{ author!.died }}</span>
          </template>
        </ListItemCard>
      </template>
      <ListItemCard
        v-else-if="doc?.authors?.includes('anonymous')"
        title="Anonymous"
        :image="'/a/anonymous.jpg'"
      />
      <p v-else-if="doc" class="text-sm text-neutral-500">Anonymous</p>

      <!-- Readings -->
      <template v-if="docReadings?.length">
        <h2 class="mt-8 mb-2 text-lg font-serif font-semibold">Readings</h2>
        <div class="space-y-3">
          <ListItemCard
            v-for="reading in docReadings"
            :key="reading.key"
            :to="`/readings/${reading.key}`"
            :title="reading.title_en"
            :subtitle="reading.title !== reading.title_en ? reading.title : undefined"
            :description="reading.description"
          >
            <template #meta>
              <AuthorBadge :name="authorName(reading.author)" :image="authorImage(reading.author)" />
              <span>&middot;</span>
              <span v-if="reading.year">{{ reading.year }}</span>
              <span v-if="reading.year">&middot;</span>
              <span v-if="languageLabel(doc?.language)">{{ languageLabel(doc?.language) }}</span>
              <span v-if="languageLabel(doc?.language)">&middot;</span>
              <span>{{ reading.section }}</span>
              <span>&middot;</span>
              <span>{{ folioLabel(paginationForPdfPage(doc?.pagination_starts, reading.pdf_page_start), reading.page_start, reading.page_end) }}</span>
            </template>
          </ListItemCard>
        </div>
      </template>

    </div>
  </div>
  </AppPage>
</template>
