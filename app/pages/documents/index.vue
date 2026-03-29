<script setup lang="ts">
useHead({ title: 'Documents' })

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
        <span>{{ authorName(doc.author) }}</span>
        <span v-if="doc.year">&middot;</span>
        <span v-if="doc.year">{{ doc.year }}</span>
        <span>&middot;</span>
        <span>{{ doc.pages }} pages</span>
      </template>
    </ListItemCard>
  </div>
  </AppPage>
</template>
