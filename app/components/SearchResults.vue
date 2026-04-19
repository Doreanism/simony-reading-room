<script setup lang="ts">
import { MIN_SEARCH_LENGTH } from '~/utils/pagefind'

const props = defineProps<{
  query: string
  loading: boolean
  results: PagefindSearchResult[]
  listClass?: string
}>()

const trimmedLength = computed(() => props.query.trim().length)
</script>

<template>
  <div>
    <slot name="empty" v-if="trimmedLength > 0 && trimmedLength < MIN_SEARCH_LENGTH">
      <p class="text-sm text-neutral-500">Type at least {{ MIN_SEARCH_LENGTH }} characters</p>
    </slot>
    <slot name="loading" v-else-if="loading">
      <p class="text-sm text-neutral-500">Searching...</p>
    </slot>
    <slot name="no-results" v-else-if="trimmedLength >= MIN_SEARCH_LENGTH && results.length === 0">
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
