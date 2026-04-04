<script setup lang="ts">
const props = defineProps<{
  slug: string
}>()

const { data: authors } = await useAsyncData('authors', () =>
  queryCollection('authors').all()
)

const author = computed(() => {
  if (!props.slug || props.slug === 'anonymous') return undefined
  return authors.value?.find((a) => a.key === props.slug)
})

const name = computed(() => author.value?.name_en ?? 'Anonymous')
const image = computed(() => author.value?.image ?? '/a/anonymous.jpg')
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <img :src="image" :alt="name" class="w-5 h-5 rounded-full object-cover" />
    {{ name }}
  </span>
</template>
