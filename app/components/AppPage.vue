<script setup lang="ts">
const props = defineProps<{
  noPx?: boolean
  noPt?: boolean
  noPb?: boolean
  full?: boolean
}>()

const classes = computed(() => [
  props.noPx ? '' : 'px-4',
  props.noPt ? '' : 'pt-4',
  props.noPb ? '' : 'pb-8',
  props.full ? '' : 'max-w-3xl mx-auto',
])
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
