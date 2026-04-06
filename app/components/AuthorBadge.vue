<script setup lang="ts">
withDefaults(defineProps<{
  name?: string
  image?: string
}>(), {
  name: 'Anonymous',
  image: '/a/anonymous.jpg',
})
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <img :src="image" :alt="name" class="w-5 h-5 rounded-full object-cover" />
    {{ name }}
  </span>
</template>
