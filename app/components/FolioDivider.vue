<script setup lang="ts">
const props = defineProps<{
  page: string
  documentKey: string
}>()

// Strip column suffix (a/b) for folio-two-column pages: "145ra" → "145r", "2.145ra" → "2.145r"
const documentPage = computed(() => props.page.replace(/^((?:\d+\.)?\d+[rv])[ab]$/, '$1'))
</script>

<template>
  <div class="flex items-center gap-3 my-6">
    <div class="flex-1 border-t border-neutral-300" />
    <span class="folio-marker !m-0 !border-0 !p-0 flex items-center gap-1">
      <NuxtLink :to="`#${page}`" class="text-neutral-400">#</NuxtLink>
      <NuxtLink
        :to="`/documents/${documentKey}/${documentPage}`"
        class="hover:underline"
      >{{ page }}</NuxtLink>
    </span>
    <div class="flex-1 border-t border-neutral-300" />
  </div>
</template>
