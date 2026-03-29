<script setup lang="ts">
useHead({ title: 'Simony Reading Room', titleTemplate: '%s' })

const { data: readings } = await useAsyncData('home-readings', () =>
  queryCollection('readingsMeta').all()
)
const { data: documents } = await useAsyncData('home-documents', () =>
  queryCollection('documentsMeta').all()
)
const { data: authors } = await useAsyncData('home-authors', () =>
  queryCollection('authors').all()
)
</script>

<template>
  <AppPage>
  <div class="py-12 text-center">
    <h1 class="text-4xl font-serif font-bold">
      Welcome to the Simony Reading Room
    </h1>
    <p class="mt-4 text-lg text-neutral-600 dark:text-neutral-400 font-serif">
      Simony is
      <em
        >an earnest desire to buy or sell something spiritual or something
        annexed to a spiritual thing.</em
      >
    </p>

    <p class="mt-4 text-lg text-neutral-600 dark:text-neutral-400 font-serif">
      This digital library collects theological and philosophical texts on the
      topic, with transcriptions, translations, and facsimile page images.
    </p>

    <GlobalSearch class="mt-8" />

    <div class="mt-12 grid gap-6 sm:grid-cols-3">
      <NuxtLink
        to="/readings"
        class="group flex flex-col items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-8 transition-all hover:ring-2 hover:ring-primary hover:shadow-lg"
      >
        <UIcon name="i-lucide-book-open" class="text-4xl text-primary" />
        <span class="-mb-2 text-xs text-neutral-400 dark:text-neutral-500">{{ readings?.length ?? 0 }}</span>
        <span
          class="text-xl font-serif font-semibold group-hover:text-primary transition-colors"
          >Readings</span
        >
        <span class="text-sm text-neutral-500"
          >Transcriptions and translations of selected passages</span
        >
      </NuxtLink>

      <NuxtLink
        to="/documents"
        class="group flex flex-col items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-8 transition-all hover:ring-2 hover:ring-primary hover:shadow-lg"
      >
        <UIcon name="i-lucide-file-text" class="text-4xl text-primary" />
        <span class="-mb-2 text-xs text-neutral-400 dark:text-neutral-500">{{ documents?.length ?? 0 }}</span>
        <span
          class="text-xl font-serif font-semibold group-hover:text-primary transition-colors"
          >Documents</span
        >
        <span class="text-sm text-neutral-500"
          >Browse facsimile page images of original manuscripts</span
        >
      </NuxtLink>

      <NuxtLink
        to="/authors"
        class="group flex flex-col items-center gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 p-8 transition-all hover:ring-2 hover:ring-primary hover:shadow-lg"
      >
        <UIcon name="i-lucide-users" class="text-4xl text-primary" />
        <span class="-mb-2 text-xs text-neutral-400 dark:text-neutral-500">{{ authors?.length ?? 0 }}</span>
        <span
          class="text-xl font-serif font-semibold group-hover:text-primary transition-colors"
          >Authors</span
        >
        <span class="text-sm text-neutral-500"
          >Learn about the theologians and scholars behind these works</span
        >
      </NuxtLink>
    </div>

    <figure class="mt-16">
      <img
        src="/simon-magus.jpg"
        alt="The Fall of Simon Magus, by Sébastien Bourdon (1657)"
        class="mx-auto rounded-lg shadow-lg max-w-full"
      />
      <figcaption class="mt-3 text-sm text-neutral-500 italic">
        Sébastien Bourdon, <em>La Chute de Simon le Magicien</em> (1657)
      </figcaption>
    </figure>
  </div>
  </AppPage>
</template>
