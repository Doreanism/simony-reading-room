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
      globPatterns: [
        'manifest.webmanifest',
        'favicon.ico',
        'favicon-*.png',
        'apple-touch-icon.png',
        'pwa-*.png',
        '_nuxt/entry.*.css',
      ],
      // vite-pwa-nuxt auto-appends **/_payload.json when prerender is enabled
      // and **/_nuxt/builds/**/*.json for the app manifest. Both are large/per-route;
      // runtime caching handles them, no need to precache.
      globIgnores: ['**/_payload.json', '**/_nuxt/builds/**'],
      navigateFallback: '/offline',
      navigateFallbackDenylist: [
        /^\/a\//, /^\/d\//, /^\/pagefind\//, /^\/api\//,
      ],
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/_nuxt/'),
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'nuxt-assets' },
        },
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/__nuxt_content/'),
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'nuxt-content' },
        },
        {
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: { cacheName: 'pages', networkTimeoutSeconds: 3 },
        },
      ],
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
    '/': { prerender: true },
    '/readings': { prerender: true },
    '/readings/**': { prerender: true },
    '/authors': { prerender: true },
    '/authors/**': { prerender: true },
    '/documents': { prerender: true },
    '/documents/*': { prerender: true },
    // Document viewer with explicit page param: too many permutations to prerender;
    // serve from edge cache and revalidate in background.
    '/documents/*/**': { swr: 3600 },
  },

  nitro: {
    prerender: {
      crawlLinks: true,
      failOnError: false,
    },
  },

  compatibilityDate: '2025-03-24',
})
