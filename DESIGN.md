# SKAI Space · Boarding Sequence — DESIGN.md

Handoff rules for every future version (Three.js, Blender, 2D). The source of truth for brand is the **Skai-Design** Figma file (page "Final": colour palette, Chakra Petch × Inter pairing, per-skill HUD frames, Start Mission button states). If a change breaks a rule here, change the rule on purpose or don't make the change.

## Concept
A launch-bay boarding sequence that plays like a short film. One tap scans the visitor in and opens the door; after that there is no input. SKAI-1 flies past four planets (about 25 s after the door opens). Each planet carries one tagline and one skill we teach, shown as a 3D object beside the planet, and the tour lands on the swift-logo constellation with a call to action. An inviting page, not a simulation: the sky carries the words, and the UI stays out of the way.

## Colour tokens (SKAI palette, `:root` in index.html)
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#050b22` | Page base (a darker step of Deep Navy). Never pure black except the letterbox. |
| `--ghost` / `--white` | `#F7FBFF` / `#FFFFFF` | Text, plate borders. |
| `--steel` / `--sky` | `#86A9CC` / `#B8D8F4` | Secondary text, hairlines. |
| `--royal` | `#0A2D94` | System pills (Sound), blue plates. |
| `--deep-navy` / `--navy` | `#091C56` / `#17355F` | Door and panel surfaces, rivets on blue plates. |
| `--orange` | `#FCA01B` | The one action colour: primary plate button, progress, hazard. |
| `--amber` / `--yellow` / `--dark-orange` | `#F5A524` / `#FEE714` / `#B96D00` | Lamps, focus ring, rivets on orange plates. |
| `--mint` / `--cyan` / `--teal` | `#45CDB5` / `#17BDE0` / `#096B5B` | Biometrics, data, coding text. |
| `--green` | `#18AC6A` | Granted states. |

### Skill colours (`SKILLS` in src/config.js, from the per-skill HUD frames)
| Skill | Plate | Text on sky (`ink`) | 3D cue |
|---|---|---|---|
| Robotics | `#961477 → #FC22B3` (magenta) | `#FC4FC4` | Robot arm with gripper, pick-and-place loop |
| AI & Data | `#2E48A3 → #0A2D94` (blue, orange accents) | `#17BDE0` | Neural network, orange signals running layer to layer |
| Coding | `#108D55 → #18AC6A` (green, inset ring) | `#45CDB5` | Code window (`mission.py`) that types itself, header dots orange/yellow/mint |
| Mechanics | `#154777 → #2784DD` steel plate, `#FCA01B` gear | `#FCA01B` | Three meshing gears on a hazard-striped beam |

Each planet's `atmo` (glow) matches its skill.

## Type
- Headings, labels, buttons: **Chakra Petch** 500–700. Labels and buttons are uppercase with +0.04–0.1em tracking.
- Body: **Inter** 400–600.
- Taglines: line 1 Chakra Petch 700 white; line 2 Chakra Petch 500 in the skill's `ink`. Never wrap; `fitLines()` shrinks them to fit.
- Canvas text (rocket hull, door stencils, code window) also uses Chakra Petch.

## Components
- **Logo plate**: the SKAI Space wordmark (`public/brand/skai-wordmark.svg` + `skai-space.svg`, exported from Figma) on a white plate with an angled right edge, flush to the top-left corner, as in every SKAI HUD frame. Never recolour or redraw the wordmark.
- **Plate button** (`.plate`): the Start Mission component. Orange fill, 3px white border, 6px radius, four rivets, Chakra Petch 700 uppercase. Hover = lighter fill + orange glow; pressed = darker, 1px down. `.plate.blue` is the secondary (blue `#2E48A3`).
- **Sound pill**: royal fill, 2px white border, inset ring (the SKAI timer style).
- **Curved text ring**: each planet wears a tilted band of Chakra Petch type, `SKILL ◆ MISSION 0n / 04 ◆ SKAI SPACE ◆`, skill name in the skill `ink`, hairline rules top and bottom. Near side full brightness, far side ~15%. Inside the rocket's orbit (1.36r; 1.3r on the ringed planet, inside its rings). Built in `buildRings()`.
- **Skill badge** (`.chip`): one style per skill, after its HUD frame: Robotics = magenta capsule with three slanted stripes; Coding = green plate with an inset ring and a chip-with-pins icon; AI & Data and Mechanics = bolted plates (rivets) with a hexagon or gear icon.

