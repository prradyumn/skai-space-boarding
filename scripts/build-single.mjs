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
const html = fs.readFileSync('index.html', 'utf8')
  .replaceAll('__SITE_URL__', process.env.SITE_URL || '')
  .replace('<script type="module" src="/src/main.js"></script>', () => `<script>${js}</script>`);
fs.rmSync('dist-single', { recursive: true, force: true });   // generated folder: start clean so stale files never ship
fs.mkdirSync('dist-single', { recursive: true });
fs.writeFileSync('dist-single/skai-space.html', html);
// everything in public/ (brand logo, self-hosted fonts, favicon, preview image) ships next to the page
fs.cpSync('public', 'dist-single', { recursive: true });
console.log(`dist-single/skai-space.html  ${(html.length / 1024).toFixed(0)} KB`);
