export default defineNuxtConfig({
  modules: ['@nuxt/content', '@nuxt/ui', '@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Reading Room',
      short_name: 'Reading Room',
      description: 'Medieval text translation pipeline',
      theme_color: '#292524',
      background_color: '#fafaf9',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,json}'],
      globIgnores: ['a/**', 'd/**', 'pagefind/**', '**/_payload.json'],
    },
  },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'description', content: 'Medieval text translation pipeline' },
      ],
    },
  },

  routeRules: {
    '/a/**': {
      proxy: `https://simony.s3.us-west-2.amazonaws.com/authors/**`,
    },
    '/d/**': {
      proxy: `https://simony.s3.us-west-2.amazonaws.com/documents/**`,
    },
    '/pagefind/**': {
      proxy: `https://simony.s3.us-west-2.amazonaws.com/pagefind/**`,
    },
  },

  compatibilityDate: '2025-03-24',
})
