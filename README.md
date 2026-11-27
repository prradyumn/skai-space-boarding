# SKAI Space · Boarding Sequence

An inviting showcase page for SKAI Space (ConveGenius). The visitor taps the lock once: a fingerprint scans itself, the ship's computer runs a short mission briefing ("Destination 2040 … How do you prepare for a world no one can map?"), and a blast door opens into space. From there it plays on its own, with no more input, for about 25 s. A rocket (SKAI-1) flies past six planets, one per SKAI domain (Structures & Mechanical, Electronics, Robotics, AI & Data, Design & Innovation, Entrepreneurship), each carrying a tagline shown as a moving 3D object and a curved ring of text around the planet, and the experience ends on a swift-logo constellation with a link to skaispace.ai. It opens over a glimpse of Earth (night side, India's city lights, dawn on the horizon), and it is fully voiced and scored with ElevenLabs audio.

Built with **Three.js 0.169** and **GSAP 3.13**. It follows the SKAI design system from the Skai-Design Figma file (Chakra Petch × Inter, the SKAI palette, bolted plate buttons, per-skill badge styles). Every visual is generated in code. The page has **no runtime dependencies on other sites**: fonts are self-hosted (`public/fonts/`, OFL), and the only files are the two SKAI wordmark SVGs, the favicon and the link-preview image. JavaScript is about 199 KB gzipped, split into three cached chunks (three.js, GSAP, app); audio (540 KB) and Earth maps (510 KB) load in the background after the page appears.

## Getting started in VS Code

```bash
npm install
npm run dev          # local server with live reload, opens the browser
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/` (multi-file, for any static host: Vercel, Netlify, S3) |
| `npm run preview` | Serve the `dist/` build locally |
| `npm run build:single` | One HTML file with the JS inlined, at `dist-single/skai-space.html`, plus the `public/` files next to it (ship the whole folder) |
| `npm run test:smoke` | Taps the lock, lets the tour play, screenshots each tagline and the finale at desktop + mobile, and fails on page errors or text that spills out (needs `npm i -D playwright && npx playwright install chromium`, run `build:single` first) |

## Useful URLs while developing

- `http://localhost:5173/`: full experience from the lock
- `http://localhost:5173/#space`: skip the lock and door (sound off), the tour starts straight away
- `http://localhost:5173/?capture`: fixed full quality (no adaptive resolution), used to record the promo video frame by frame
- `http://localhost:5173/#kiosk`: exhibition mode (fullscreen on first tap, resets after 75 s idle)

## Project layout

```
index.html            Markup + all CSS (design tokens at the top of <style>)
src/config.js         CONTENT: SKILLS (names, colours, 3D cue) and one tagline + skill per planet, tour timing
public/brand/         SKAI Space wordmark SVGs, exported from the Figma file
public/fonts/         Chakra Petch 500-700 and Inter 400-600 (latin, woff2, OFL licences included)
public/audio/         ElevenLabs voice-over (vo-*) and sound design (sfx-*, amb-space loop): Ogg Opus (used by modern browsers) + MP3 fallback
public/earth/         Earth day / night-lights / cloud maps as WebP (NASA, public domain; see CREDITS.txt)
public/og.jpg         1200x630 link-preview image · public/favicon.svg
vercel.json           Vercel build settings, cache headers and security headers (CSP)
docs/                 Notes that should not be published (old narration notes)
src/main.js           Everything else, in labelled sections (see PROMPT.md for the map)
scripts/build-single.mjs
tests/smoke.cjs
DESIGN.md             Design rules: colours, type, motion timings, camera rules, never-use list
PROMPT.md             Prompt to paste into Copilot Chat / Claude Code / Cursor in VS Code
```

## Editing content

Open `src/config.js`:

- `SKILLS`: one entry per domain: display name, plate colours, text colour and which 3D object it uses (`gears`, `circuit`, `arm`, `neural`, `bulb`, `chart`).
- `SKILL_GROUPS`: the 10 skills in 5 groups shown on the briefing's route screen.
- `CONFIG.values`: one planet per tagline. `line` is the two lines of text (the second is drawn in the skill's colour) and `skill` picks a key of `SKILLS`. The rest is the planet's look: colours, size, position and feature flags such as `clouds`, `aurora`, `swirl`, `moons`, `rock`, `ring`. Add or remove an entry to add or remove a planet.
- `CONFIG.tour`: timing in seconds (hover before the first flight, time parked at each planet, flight speed and shortest/longest flight).

## Audio (ElevenLabs)

All audio was generated once with ElevenLabs and is shipped as static files; **no API key is used or stored by the page**.

- Narrator: *Rudra – Cinematic Luxury Brand* (`N9rZ3GaL6nwOrNUEMppm`), Indian English. Ship's computer: *SKAI Bot* (`18sERuLov47y4nrkWIuE`).
- Lines: `vo-granted`, `vo-brief-dest` and `vo-brief-route` (SKAI Bot), `vo-brief-1`, `vo-brief-2` (the briefing), `vo-welcome`, `vo-1`…`vo-4` (the four taglines), `vo-finale`. "SKAI" is written "Sky" in the speech text for pronunciation.
- Sound effects: `amb-space` (22 s seamless loop), scan, granted, briefing scramble and route, door, warp, flyby, one per skill, finale sting.
- Mix (`Sound` in main.js): music, sfx and voice buses; music ducks under the voice; each planet holds until its line ends. If a file is missing, the built-in synth sounds play instead.
- To regenerate a line, change the text, generate it again with the same voice and file name, and replace the mp3.

## Go live on Vercel

The repo is ready to deploy as is; `vercel.json` holds every setting.

1. Push this folder to GitHub (or GitLab/Bitbucket) and import it at vercel.com/new. Vercel reads `vercel.json`: install `npm ci`, build `npm run build`, output `dist/`. No environment variables are required.
2. Or from the terminal: `npx vercel` (preview link), then `npx vercel --prod`.

What ships:
- Hashed JS chunks cached for a year (`/assets/*`), fonts for a year, brand files for a week; `index.html` is always revalidated, so updates show at once.
- Security headers: a strict Content-Security-Policy (only the site itself, no third parties), `nosniff`, a referrer policy and a permissions policy. The page can still be embedded in an iframe on other sites; add `frame-ancestors` to the CSP if you want to stop that.
- Link previews: `og:image` becomes an absolute URL automatically from Vercel's production domain. On another host, set `SITE_URL=https://your-domain` when building.

Before a public launch: replace the placeholder content if any remains, and check it once on a real phone and a school tablet (the automated checks use a software GPU, so they verify layout and errors, not real frame rates).

## Status

Done: one-tap fingerprint scan, detailed blast door, hyperspace, a self-playing rocket tour past four skill planets (tagline, SKAI skill badge, 3D skill cue and curved text ring each), constellation finale with the skaispace.ai link and Replay, SKAI design system, responsive layouts (small phones to 1080p, phone landscape, notches), adaptive quality tiers, reduced motion, kiosk mode, a screen-reader text version, and Vercel-ready production settings.
