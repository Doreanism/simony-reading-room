<script setup lang="ts">
useHead({ title: 'Documents' })

const { data: documents } = await useAsyncData('documents', () =>
  queryCollection('documentsMeta').all()
)

const { data: authors } = await useAsyncData('authors', () =>
  queryCollection('authors').all()
)

function authorNames(slugs: string[] | undefined) {
  if (!slugs?.length) return 'Anonymous'
  return slugs
    .map((slug) => {
      if (slug === 'anonymous') return 'Anonymous'
      return authors.value?.find((a) => a.key === slug)?.name_en ?? slug
    })
    .join(' & ')
}

const sortedDocuments = computed(() => {
  if (!documents.value) return []
  return [...documents.value].sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
})
</script>

<template>
  <AppPage>
  <div class="space-y-3">
    <h1 class="text-2xl font-serif font-bold mb-6">Documents</h1>
    <ListItemCard
      v-for="doc in sortedDocuments"
      :key="doc.key"
      :to="`/documents/${doc.key}`"
      :title="doc.title_en"
      :subtitle="doc.title"
      :image="doc.cover || `/d/${doc.key}/cover.jpg`"
    >
      <template #meta>
        <span>{{ authorNames(doc.authors) }}</span>
        <span v-if="doc.year">&middot;</span>
        <span v-if="doc.year">{{ doc.year }}</span>
        <span v-if="languageLabel(doc.language)">&middot;</span>
        <span v-if="languageLabel(doc.language)">{{ languageLabel(doc.language) }}</span>
        <span>&middot;</span>
        <span>{{ doc.pages }} pages</span>
      </template>
    </ListItemCard>
  </div>
  </AppPage>
</template>
