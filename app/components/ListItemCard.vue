<script setup lang="ts">
defineProps<{
  to: string
  title: string
  subtitle?: string
  description?: string
  image?: string
}>()
</script>

<template>
  <NuxtLink :to="to" class="block">
    <UCard class="hover:ring-2 hover:ring-primary transition-all">
      <div class="flex gap-4">
        <img
          v-if="image"
          :src="image"
          :alt="title"
          class="w-16 h-20 object-cover rounded shrink-0"
        />
        <div class="min-w-0">
          <h3 class="text-lg font-serif font-semibold">
            {{ title }}
          </h3>
          <p v-if="subtitle" class="mt-1 text-sm text-neutral-500 italic font-serif">
            {{ subtitle }}
          </p>
          <p v-if="description" class="mt-2 text-sm text-neutral-600">
            {{ description }}
          </p>
          <div v-if="$slots.meta" class="mt-2 flex flex-wrap gap-4 text-sm text-neutral-500">
            <slot name="meta" />
          </div>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
