<script setup lang="ts">
useHead({ title: 'Authors' })

const { data: authors } = await useAsyncData('authors', () =>
  queryCollection('authors').all()
)

const sortedAuthors = computed(() => {
  if (!authors.value) return []
  return [...authors.value].sort((a, b) => (a.died ?? 0) - (b.died ?? 0))
})
</script>

<template>
  <AppPage>
  <div class="space-y-3">
    <h1 class="text-2xl font-serif font-bold mb-6">Authors</h1>
    <ListItemCard
      v-for="author in sortedAuthors"
      :key="author.key"
      :to="`/authors/${author.key}`"
      :title="author.name_en"
      :subtitle="author.name"
      :image="author.image"
    >
      <template #meta>
        <span v-if="author.born || author.died">{{ author.born }}&ndash;{{ author.died }}</span>
      </template>
    </ListItemCard>
  </div>
  </AppPage>
</template>