## Layout
- Tagline and badge sit left (desktop) or bottom (portrait); the planet sits right/top. Never centre text over a planet.
- The skill cue sits at the planet's lower right (`CUE_SPOT` in main.js), closer to the camera than the planet, clear of the letterbox and the rocket's orbit.
- Letterbox bars (11% landscape, 13% portrait of the *visible* height, `--lbh`, set from `innerHeight` so mobile toolbars don't hide them) for the whole tour; they open at the finale. The logo plate and Sound pill sit on the top bar.
- Safe areas: `viewport-fit=cover`; the logo plate, Sound pill, tagline, finale and skip link add `env(safe-area-inset-*)`.
- Breakpoints: portrait = aspect < 0.9 (text bottom, planet top); ≤760px wide or ≤500px tall = compact HUD; ≤500px tall landscape = phone landscape (lock sized by height with the readout beside it, smaller badge and finale); ≤700px tall portrait = small phone (smaller lock).

## Motion grammar
| Moment | Duration | Ease |
|---|---|---|
| UI enter | 0.6–1.1s, 0.06–0.12s stagger | `expo.out` |
| UI exit | 0.35s | `power2.in` |
| Door open | 2.1s halves, 2.3s push-in | `expo.inOut` / `power2.in` |
| Flight leg | 2.6–3.6s by distance (`CONFIG.tour`) | quad in-out on the path |
| Tagline + badge in | at 70% of the approach; badge slides 0.8s, lines mask-reveal 1.1s | `expo.out` |
| Text ring reveal | an arc head (skill colour) sweeps the letters in from just left of the visible face, 2.4s; then the ring turns slowly; fades 0.5s when the rocket leaves | `power2.inOut` |
| Skill cue pop | grows from 50% to full size over 1.3s as its tagline appears | `expo.out` |
| Planet hold | 2.0s after arrival (each tagline is on screen about 3s) | — |

No bounce or elastic anywhere. Reduced motion = instant jumps and fades, same content.

## Focus rules
- One focal point per shot: the planet, its tagline, its skill cue and its text ring. During the tour only the current planet's cue and ring are visible; all four cues show at the start, and all cues and rings at the finale.
- Minimal UI: logo plate and Sound during the tour; the finale adds only the CTA and Replay plates.

## Camera shots (per leg)
Tilt follow (launch), Chase, Low angle, Side track, Reverse, Orbit, Flyby. Each leg uses one (`PLAN`), blended in from the last frame and out into the planet frame. The lens is never allowed inside a planet or closer than 11 units to the rocket.

## Content rules
- Taglines and skills live in `CONFIG.values[]` (`line`, `skill`); skill names and colours in `SKILLS`.
- Only show numbers with a source. The India lights on the last planet are approximate state-capital positions, not a list of active states.

## Sound
- Two voices: the narrator (Rudra, Indian English, cinematic) speaks the welcome, each tagline and the finale; the ship's computer (SKAI Bot) speaks only at the lock. Never more than one voice line at a time.
- Music is one ambient loop that fades in as the door opens and ducks (to ~35%) under every voice line.
- Every beat has one sound: scan, chime, door, warp, a whoosh per flight, a signature per skill (servos, data chirps, typing, gears), the finale sting. No sound plays without a visual reason.
- Mute is the Sound pill; `#space` starts muted. Reduced motion keeps sound.

## Mission briefing (the hook)
Between the scan and the door, the ship's computer runs a briefing on a HUD panel over the door (`runBriefing` in main.js), timed to the voice-over:
1. `DESTINATION` · **2040**, the cursor blinks twice (two beeps). SKAI Bot: "Destination: twenty forty."
2. `SCANNING JOB MARKET`: today's job titles decode into glyphs and settle on **UNKNOWN**; `ROUTE: UNKNOWN`. Narrator: "The jobs of tomorrow don't have names yet."
3. The panel clears to one question: "How do you prepare for a world **no one can map?**" Narrator asks it; no music yet.
4. `PLOTTING ROUTE`: a line draws through four nodes (the four skills, in their colours) as SKAI Bot names them ("Plotting route: robotics, AI and data, coding, mechanics."), each node lighting as it is named; then the door opens and the tour plays as the answer. Wide screens draw the route left to right; narrow screens (< 600px) draw it top to bottom with labels beside the nodes.
Every line on the briefing screen is spoken; on phones the door's light sweep is off (it repaints the whole screen).
Skip intro ends it at any point. Job titles are present-day examples only; never claim which jobs will or won't exist.

## Rocket
Hero model built in code (`buildRocket`): gloss clear-coat paint over a 2048px livery (SKAI, SK-1 · LAUNCHPAD, BY CONVEGENIUS, hazard band) with a bump map for panel seams and rivets; chrome nose tip and interstage rings; beveled swept fins with orange leading edges; portholes with chrome rims and a warm cabin glow; a cooled main bell with a hot rim and four steering engines; side boosters with chrome nose caps. The flame has a white-hot core, turbulence and shock diamonds. No national flag or emblem on the livery.

## Finale: the route, completed
After the fourth planet the letterbox opens and the camera pulls back to a fitted frame (`finaleFrame`) with all four planets in the upper part of the screen. The rocket runs a route through them in briefing order, drawing a dotted line in the skill colours (`buildRoute3D`) and lighting each planet's atmosphere as it passes, then streaks off the end in a flash. Then: a soft dark gradient rises from the bottom; the closing line ("The world can't be mapped. / But your students can be ready for it.", narrator) reveals; the SKAI Space logo plate wipes in with one light sweep; the Visit skaispace.ai plate button follows; the narrator says "SKAI Space, by ConveGenius". No skill objects, text rings, bird, constellation, corner logo, sound pill or Replay at the finale.

## Earth
- Seen only at the start and during the launch flight; fades out before the first planet. Low in frame (bottom third), dawn line across it, India's lights on the night side. Never in planet shots or the finale.

## Performance and image quality
- **Everything is prepared behind the loading screen** (`prewarm`): every shader is compiled and every texture uploaded, including objects that only appear later (rocket, Earth, rings, skill objects), and one frame is rendered through the full effects chain. Nothing compiles or uploads mid-tour.
- **Planet surfaces are baked once** (`bakePlanets`): the procedural noise runs one time per planet into an equirectangular texture (3072 px desktop, 2048 phones; clouds 2048/1024), in strips over several frames. Per frame, planets only sample that texture and compute lighting, rim and gold seams.
- **Adaptive resolution** (`watchFrameRate`): starts sharp (desktop 1.75x, phones 1.5x, up to the screen's own density, max 2x), checks every second, steps down 15% when below ~48 fps and back up after 3 smooth seconds. Effects only switch off (bloom, flare, clouds, aurora; levels 2/1/0) once resolution is already at 1x.
- **Anti-aliasing:** FXAA on phones and standard-density screens; none needed on Retina-class screens (already supersampled). **Never use MSAA in the composer**: the lens flare copies from the render target, which is illegal on a multisampled buffer and produced black/partial frames.
- **WebGL resets:** if the browser drops the context, rendering pauses and, on restore, the sky cube map and planet textures are re-baked (render-target contents are wiped).
- **Fast first paint:** the lock appears as soon as fonts load; the 3D world builds, bakes and pre-warms in the background during the scan and briefing. The door waits for it if needed ("Preparing launch").
- **Clean image:** crisp bloom (strength .6, radius .4, threshold .82); colour fringe only during the warp (tiny on desktop, none on phones); light grain on desktop only.
- Stars are sharp points (6000 desktop / 3400 phones); the baked sky holds only the nebula and galactic band.
- Text in 3D at 2x where the GPU allows: ring strips 8192 px (4096 on phones), code window 1280 px (640 on phones).
- Phones: bloom buffers at 40% resolution; the door's light sweep is off. Sound suspends while the tab is hidden; rendering pauses.
- Media loads after the page appears: audio as Ogg Opus (~630 KB) with an automatic MP3 fallback for browsers that can't decode Opus; Earth maps as WebP (~395 KB). The link-preview image stays JPEG (social platforms), logos stay SVG. The only image files are the brand SVGs, Earth maps and the preview image.

## Never use
Gradient text, glass cards, emoji, bouncing UI, stock photos, invented metrics, a recoloured or redrawn SKAI wordmark, fonts other than Chakra Petch and Inter.
