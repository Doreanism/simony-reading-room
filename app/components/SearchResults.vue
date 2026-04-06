<script setup lang="ts">
defineProps<{
  query: string
  loading: boolean
  results: PagefindSearchResult[]
  listClass?: string
}>()
</script>

<template>
  <div>
    <slot name="empty" v-if="query.length > 0 && query.length < 2">
      <p class="text-sm text-neutral-500">Type at least 2 characters</p>
    </slot>
    <slot name="loading" v-else-if="loading">
      <p class="text-sm text-neutral-500">Searching...</p>
    </slot>
    <slot name="no-results" v-else-if="query.length >= 2 && results.length === 0">
      <p class="text-sm text-neutral-500">No results found</p>
    </slot>
    <ul v-else-if="results.length > 0" :class="listClass">
      <li v-for="(result, i) in results" :key="i">
        <slot name="result" :result="result" :index="i" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
:deep(.pagefind-excerpt mark) {
  background: color-mix(in srgb, var(--ui-primary) 30%, transparent);
  border-radius: 0.125rem;
  padding-inline: 0.125rem;
  color: inherit;
}
</style>
