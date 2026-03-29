import { defineContentConfig, defineCollection, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    authors: defineCollection({
      type: 'page',
      source: 'authors/*.md',
      schema: z.object({
        key: z.string(),
        name: z.string(),
        name_en: z.string(),
        wikipedia: z.string().optional(),
        image: z.string().optional(),
        born: z.number().optional(),
        died: z.number().optional(),
      }),
    }),
    documentsMeta: defineCollection({
      type: 'page',
      source: 'documents/meta/*.md',
      schema: z.object({
        key: z.string(),
        title: z.string(),
        title_en: z.string(),
        author: z.string(),
        year: z.number().optional(),
        url: z.string().optional(),
        document: z.string().optional(),
        cover: z.string().optional(),
        pages: z.number(),
        filesize: z.string(),
        pagination: z.string(),
        language: z.string().optional(),
        typeface: z.string().optional(),
        ocr_model: z.string().optional(),
      }),
    }),
    readingsMeta: defineCollection({
      type: 'page',
      source: 'readings/meta/*.md',
      schema: z.object({
        key: z.string(),
        title: z.string(),
        title_en: z.string(),
        author: z.string(),
        document: z.string(),
        section: z.string(),
        year: z.number().optional(),
        description: z.string().optional(),
        pdf_page_start: z.number(),
        pdf_page_end: z.number(),
        page_start: z.string(),
        page_end: z.string(),
      }),
    }),
    readingsTranscription: defineCollection({
      type: 'page',
      source: 'readings/transcription/**/*.md',
      schema: z.object({
        reading: z.string(),
        page: z.string(),
        pdf_page: z.number(),
        sortable_pagination_id: z.string(),
      }),
    }),
    readingsTranslation: defineCollection({
      type: 'page',
      source: 'readings/translation/**/*.md',
      schema: z.object({
        reading: z.string(),
        page: z.string(),
        pdf_page: z.number(),
        sortable_pagination_id: z.string(),
      }),
    }),
    // documents/transcription/ is excluded from Nuxt Content — too many files
    // (~4000+) causes the dev server and build to hang. Search is handled by
    // Pagefind which indexes those files at build time instead.
  },
})
