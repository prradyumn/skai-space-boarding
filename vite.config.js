import { defineConfig } from 'vite';

// Absolute site address for link-preview tags. Set SITE_URL yourself, or let Vercel provide its production domain.
const SITE_URL = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');

export default defineConfig({
  server: { host: true },
  plugins: [{ name: 'site-url', transformIndexHtml: html => html.replaceAll('__SITE_URL__', SITE_URL) }],
  build: {
    target: 'es2019',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // libraries in their own long-cached chunks, so a content edit only re-downloads the small app chunk
        manualChunks: id => id.includes('node_modules/three') ? 'three' : id.includes('node_modules/gsap') ? 'gsap' : undefined
      }
    }
  }
});
