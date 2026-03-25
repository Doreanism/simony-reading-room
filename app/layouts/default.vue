<script setup lang="ts">
const colorMode = useColorMode()

const colorModeIcon = computed(() => {
  if (colorMode.preference === 'dark') return 'i-lucide-moon'
  if (colorMode.preference === 'light') return 'i-lucide-sun'
  return 'i-lucide-monitor'
})

function cycleColorMode() {
  const modes = ['system', 'light', 'dark'] as const
  const i = modes.indexOf(colorMode.preference as typeof modes[number])
  colorMode.preference = modes[(i + 1) % modes.length]
}
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="h-12 border-b border-neutral-200 dark:border-neutral-800">
      <UContainer class="flex items-center justify-between h-full">
        <NuxtLink to="/" class="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <UIcon name="i-lucide-house" />
          <span class="hidden sm:inline">Simony Reading Room</span>
        </NuxtLink>
        <div class="flex items-center gap-1">
          <UTooltip text="Readings">
            <UButton icon="i-lucide-book-open" variant="ghost" color="neutral" to="/readings" aria-label="Readings" />
          </UTooltip>
          <UTooltip text="Documents">
            <UButton icon="i-lucide-file-text" variant="ghost" color="neutral" to="/documents" aria-label="Documents" />
          </UTooltip>
          <UTooltip text="Authors">
            <UButton icon="i-lucide-users" variant="ghost" color="neutral" to="/authors" aria-label="Authors" />
          </UTooltip>
          <UTooltip text="Toggle color mode">
            <ClientOnly>
              <UButton
                :icon="colorModeIcon"
                variant="ghost"
                color="neutral"
                class="cursor-pointer"
                @click="cycleColorMode"
              />
              <template #fallback>
                <div class="w-8 h-8" />
              </template>
            </ClientOnly>
          </UTooltip>
        </div>
      </UContainer>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-neutral-200 dark:border-neutral-800">
      <UContainer class="flex items-center justify-between py-4">
        <a
          href="https://sellingjesus.org"
          target="_blank"
          class="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <UIcon name="i-lucide-external-link" />
          <span>sellingJesus.org</span>
        </a>
        <a
          href="https://github.com/Doreanism/simony-reading-room"
          target="_blank"
          class="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <UIcon name="i-lucide-github" />
          <span>GitHub</span>
        </a>
      </UContainer>
    </footer>
  </div>
</template>
