// Builds ONE self-contained HTML file (all JS inlined) at dist-single/skai-space.html.
// Use it for the Claude artifact, email, or any host that only accepts a single file.
// The files in public/ (logo, fonts, favicon, preview image) are copied next to it, so ship the dist-single folder, not just the HTML.
import { build } from 'esbuild';
import fs from 'fs';

const r = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife',
  write: false, target: 'es2019', legalComments: 'none'
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// media the page fetches or uses in WebGL is embedded, because browsers block both for pages opened from disk
const media = {};
for (const dir of ['audio', 'earth']) {
  if (!fs.existsSync(`public/${dir}`)) continue;
  for (const f of fs.readdirSync(`public/${dir}`)) {
    // MP3 (plays everywhere) and WebP; the Ogg copies are only for the hosted build
    const type = f.endsWith('.mp3') ? 'audio/mpeg' : f.endsWith('.webp') ? 'image/webp' : null;
    if (type) media[`${dir}/${f}`] = `data:${type};base64,` + fs.readFileSync(`public/${dir}/${f}`).toString('base64');
  }
}
const html = fs.readFileSync('index.html', 'utf8')
  .replaceAll('__SITE_URL__', process.env.SITE_URL || '')
  .replace(/<link rel="preload"[^>]*>\n?/g, '')   // font preloads error on file:// pages; the @font-face rules still load the fonts
  .replace('<script type="module" src="/src/main.js"></script>', () => `<script>window.SKAI_ASSETS=${JSON.stringify(media)}</script>\n<script>${js}</script>`);
fs.rmSync('dist-single', { recursive: true, force: true });   // generated folder: start clean so stale files never ship
fs.mkdirSync('dist-single', { recursive: true });
fs.writeFileSync('dist-single/skai-space.html', html);
// everything in public/ (brand logo, self-hosted fonts, favicon, preview image) ships next to the page
fs.cpSync('public', 'dist-single', { recursive: true, filter: src => !/public\/(audio|earth)(\/|$)/.test(src) });   // audio and Earth maps are embedded
console.log(`dist-single/skai-space.html  ${(html.length / 1024).toFixed(0)} KB`);
