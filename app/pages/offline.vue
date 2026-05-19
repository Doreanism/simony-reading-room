<script setup lang="ts">
useHead({ title: 'Offline' })
</script>

<template>
  <AppPage>
    <div class="py-16 text-center">
      <UIcon name="i-lucide-wifi-off" class="text-4xl text-neutral-400" />
      <h1 class="mt-4 text-2xl font-serif font-semibold">You're offline</h1>
      <p class="mt-2 text-neutral-600 dark:text-neutral-400">
        This page isn't available without a connection. Try again once you're back online.
      </p>
      <NuxtLink
        to="/"
        class="mt-6 inline-block text-sm text-primary hover:underline"
      >
        Return to the home page
      </NuxtLink>
    </div>
  </AppPage>
</template>
