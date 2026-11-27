import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector3, BufferGeometry, BufferAttribute,
  Points, ShaderMaterial, AdditiveBlending, NormalBlending, Mesh, SphereGeometry, RingGeometry, BackSide, DoubleSide,
  Group, Sprite, SpriteMaterial, CanvasTexture, LineSegments, LineBasicMaterial, CatmullRomCurve3,
  Vector2, ACESFilmicToneMapping, SRGBColorSpace, Shape, ShapeGeometry,
  MeshStandardMaterial, AmbientLight, DirectionalLight, MathUtils, Line, LineSegments as LS2, LineLoop,
  LatheGeometry, CylinderGeometry, ConeGeometry, ExtrudeGeometry, TorusGeometry, PointLight,
  WebGLCubeRenderTarget, CubeCamera, InstancedMesh, DodecahedronGeometry, BoxGeometry, Object3D, MeshBasicMaterial, PlaneGeometry, PMREMGenerator,
  TextureLoader, NoColorSpace, MeshPhysicalMaterial, WebGLRenderTarget, HalfFloatType, OrthographicCamera,
  LinearMipmapLinearFilter, LinearFilter, RepeatWrapping
} from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { gsap } from 'gsap';

import { CONFIG, SKILLS } from './config.js';

const KIOSK = location.hash === '#kiosk';
// ?capture: fixed full quality for recording the promo video frame by frame (no adaptive resolution)
const CAPTURE = new URLSearchParams(location.search).has('capture');
// the offline single-file build embeds its media and lists it here (see scripts/build-single.mjs)
const assetUrl = u => (window.SKAI_ASSETS && window.SKAI_ASSETS[u]) || u;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const N_STOPS = CONFIG.values.length + 2; // welcome + values + launch

/* =====================================================================
   SOUND (tiny WebAudio synth, no files)
   ===================================================================== */
const Sound = {
  ctx: null, master: null, on: true, scan: null, drone: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? .55 : 0;
      this.master.connect(this.ctx.destination);
      // buses: music ducks under the voice-over
      this.bus = {};
      [['music', .55], ['sfx', 1.1], ['vo', 1.7]].forEach(([k, v]) => { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.master); this.bus[k] = g; });
      Object.keys(this.raw).forEach(k => this.decode(k));
    } catch (e) { this.ctx = null; }
  },
  /* ElevenLabs voice-over and sound effects (public/audio). Fetched in the background after boot,
     decoded once audio is allowed (first tap). Anything missing falls back to the synth sounds. */
  FILES: ['amb-space', 'sfx-scan', 'sfx-granted', 'sfx-door', 'sfx-warp', 'sfx-flyby', 'sfx-robotics', 'sfx-ai', 'sfx-coding', 'sfx-mechanics', 'sfx-finale',
    'vo-granted', 'vo-brief-dest', 'vo-brief-1', 'vo-brief-2', 'vo-brief-route', 'sfx-scramble', 'sfx-route', 'vo-welcome', 'vo-1', 'vo-2', 'vo-3', 'vo-4', 'vo-finale'],
  raw: {}, lib: {},
  // Ogg Opus where the browser can decode it, MP3 otherwise (older Safari); the offline single-file build embeds MP3 only
  fmt: !window.SKAI_ASSETS && typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'mp3',
  load(k, fmt) {
    return fetch(assetUrl(`audio/${k}.${fmt}`)).then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (!b) return; this.raw[k] = { b, fmt }; if (this.ctx) this.decode(k); }).catch(() => {});
  },
  preload() { this.FILES.forEach(k => this.load(k, this.fmt)); },
  decode(k) {
    const r = this.raw[k]; if (!r || this.lib[k]) return; delete this.raw[k];
    this.ctx.decodeAudioData(r.b).then(buf => { this.lib[k] = buf; })
      .catch(() => { if (r.fmt === 'ogg') this.load(k, 'mp3'); });   // reports Opus support but can't decode it: fall back
  },
  has(k) { return !!(this.ctx && this.lib[k]); },
  dur(k) { return this.has(k) && this.on ? this.lib[k].duration : 0; },
  play(k, { bus = 'sfx', vol = 1, when = 0, loop = false } = {}) {
    if (!this.has(k)) return null;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), t = this.ctx.currentTime + when;
    s.buffer = this.lib[k]; s.loop = loop; g.gain.value = vol; s.connect(g).connect(this.bus[bus]); s.start(t);
    if (bus === 'vo') {   // duck the music under the voice
      (this.voSrcs = this.voSrcs || []).push(s);
      const m = this.bus.music.gain; m.setTargetAtTime(.2, t, .12); m.setTargetAtTime(.55, t + s.buffer.duration, .5);
    }
    return s;
  },
  vo(k, when = 0) { return this.play(k, { bus: 'vo', when }); },
  stopVO() { (this.voSrcs || []).forEach(s => { try { s.stop(); } catch (e) {} }); this.voSrcs = []; if (this.bus) this.bus.music.gain.setTargetAtTime(.55, this.ctx.currentTime, .2); },
  startAmbient() {
    if (this.amb || !this.has('amb-space')) return false;
    const m = this.bus.music.gain, t = this.ctx.currentTime;
    m.cancelScheduledValues(t); m.setValueAtTime(0, t); m.linearRampToValueAtTime(.55, t + 3);   // fade the music bus in
    this.amb = this.play('amb-space', { bus: 'music', loop: true, vol: .9 });
    return true;
  },
  set(on) { this.on = on; if (this.master) this.master.gain.setTargetAtTime(on ? .55 : 0, this.ctx.currentTime, .05); },
  blip(f = 880, d = .09, type = 'sine', v = .12, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + d + .05);
  },
  scanStart() {
    if (!this.ctx || this.scan) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 180; f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 6;
    g.gain.value = 0; g.gain.setTargetAtTime(.035, this.ctx.currentTime, .05);
    o.connect(f).connect(g).connect(this.master); o.start();
    this.scan = { o, g, f };
  },
  scanSet(p) { if (this.scan) { this.scan.o.frequency.value = 180 + p * 260; this.scan.f.frequency.value = 700 + p * 2200; } },
  scanStop() {
    if (!this.scan) return; const s = this.scan; this.scan = null;
    s.g.gain.setTargetAtTime(0, this.ctx.currentTime, .04); s.o.stop(this.ctx.currentTime + .3);
  },
  whoosh(d = 2.4, vol = .32) {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * d, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    s.buffer = b; f.type = 'bandpass'; f.Q.value = .8;
    f.frequency.setValueAtTime(120, t); f.frequency.exponentialRampToValueAtTime(1800, t + d * .55); f.frequency.exponentialRampToValueAtTime(200, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + d * .4); g.gain.exponentialRampToValueAtTime(.001, t + d);
    s.connect(f).connect(g).connect(this.master); s.start(t);
    if (vol < .3) return;
    // low door rumble
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(48, t); o.frequency.linearRampToValueAtTime(36, t + d);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.18, t + .3); og.gain.exponentialRampToValueAtTime(.001, t + d * .8);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + d);
  },
  startEngine() {
    if (!this.ctx || this.engine) return;
    const len = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), ch = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; ch[i] = last * 3.5; }
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = b; s.loop = true; f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0;
    s.connect(f).connect(g).connect(this.master); s.start(); this.engine = { g, f };
  },
  setEngine(th) {
    if (!this.engine) return; const t = this.ctx.currentTime;
    this.engine.g.gain.setTargetAtTime(.04 + th * .22, t, .2); this.engine.f.frequency.setTargetAtTime(180 + th * 620, t, .2);
  },
  startDrone() {
    if (!this.ctx || this.drone) return;
    const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.value = 0; g.gain.setTargetAtTime(.05, this.ctx.currentTime, 2.5);
    [55, 82.4, 110.3].forEach((fr, i) => { const o = this.ctx.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = fr; o.detune.value = i * 4; o.connect(f); o.start(); });
    f.connect(g).connect(this.master); this.drone = g;
  },
  // shared one-second noise buffer for clicks and bursts
  noise() {
    if (this.nb) return this.nb;
    const len = this.ctx.sampleRate, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    return (this.nb = b);
  },
  burst(when, dur, type, freq, vol, q = 1) {
    const t = this.ctx.currentTime + when, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * .8); s.stop(t + dur + .02);
  },
  // door opening: filtered noise and a tone rising together
  riser(d = 3.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise(); s.loop = true; f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(4200, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.1, t + d * .85); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + d + .05);
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(98, t); o.frequency.exponentialRampToValueAtTime(392, t + d);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.055, t + d * .8); og.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + d + .05);
  },
  // one short signature per skill, played as its planet arrives
  skill(kind) {
    if (!this.ctx) return;
    const T = this.ctx.currentTime;
    if (kind === 'robotics') {   // servo: two moves and a lock tick
      [[0, 150, 270, .28], [.42, 270, 190, .24]].forEach(([w, f0, f1, d]) => {
        const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), t = T + w;
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + d);
        f.type = 'lowpass'; f.frequency.value = 1300; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + .03); g.gain.linearRampToValueAtTime(.0001, t + d);
        o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + d + .02);
      });
      this.blip(1900, .04, 'square', .03, .7);
    } else if (kind === 'ai') {   // data: a quick run of high blips
      [1319, 1760, 1568, 2093, 1760, 2349, 2637].forEach((f, k) => this.blip(f, .05, 'sine', .045, k * .07));
    } else if (kind === 'coding') {   // typing: irregular key clicks, then a soft enter
      let w = 0; for (let k = 0; k < 8; k++) { this.burst(w, .018, 'highpass', 2400, .09); w += .06 + Math.random() * .06; }
      this.blip(880, .14, 'triangle', .045, w + .08);
    } else if (kind === 'mechanics') {   // ratchet clicks speeding up, then a metallic clank
      let w = 0; for (let k = 0; k < 9; k++) { this.burst(w, .012, 'bandpass', 3200, .08, 4); w += .11 - k * .008; }
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = T + w + .02;
      o.type = 'triangle'; o.frequency.setValueAtTime(196, t); o.frequency.exponentialRampToValueAtTime(98, t + .4);
      g.gain.setValueAtTime(.09, t); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + .55);
      this.burst(w + .02, .08, 'lowpass', 900, .07);
    }
  }
};

/* =====================================================================
   LOCK + BIOMETRIC (2D, GSAP)
   ===================================================================== */
function buildLockArt() {
  // ticks around outer ring
  const ticks = $('#ticks'); let s = '';
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, long = i % 6 === 0, r1 = 186, r2 = long ? 176 : 181;
    s += `<line x1="${200 + Math.cos(a) * r1}" y1="${200 + Math.sin(a) * r1}" x2="${200 + Math.cos(a) * r2}" y2="${200 + Math.sin(a) * r2}" stroke="rgba(233,238,251,${long ? .6 : .25})" stroke-width="1"/>`;
  }
  ticks.innerHTML = s;
  // procedural fingerprint
  const g = $('#fpg'); let p = '';
  const rnd = mulberry(7);
  for (let i = 0; i < 15; i++) {
    const rx = 4 + i * 3.5, ry = 5.5 + i * 4.1, cx = 60 + Math.sin(i * .7) * 1.2, cy = 66 - i * .35;
    const start = Math.PI * (.86 - i * .004) + rnd() * .2, end = Math.PI * (2.14 + i * .004) - rnd() * .2;
    const cuts = 1 + Math.floor(rnd() * 2.2);
    const span = end - start; let a0 = start;
    for (let k = 0; k <= cuts; k++) {
      const a1 = k === cuts ? end : a0 + span / (cuts + 1) * (.8 + rnd() * .35);
      let d = '';
      for (let t = 0; t <= 24; t++) {
        const a = a0 + (a1 - a0) * t / 24, w = 1 + Math.sin(a * 3 + i) * .03;
        const x = cx + Math.cos(a) * rx * w, y = cy + Math.sin(a) * ry * w;
        d += (t ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
      }
      p += `<path d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" data-i="${i}"/>`;
      a0 = a1 + .12 + rnd() * .14;
      if (a0 >= end) break;
    }
  }
  // lower loops
  for (let i = 0; i < 5; i++) {
    const y = 84 + i * 6, d = `M${18 + i * 3} ${y} Q60 ${y - 14 + i * 2} ${102 - i * 3} ${y}`;
    p += `<path d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" data-i="${15 + i}"/>`;
  }
  g.innerHTML = p;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }


/* ---------- detailed blast door (SVG, generated at the real pixel size) ---------- */
function buildDoorArt() {
  const W = Math.ceil(innerWidth / 2), H = innerHeight, D = 26, P = 76;
  const sockR = Math.min(230, innerWidth * .48, innerHeight * .42), cy = H / 2;   // fits short landscape phones too
  const small = innerWidth < 760;
  $$('.door-half .art').forEach((el, si) => {
    const phase = si ? P / 2 : 0, id = 'd' + si;
    let s = `<svg width="${W + D}" height="${H}" viewBox="0 0 ${W + D} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>
      <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16274f"/><stop offset=".55" stop-color="#0e1b3d"/><stop offset="1" stop-color="#0a1432"/></linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#122149"/><stop offset="1" stop-color="#08112a"/></linearGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a72"/><stop offset=".3" stop-color="#d8e2f6"/><stop offset=".55" stop-color="#6d7ca0"/><stop offset="1" stop-color="#1a2444"/></linearGradient>
      <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26355e"/><stop offset=".45" stop-color="#4a5b88"/><stop offset="1" stop-color="#111b38"/></linearGradient>
      <linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d1a3c"/><stop offset=".8" stop-color="#1b2c5c"/><stop offset="1" stop-color="#2a3f78"/></linearGradient>
      <radialGradient id="${id}r" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#b8c6e6"/><stop offset=".45" stop-color="#46557e"/><stop offset="1" stop-color="#0b1430"/></radialGradient>
      <radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#030713"/><stop offset=".7" stop-color="#060d22"/><stop offset=".86" stop-color="#0c1736"/><stop offset=".9" stop-color="#16244c"/><stop offset="1" stop-color="#0a1432"/></radialGradient>
    </defs><rect x="0" y="0" width="${W - D}" height="${H}" fill="#040916"/>`;
    const cols = [0, Math.round(W * .3), Math.round(W * .64), W - D];
    const rows = [0, Math.round(H * .15), Math.round(H * .5), Math.round(H * .84), H];
    for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) {
      const x = cols[c] + 2, y = rows[r] + 2, w = cols[c + 1] - cols[c] - 4, h = rows[r + 1] - rows[r] - 4;
      if (w < 20 || h < 20) continue;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}${(c + r) % 2 ? 'a' : 'b'})"/>`;
      s += `<path d="M${x} ${y + .5}h${w}M${x + .5} ${y}v${h}" stroke="rgba(170,200,255,.16)"/><path d="M${x} ${y + h - .5}h${w}M${x + w - .5} ${y}v${h}" stroke="rgba(0,0,0,.6)"/>`;
      // inner recessed panel on large plates
      if (h > 120 && w > 120) {
        const ix = x + 18, iy = y + 18, iw = w - 36, ih = h - 36;
        s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="rgba(0,0,0,.14)" stroke="rgba(0,0,0,.45)"/><path d="M${ix} ${iy + ih + .5}h${iw}M${ix + iw + .5} ${iy}v${ih}" stroke="rgba(170,200,255,.1)"/>`;
      }
      // corner bolts
      [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]].forEach(([bx, by]) => s += `<circle cx="${bx}" cy="${by}" r="3.2" fill="url(#${id}r)"/><circle cx="${bx}" cy="${by}" r="3.2" fill="none" stroke="rgba(0,0,0,.5)"/>`);
      // rivet rows on the top and bottom bands
      if (r === 0 || r === 3) for (let bx = x + 30; bx < x + w - 24; bx += 30) s += `<circle cx="${bx}" cy="${y + (r ? 9 : h - 9)}" r="2" fill="url(#${id}r)"/>`;
    }
    // vent grille
    { const x = cols[1] + 30, y = rows[3] + 26, w = cols[2] - cols[1] - 60, h = Math.min(rows[4] - rows[3] - 52, 90);
      if (w > 40 && h > 20) { s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#050a18" stroke="rgba(170,200,255,.12)"/>`;
        for (let yy = y + 6; yy < y + h - 4; yy += 7) s += `<rect x="${x + 6}" y="${yy}" width="${w - 12}" height="3" rx="1.5" fill="url(#${id}h)" opacity=".75"/>`; } }
    // status lamps
    if (!small) { const x = cols[1] + 28, y = rows[1] + 40; const lamp = ['#F5A524', '#F5A524', '#17BDE0', '#ff4d4d', '#17BDE0'];
      s += `<rect x="${x - 10}" y="${y - 12}" width="${lamp.length * 22 + 8}" height="24" rx="12" fill="#050a18" stroke="rgba(170,200,255,.12)"/>`;
      lamp.forEach((c, k) => s += `<circle cx="${x + 4 + k * 22}" cy="${y}" r="4.5" fill="${c}" ${k === 3 ? 'class="blink"' : ''} style="filter:drop-shadow(0 0 5px ${c})"/>`);
      if (!si) s += `<text x="${x - 6}" y="${y + 30}" fill="rgba(233,238,251,.35)" font-family="Chakra Petch, Inter, sans-serif" font-weight="600" font-size="10" letter-spacing="1.5">PWR · LCK · AIR · SEAL · NAV</text>`; }
    // vertical LED channel
    { const x = W - D - 52, y0 = rows[1] + 12, y1 = rows[3] - 12;
      s += `<rect x="${x - 5}" y="${y0}" width="10" height="${y1 - y0}" rx="5" fill="#03060f" stroke="rgba(170,200,255,.1)"/>`;
      let k = 0; for (let y = y0 + 8; y < y1 - 14; y += 20, k++) { if (Math.abs(y - cy) < sockR + 8) continue; s += `<rect class="led" style="animation-delay:${(k * .09).toFixed(2)}s" x="${x - 2}" y="${y}" width="4" height="12" rx="2" fill="#17BDE0"/>`; } }
    // horizontal amber strip
    s += `<rect x="${cols[0] + 22}" y="${rows[2] - 3}" width="${cols[2] - cols[0] - 44}" height="3" fill="#F5A524" opacity=".22"/>`;
    // hydraulic pistons above and below the socket
    [cy - sockR - 125, cy + sockR + 125].forEach(py => {
      if (py < 90 || py > H - 90) return;
      const x0 = Math.max(cols[2] + 10, W - D - 280), x1 = W - D - 90;
      if (x1 - x0 < 60) return;
      s += `<rect x="${x0}" y="${py - 13}" width="${x1 - x0}" height="26" rx="13" fill="url(#${id}h)" stroke="rgba(0,0,0,.6)"/>`;
      s += `<rect x="${x1 - 4}" y="${py - 5}" width="${W - D - 30 - x1}" height="10" rx="2" fill="url(#${id}c)"/>`;
      s += `<rect x="${W - D - 34}" y="${py - 18}" width="16" height="36" rx="3" fill="url(#${id}h)" stroke="rgba(0,0,0,.6)"/>`;
      s += `<circle cx="${x0 + 16}" cy="${py}" r="5" fill="url(#${id}r)"/><rect x="${x0 + 30}" y="${py - 1}" width="${x1 - x0 - 50}" height="2" fill="rgba(255,255,255,.12)"/>`;
    });
    // interlocking jaws on the seam (gaps are transparent so the other half shows through)
    for (let y = -P + phase; y < H + P; y += P) {
      s += `<path d="M${W - D} ${y} L${W + D - 4} ${y + 10} L${W + D - 4} ${y + P / 2 - 10} L${W - D} ${y + P / 2} Z" fill="url(#${id}t)" stroke="rgba(0,0,0,.55)"/>`;
      s += `<path d="M${W - D} ${y + .5} L${W + D - 4} ${y + 10.5}" stroke="rgba(170,200,255,.25)"/>`;
      s += `<rect x="${W + D - 7}" y="${y + 12}" width="3" height="${P / 2 - 24}" fill="#FCA01B" opacity=".55"/>`;
    }
    // lock socket recess with bolt ring
    s += `<circle cx="${W}" cy="${cy}" r="${sockR}" fill="url(#${id}s)"/>`;
    s += `<circle cx="${W}" cy="${cy}" r="${sockR - 1}" fill="none" stroke="rgba(170,200,255,.16)" stroke-width="2"/>`;
    s += `<circle cx="${W}" cy="${cy}" r="${sockR * .9}" fill="none" stroke="rgba(34,211,238,.28)" stroke-width="1.5" stroke-dasharray="3 9"/>`;
    for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; s += `<circle cx="${(W + Math.cos(a) * (sockR - 14)).toFixed(1)}" cy="${(cy + Math.sin(a) * (sockR - 14)).toFixed(1)}" r="3.4" fill="url(#${id}r)"/>`; }
    // serial stencil (left half only, so it never reads mirrored)
    if (!si && !small) s += `<text x="${cols[0] + 26}" y="${rows[2] + 10 + Math.min(150, H * .16)}" fill="rgba(233,238,251,.05)" font-family="Chakra Petch, Arial" font-weight="700" font-size="${Math.min(190, H * .2)}" letter-spacing="-6">03</text>`;
    s += '</svg>';
    el.innerHTML = s;
  });
}

const lockState = { phase: 'idle', scan: 0, tween: null };
let ringSpin = [], entranceTl = null;

function initLock() {
  buildLockArt(); buildDoorArt();
  addEventListener('resize', () => { if ($('#door').style.display !== 'none') buildDoorArt(); });
  // idle ring motion
  if (!REDUCED) {
    ringSpin = [
      gsap.to('.r1', { rotation: 360, duration: 90, repeat: -1, ease: 'none', svgOrigin: '200 200' }),
      gsap.to('.r2', { rotation: -360, duration: 40, repeat: -1, ease: 'none', svgOrigin: '200 200' }),
      gsap.to('.r3', { rotation: 360, duration: 26, repeat: -1, ease: 'none', svgOrigin: '200 200' }),
      gsap.to('.r4', { rotation: -360, duration: 60, repeat: -1, ease: 'none', svgOrigin: '200 200' })
    ];
    gsap.fromTo('.core-pulse', { scale: 1, opacity: .7 }, { scale: 1.5, opacity: 0, duration: 1.8, repeat: -1, ease: 'power2.out' });
  }
  // entrance
  const tl = entranceTl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('.door-half.l', { xPercent: -6, duration: 1.4 }, 0)
    .from('.door-half.r', { xPercent: 6, duration: 1.4 }, 0)
    .from('.ring', { scale: .6, opacity: 0, duration: 1.4, stagger: .08, svgOrigin: '200 200' }, .2)
    .from('#core', { scale: .7, opacity: 0, duration: 1.2 }, .35)
    .from('.lock-title > *, .lock-caption > *', { y: 10, opacity: 0, duration: 1, stagger: .08 }, .6)
    .from('#skip', { opacity: 0, duration: 1 }, 1);

  const core = $('#core');
  const down = e => {
    e.preventDefault();
    Sound.init();
    if (lockState.phase === 'idle') toBiometric();
  };
  // one tap: the fingerprint draws, scans by itself, and the door opens
  core.addEventListener('pointerdown', down);
  core.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e); });
  $('#skip').addEventListener('click', () => { Sound.init(); if (briefTl) return finishBriefing(); grant(true); });
}

function toBiometric() {
  lockState.phase = 'locking';
  Sound.blip(660, .08, 'sine', .14); Sound.blip(990, .12, 'sine', .1, .09);
  ringSpin.forEach(t => t.timeScale(6));
  gsap.delayedCall(.7, () => ringSpin.forEach(t => gsap.to(t, { timeScale: 1, duration: 1.2 })));
  const tl = gsap.timeline();
  tl.to('#core .glyph', { opacity: 0, scale: .6, duration: .35, ease: 'power2.in', onComplete: () => { lockState.phase = 'bio'; } })
    .to('#core .fp', { opacity: 1, duration: .4 }, '-=.05')
    .to('#core .fp path', { attr: { 'stroke-dashoffset': .8 }, duration: .9, stagger: .012, ease: 'power2.out' }, '<')
    .add(() => { $('#cap2').textContent = 'Verifying cadet'; }, '<')
    .add(startScan, '-=.5');
}

/* ---------- mission briefing: Destination 2040, route uncharted ----------
   The hook between the scan and the door. Timed to the voice-over when it has loaded. */
let briefTl = null, briefDone = null;
const BRIEF_JOBS = ['Data analyst', 'App developer', 'Drone pilot', 'Cloud engineer', 'AI trainer', 'Robotics technician'];
function runBriefing(done) {
  briefDone = done;
  const B = $('#brief'); B.hidden = false;
  $('#bfJobs').innerHTML = BRIEF_JOBS.map(j => `<li>${j}</li>`).join('');
  buildRouteArt();
  const d = (k, f) => Sound.dur(k) || f;
  const show = sel => tl.set(sel, { visibility: 'visible' }).fromTo(sel, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .5, ease: 'expo.out' }, '<');
  const hide = sel => tl.to(sel, { opacity: 0, y: -8, duration: .35, ease: 'power2.in' }).set(sel, { visibility: 'hidden' });
  const tl = briefTl = gsap.timeline({ onComplete: () => finishBriefing() });
  tl.to('.lock-title, .lock-caption, .readout', { opacity: 0, duration: .4 }, 0)
    .to('#lock svg.rings', { opacity: .18, duration: .6 }, 0)
    .to(B, { opacity: 1, duration: .5 }, .15)
    .fromTo('.bf-frame i', { scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1, duration: .7, ease: 'expo.out', stagger: .05 }, .2);
  // 1 · destination: 2040, then the cursor blinks twice
  const tY = Math.max(.8, d('vo-granted', 1.85) + .4);
  tl.addLabel('s1', .45); show('#bfS1'); tl.set('.bf-year span', { opacity: 0 }, 's1');
  tl.to('.bf-year span', { opacity: 1, duration: .05, stagger: .12, onStart: () => Sound.vo('vo-brief-dest') }, tY);
  [0, .45].forEach(o => { tl.to('.bf-cur', { opacity: 0, duration: .01 }, tY + .7 + o).to('.bf-cur', { opacity: 1, duration: .01 }, tY + .92 + o).add(() => Sound.blip(1480, .05, 'sine', .07), tY + .7 + o); });
  // 2 · today's job titles decode into the unknown while the narrator speaks
  const t2 = tY + Math.max(d('vo-brief-dest', 2.2), 1.6) + .2;
  hide('#bfS1'); tl.addLabel('s2', t2); tl.set('#bfS2', { visibility: 'visible' }, t2).fromTo('#bfS2', { opacity: 0 }, { opacity: 1, duration: .4 }, t2);
  tl.add(() => { Sound.play('sfx-scramble', { vol: .8 }); scrambleJobs(); }, t2 + .35);
  tl.fromTo('#bfA', { yPercent: 110 }, { yPercent: 0, duration: .9, ease: 'expo.out', onStart: () => Sound.vo('vo-brief-1') }, t2 + .8);
  // 3 · the question
  const t3 = t2 + .8 + d('vo-brief-1', 3) + .35;
  tl.to('#bfS2', { opacity: 0, duration: .35 }, t3).set('#bfS2', { visibility: 'hidden' });
  tl.set('#bfS3', { visibility: 'visible', opacity: 1 }, t3 + .35)
    .fromTo('#bfS3 .mask>span', { yPercent: 110 }, { yPercent: 0, duration: 1, stagger: .14, ease: 'expo.out', onStart: () => Sound.vo('vo-brief-2') }, t3 + .4);
  // 4 · plotting the route through the four skills, then the door
  const t4 = t3 + .4 + d('vo-brief-2', 3.1) + .25;
  tl.to('#bfS3', { opacity: 0, duration: .35 }, t4).set('#bfS3', { visibility: 'hidden' });
  // SKAI Bot names the four skills; each node lights as it is named
  const tr = d('vo-brief-route', 1.6);
  tl.set('#bfS4', { visibility: 'visible', opacity: 1 }, t4 + .3)
    .add(() => { Sound.play('sfx-route', { vol: .55 }); Sound.vo('vo-brief-route', .15); }, t4 + .3)
    .fromTo('#bfPath', { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, duration: Math.max(1.1, tr - .2), ease: 'power1.inOut' }, t4 + .35)
    .fromTo('#bfRoute .node', { opacity: 0 }, { opacity: 1, duration: .35, stagger: Math.max(.26, (tr - .9) / 4), ease: 'power2.out' }, t4 + .3 + Math.min(1.1, tr * .28))
    .to(B, { opacity: 0, duration: .4, ease: 'power2.in' }, t4 + .45 + Math.max(1.6, tr + .2));
}
function finishBriefing() {
  if (!briefTl) return;
  const done = briefDone; briefTl.kill(); briefTl = null; briefDone = null;
  Sound.stopVO();
  const B = $('#brief'); gsap.to(B, { opacity: 0, duration: .25, onComplete: () => { B.hidden = true; } });
  if (done) done();
}
// job titles flicker through glyphs and settle on UNKNOWN, one after another
function scrambleJobs() {
  const G = '▒░▓<>/#%01?XΣΛ', lis = $$('#bfJobs li');
  lis.forEach((li, i) => {
    const text = li.textContent.toUpperCase(), o = { p: 0 };
    gsap.to(o, { p: 1, duration: .9, delay: i * .13, ease: 'none',
      onUpdate: () => { li.textContent = [...text].map((ch, k) => ch === ' ' ? ' ' : (k / text.length < o.p ? G[(Math.random() * G.length) | 0] : ch)).join(''); },
      onComplete: () => { li.textContent = 'UNKNOWN'; li.classList.add('unk'); } });
  });
}
// a dotted route through four nodes, one per skill, in the skill colours
// wide screens: a left-to-right route; narrow screens: top to bottom, labels beside the nodes (stay readable on phones)
function buildRouteArt() {
  const svg = $('#bfRoute'), tall = innerWidth < 600;
  let xs, ys, d, label;
  if (tall) {
    xs = [70, 150, 70, 150]; ys = [40, 125, 210, 295];
    d = 'M110 0 C 110 20 70 20 ' + xs[0] + ' ' + ys[0] + ys.slice(1).map((y, i) => ` S ${xs[i + 1]} ${y - 45} ${xs[i + 1]} ${y}`).join('');
    label = (i, name) => `<text x="${xs[i] + (i % 2 ? -34 : 34)}" y="${ys[i] + 6}" text-anchor="${i % 2 ? 'end' : 'start'}">${name}</text>`;
    svg.setAttribute('viewBox', '0 0 300 330');
  } else {
    xs = [70, 237, 403, 570]; ys = [78, 38, 82, 42];
    d = 'M10 100 C 40 100 50 ' + ys[0] + ' ' + xs[0] + ' ' + ys[0] + xs.slice(1).map((x, i) => ` S ${x - 70} ${ys[i + 1]} ${x} ${ys[i + 1]}`).join('');
    label = (i, name) => `<text x="${xs[i]}" y="${ys[i] < 60 ? ys[i] - 32 : ys[i] + 44}" text-anchor="middle">${name}</text>`;
    svg.setAttribute('viewBox', '0 0 640 130');
  }
  svg.innerHTML = `<path id="bfPath" d="${d}" fill="none" stroke="#B8D8F4" stroke-width="2" stroke-dasharray="1" pathLength="1" stroke-dashoffset="1" opacity=".9"/>` +
    CONFIG.values.map((v, i) => { const sk = SKILLS[v.skill]; return `<g class="node"><circle cx="${xs[i]}" cy="${ys[i]}" r="13" fill="${sk.color}" stroke="#fff" stroke-width="2"/><circle cx="${xs[i]}" cy="${ys[i]}" r="22" fill="none" stroke="${sk.ink}" stroke-opacity=".5"/>${label(i, sk.name.toUpperCase())}</g>`; }).join('');
}

function setScan(v) {
  lockState.scan = v;
  $('#prog').setAttribute('stroke-dashoffset', 1 - v);
  const paths = $$('#core .fp path'); const n = paths.length;
  paths.forEach((p, k) => {
    const local = MathUtils.clamp(v * 1.35 - k / n * .35, 0, 1);
    p.setAttribute('stroke-dashoffset', .8 * (1 - local));
  });
  $('#ridge').textContent = String(Math.round(v * 42)).padStart(2, '0') + '/42';
  const lis = $$('.readout li');
  [.02, .25, .6, .98].forEach((th, i) => lis[i].classList.toggle('on', v >= th));
  Sound.scanSet(v);
}

function startScan() {
  lockState.phase = 'scanning';
  if (!Sound.play('sfx-scan', { vol: .8 })) Sound.scanStart();
  $('#cap1').textContent = 'Scanning';
  gsap.to('#core .scanline', { opacity: 1, duration: .2 });
  gsap.fromTo('#core .scanline', { top: '18%' }, { top: '82%', duration: .7, repeat: -1, yoyo: true, ease: 'sine.inOut', id: 'scanY' });
  lockState.tween?.kill();
  const o = { v: lockState.scan };
  lockState.tween = gsap.to(o, {
    v: 1, duration: 1.4 * (1 - lockState.scan), ease: 'none',
    onUpdate: () => setScan(o.v),
    onComplete: () => grant(false)
  });
}

function grant(skipped) {
  if (lockState.phase === 'granted') return;
  lockState.phase = 'granted';
  lockState.tween?.kill(); gsap.getById('scanY')?.kill(); Sound.scanStop();
  setScan(1);
  $('#core').classList.add('granted'); document.body.classList.add('granted');
  $('#prog').style.stroke = 'var(--ok)';
  $('.lock-caption .dot').style.background = 'var(--ok)';
  $('.lock-caption .dot').style.boxShadow = '0 0 10px var(--ok)';
  $('#cap1').textContent = 'Access granted';
  $('#cap2').textContent = 'Welcome aboard, cadet';
  gsap.to('#core .scanline', { opacity: 0, duration: .2 });
  if (!Sound.play('sfx-granted')) { Sound.blip(784, .18, 'sine', .14); Sound.blip(1175, .32, 'sine', .12, .12); }
  if (!skipped) Sound.vo('vo-granted', .25);
  if (skipped) gsap.delayedCall(.1, openDoor); else gsap.delayedCall(.5, () => runBriefing(openDoor));
}

/* =====================================================================
   THREE.JS SPACE
   ===================================================================== */
const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*snoise(p);p*=2.02;a*=.5;}return s;}
`;

const SUN = new Vector3(-520, 260, -980);
const LIGHT = new Vector3(-760, 420, 160);
let renderer, scene, camera, clock, planets = [], stars, warp, bird, nebula = [];
let posCurve, lookCurve;
const state = { p: 0, stop: 0, warp: 0, intro: 0, mx: 0, my: 0, tmx: 0, tmy: 0, rendering: false, inSpace: false, t0: 0, fovBase: 38, rIntro: 0, shake: 0, fovPunch: 0, auto: false, legWarp: 0 };

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(160,200,255,.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(.18, mid); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}
function nebulaTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry(seed);
  for (let i = 0; i < 22; i++) {
    const px = 128 + (r() - .5) * 130, py = 128 + (r() - .5) * 130, rad = 30 + r() * 80;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(255,255,255,${.05 + r() * .09})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  const m = x.createRadialGradient(128, 128, 0, 128, 128, 128); m.addColorStop(0, '#000'); m.addColorStop(.55, 'rgba(0,0,0,.6)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-in'; x.fillStyle = m; x.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

// builds the 3D world a step at a time (yielding a frame between steps) so the lock stays responsive while it builds
async function initThree() {
  const canvas = $('#gl');
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { document.body.classList.add('no-webgl'); return false; }
  // if the browser resets WebGL (GPU memory pressure, a driver hiccup, a phone backgrounding the tab),
  // ask for the context back and re-bake the sky and planets, whose render targets are wiped
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); state.ctxLost = true; });
  canvas.addEventListener('webglcontextrestored', async () => {
    await nextFrame();
    bakeSky(); await bakePlanets(); renderer.compile(scene, camera);
    state.ctxLost = false;
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x02060f);
  scene = new Scene();
  camera = new PerspectiveCamera(55, innerWidth / innerHeight, .1, 4000);
  scene.add(camera);
  clock = { last: performance.now(), t: 0 };

  for (const step of [buildStars, buildNebula, buildDust, buildPlanets, () => { buildSkillCues(); buildRings(); }, buildEarth, () => { buildWarp(); buildBird(); }, buildRocket, buildExhaust]) { step(); await nextFrame(); }
  const amb = new AmbientLight(0x6b86c9, .55); scene.add(amb);
  const dl = new DirectionalLight(0xffffff, 2.2); dl.position.copy(LIGHT).normalize(); scene.add(dl);
  const fill = new DirectionalLight(0x9db6ff, 1.1); fill.position.set(.6, -.2, .8); scene.add(fill);
  buildPath();
  buildPost();
  return true;
}

/* ---------- post-processing: bloom, chromatic fringe, vignette, grain ---------- */
let composer, bloom, finish, fxaa = null, lensflare, bakeSky = () => {};
// level: which effects are on (2 all, 1 lighter, 0 minimal) · pr: render resolution, adjusted every second to hold the frame rate
const Q = { level: 2, pr: 1, maxPr: 2, minPr: 1, acc: 0, frames: 0, up: 0, cool: 2, touch: false };
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, ca: { value: .0015 }, vig: { value: .42 }, grain: { value: .035 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float time,ca,vig,grain;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 d=vUv-.5;float r=dot(d,d);
      vec3 c=vec3(texture2D(tDiffuse,vUv-d*ca*r*8.).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv+d*ca*r*8.).b);
      c*=1.-vig*smoothstep(.08,.55,r);
      c+=(h(vUv*vec2(1920.,1080.)+fract(time)*97.)-.5)*grain;
      gl_FragColor=vec4(c,1.);}`
};
function buildPost() {
  const touch = Q.touch = matchMedia('(hover: none)').matches || innerWidth < 760;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
  // anti-aliasing: 4x multisampling on desktop (the composer's own targets), a cheap FXAA pass on phones
  // anti-aliasing: FXAA on phones and standard-density screens; Retina-class screens are already supersampled.
  // No MSAA: the lens flare copies from the render target, which is illegal on a multisampled buffer
  // (it produced black / partial frames), and multisampled buffers at 2x cost hundreds of MB of GPU memory.
  composer = new EffectComposer(renderer, new WebGLRenderTarget(innerWidth, innerHeight, { type: HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new Vector2(innerWidth, innerHeight), .6, .4, .82);   // crisper: less radius, higher threshold
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  if (touch || devicePixelRatio < 1.5) { fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa); }
  finish = new ShaderPass(FinishShader); composer.addPass(finish);
  // render resolution: start sharp, then adapt (watchFrameRate)
  Q.maxPr = Math.min(devicePixelRatio, touch ? 2 : 1.75); Q.minPr = Math.min(devicePixelRatio, 1);
  Q.pr = Math.min(Q.maxPr, touch ? (weak ? 1.25 : 1.5) : weak ? 1.5 : 1.75);
  if (CAPTURE) Q.pr = Q.maxPr;
  renderer.setPixelRatio(Q.pr);
  setQuality(CAPTURE ? 2 : touch ? (weak ? 0 : 1) : weak ? 1 : 2);
}
function setPR(pr) { Q.pr = pr; renderer.setPixelRatio(pr); applySize(); }
function setQuality(l) {
  Q.level = l;
  bloom.enabled = l > 0; bloom.strength = l === 2 ? .6 : .5;
  finish.uniforms.grain.value = l === 2 && !Q.touch ? .018 : 0;   // no grain on phones
  if (lensflare) lensflare.visible = l > 0;
  // the cloud and aurora shaders are the most expensive per pixel: drop them at the lowest level
  planets.forEach(p => { if (p.clouds) p.clouds.visible = l > 0; if (p.aurora) p.aurora.visible = l > 0; });
  applySize();
  document.documentElement.dataset.quality = l;
}
// one place for render sizes: canvas, composer, and bloom (half resolution below the top level)
function applySize() {
  const pr = renderer.getPixelRatio(), bs = Q.touch ? .4 : Q.level === 2 ? 1 : .5;   // bloom buffers: lighter on phones
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth * pr * bs, innerHeight * pr * bs);
  if (fxaa) fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  scene.traverse(o => { const u = o.material && o.material.uniforms; if (u && u.pr) u.pr.value = pr; });   // point sprites keep their size
}
// adaptive resolution: every second, step down (or up, after 3 smooth seconds) to hold ~50-60 fps;
// effects only switch off once resolution is already at 1x
function watchFrameRate(raw) {
  if (CAPTURE) return;
  if (!state.rendering || raw > .25) return;   // from the door opening on; ignore tab switches
  Q.acc += raw; Q.frames++;
  if (Q.acc < 1) return;
  const ft = Q.acc / Q.frames; Q.acc = 0; Q.frames = 0;
  if (Q.cool > 0) { Q.cool--; return; }
  if (ft > 1 / 48) {
    if (Q.pr > Q.minPr + .01) setPR(Math.max(Q.minPr, +(Q.pr * (ft > 1 / 30 ? .7 : .85)).toFixed(2)));   // far too slow: a bigger step
    else if (Q.level > 0) setQuality(Q.level - 1);
    Q.up = 0; Q.cool = 2;
    Q.downs = (Q.downs || 0) + 1;
  } else if (ft < 1 / 56) {
    if (++Q.up >= (Q.downs > 1 ? 8 : 4) && Q.pr < Q.maxPr - .01) { setPR(Math.min(Q.maxPr, +(Q.pr + .15).toFixed(2))); Q.up = 0; Q.cool = 2; }
  } else Q.up = 0;
}

function buildStars() {
  const n = innerWidth < 760 ? 3400 : 6000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), tw = new Float32Array(n);
  const r = mulberry(3), palette = [new Color('#ffffff'), new Color('#cfe0ff'), new Color('#9cc3ff'), new Color('#ffd9b0')];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 700 + r() * 700, s = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(th) * s * rad; pos[i * 3 + 1] = u * rad * .8; pos[i * 3 + 2] = Math.sin(th) * s * rad - 220;
    const c = palette[r() < .7 ? 0 : r() < .6 ? 1 : r() < .6 ? 2 : 3]; col.set([c.r, c.g, c.b], i * 3);
    size[i] = r() < .97 ? 1.2 + r() * 2.4 : 4 + r() * 3; tw[i] = r();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('size', new BufferAttribute(size, 1)); g.setAttribute('tw', new BufferAttribute(tw, 1));
  const m = new ShaderMaterial({
    uniforms: { time: { value: 0 }, pr: { value: renderer.getPixelRatio() }, fade: { value: 1 } },
    vertexShader: `attribute float size;attribute float tw;attribute vec3 color;uniform float time;uniform float pr;varying vec3 vC;varying float vA;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*pr*(1150./-mv.z);vA=.6+.4*sin(time*(.6+tw*2.2)+tw*60.);vC=color;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vC;varying float vA;uniform float fade;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.0,d);a=a*a;gl_FragColor=vec4(vC*a*vA*fade,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  stars = new Points(g, m); scene.add(stars);
}

function buildNebula() {
  // full-sky procedural nebula + galactic band, rendered once into a cube map
  const size = innerWidth < 760 ? 512 : 1024;
  const rt = new WebGLCubeRenderTarget(size);
  const cubeCam = new CubeCamera(1, 6000, rt);
  const skyScene = new Scene();
  const skyMat = new ShaderMaterial({
    uniforms: { sun: { value: SUN.clone().normalize() } },
    vertexShader: `varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: NOISE + `
      uniform vec3 sun;varying vec3 vD;
      float h31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      void main(){
        vec3 d=normalize(vD);
        vec3 q=d*2.1;
        vec3 w=vec3(fbm(q+1.7),fbm(q+9.2),fbm(q+4.1));
        float n1=fbm(q*1.25+w*1.7);
        float n2=fbm(q*2.6-w*1.2+5.);
        vec3 gn=normalize(vec3(.35,1.,-.3));
        float gd=dot(d,gn);
        float band=exp(-gd*gd/.05);
        float lanes=smoothstep(.05,.55,fbm(d*5.5+w*2.2+11.));
        vec3 col=vec3(.0004,.0009,.0028);
        col+=vec3(.006,.018,.068)*pow(smoothstep(.0,.9,n1),2.6);
        col+=vec3(.002,.032,.040)*pow(smoothstep(.3,.95,n2),2.8);
        col+=vec3(.042,.006,.050)*pow(smoothstep(.4,1.,n1*.6+n2*.6),3.);
        float bandN=exp(-gd*gd/.018);
        col+=vec3(.014,.017,.028)*bandN*(.3+.7*smoothstep(-.2,.8,n2))*(1.-.9*lanes);
        col+=vec3(.030,.026,.024)*exp(-gd*gd/.003)*(1.-lanes);
        float sd=max(dot(d,sun),0.);
        col+=vec3(1.,.55,.25)*pow(sd,14.)*.05+vec3(1.,.42,.18)*pow(sd,4.)*.004;
        // stars are drawn as sharp points (buildStars), not baked into this texture
        gl_FragColor=vec4(col,1.);
      }`,
    side: BackSide, depthWrite: false
  });
  const sky = new Mesh(new SphereGeometry(3000, 64, 32), skyMat); skyScene.add(sky);
  // re-runnable: render-target contents are wiped if the browser resets WebGL
  bakeSky = () => {
    cubeCam.update(renderer, skyScene);
    scene.background = rt.texture;
    // metals (rocket, gears, robot arm) reflect the real sky: one PMREM pass
    const pm = new PMREMGenerator(renderer); if (scene.environment) scene.environment.dispose();
    scene.environment = pm.fromCubemap(rt.texture).texture; pm.dispose();
  };
  bakeSky();
  scene.environmentIntensity = 2.4;
  // a distant spiral galaxy
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry(17);
  const cg = x.createRadialGradient(128, 128, 0, 128, 128, 40); cg.addColorStop(0, 'rgba(255,240,220,.9)'); cg.addColorStop(1, 'rgba(255,200,150,0)'); x.fillStyle = cg; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const arm = i % 2, t = Math.pow(r(), .7) * 3.2, a = t * 2.2 + arm * Math.PI + (r() - .5) * .5, rr = 8 + t * 34 + (r() - .5) * 10;
    x.fillStyle = r() < .2 ? 'rgba(255,190,150,.5)' : 'rgba(170,200,255,.45)';
    x.fillRect(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr * .55, 1.2, 1.2);
  }
  const gt = new CanvasTexture(c); gt.colorSpace = SRGBColorSpace;
  const gal = new Sprite(new SpriteMaterial({ map: gt, transparent: true, opacity: .75, depthWrite: false, blending: AdditiveBlending, rotation: .5 }));
  gal.position.set(820, 420, -1500); gal.scale.set(300, 300, 1); scene.add(gal); nebula.push(gal);
  // sun + lens flare
  const sunS = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,250,240,1)', 'rgba(255,170,90,.35)'), transparent: true, depthWrite: false, blending: AdditiveBlending }));
  sunS.position.copy(SUN); sunS.scale.set(200, 200, 1); scene.add(sunS);
  const ring = (() => { const k = document.createElement('canvas'); k.width = k.height = 128; const y = k.getContext('2d'), gg = y.createRadialGradient(64, 64, 40, 64, 64, 62); gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(.7, 'rgba(255,255,255,.35)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); y.fillStyle = gg; y.fillRect(0, 0, 128, 128); const t = new CanvasTexture(k); return t; })();
  const hex = (() => { const k = document.createElement('canvas'); k.width = k.height = 128; const y = k.getContext('2d'); y.fillStyle = 'rgba(255,255,255,.22)'; y.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; y.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); } y.closePath(); y.fill(); return new CanvasTexture(k); })();
  const main = glowTexture('rgba(255,248,235,1)', 'rgba(255,190,130,.3)');
  const lf = new Lensflare();
  lf.addElement(new LensflareElement(main, 420, 0, new Color(1, .9, .8)));
  lf.addElement(new LensflareElement(hex, 60, .38, new Color(.08, .18, .25)));
  lf.addElement(new LensflareElement(ring, 130, .55, new Color(.13, .11, .22)));
  lf.addElement(new LensflareElement(hex, 90, .72, new Color(.2, .11, .05)));
  lf.addElement(new LensflareElement(hex, 44, .9, new Color(.05, .18, .16)));
  lf.addElement(new LensflareElement(ring, 220, 1.05, new Color(.08, .12, .22)));
  const anchor = new Object3D(); anchor.position.copy(SUN); anchor.add(lf); scene.add(anchor); lensflare = lf;
}

function buildBelt(p) {
  const n = innerWidth < 760 ? 160 : 300, r = p.v.r, rnd = mulberry(31);
  const mesh = new InstancedMesh(new DodecahedronGeometry(1, 0), new MeshStandardMaterial({ color: 0x8a7468, roughness: .95, metalness: .05, flatShading: true }), n);
  const o = new Object3D();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, rr = r * (2.05 + rnd() * .9), sc = (.06 + Math.pow(rnd(), 3) * .42) * r / 6;
    o.position.set(Math.cos(a) * rr, (rnd() - .5) * .9, Math.sin(a) * rr);
    o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); o.scale.set(sc * (.7 + rnd() * .6), sc * (.7 + rnd() * .6), sc * (.7 + rnd() * .6));
    o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
  }
  const g = new Group(); g.rotation.set(-.32, 0, .18); g.add(mesh); p.group.add(g); p.belt = g;
}

function buildAurora(p) {
  const r = p.v.r, m = new ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv;varying vec3 vP;void main(){vUv=uv;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: NOISE + `uniform float time;varying vec2 vUv;varying vec3 vP;void main(){
      float a=atan(vP.z,vP.x);float n=snoise(vec3(a*2.2,vUv.y*1.5,time*.25));
      float curtain=pow(.5+.5*sin(a*9.+n*3.+time*.6),3.)*.7+.3*smoothstep(.2,.9,n);
      float fade=smoothstep(0.,.2,vUv.y)*(1.-smoothstep(.45,1.,vUv.y));
      vec3 c=mix(vec3(.15,1.,.6),vec3(.3,.7,1.),vUv.y);c=mix(c,vec3(.7,.35,1.),smoothstep(.65,1.,vUv.y));
      gl_FragColor=vec4(c*curtain*fade*1.6,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide
  });
  const g = new CylinderGeometry(r * .36, r * .5, r * .32, 128, 1, true);
  const au = new Mesh(g, m); au.position.y = r * .9; p.body.add(au); p.aurora = au;
}
function buildMoons(p) {
  const r = p.v.r, sys = new Group(), pair = new Group();
  const mat = c => new MeshStandardMaterial({ color: c, roughness: .85, metalness: .05 });
  const a = new Mesh(new SphereGeometry(r * .17, 32, 24), mat(0xb9c4e0)); a.position.x = r * .34;
  const b = new Mesh(new SphereGeometry(r * .12, 32, 24), mat(0x8f9bd0)); b.position.x = -r * .48;
  pair.add(a, b); pair.position.x = r * 2.45; sys.add(pair);
  const pts = []; for (let k = 0; k <= 128; k++) { const t = k / 128 * Math.PI * 2; pts.push(new Vector3(Math.cos(t) * r * 2.45, 0, Math.sin(t) * r * 2.45)); }
  const orbit = new LineLoop(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: 0x8b9bff, transparent: true, opacity: .1 }));
  sys.add(orbit); sys.rotation.set(.32, 0, -.12); p.group.add(sys); p.moons = { sys, pair };
}
function buildIndiaLights() {
  const p = planets[CONFIG.values.length - 1]; if (!p || !frames.length) return;
  if (p.india) { p.group.remove(p.india); }
  // approximate state and UT capitals (lat, lon)
  const C = [[34.08,74.8],[32.7,74.9],[34.2,77.6],[31.1,77.17],[30.73,76.78],[30.32,78.03],[28.61,77.21],[26.91,75.79],[26.85,80.95],[25.6,85.14],[27.33,88.61],[26.14,91.74],[27.08,93.61],[25.67,94.11],[24.82,93.94],[23.73,92.72],[23.83,91.28],[25.57,91.88],[22.57,88.36],[23.34,85.31],[20.3,85.82],[21.25,81.63],[23.26,77.41],[23.22,72.64],[19.08,72.88],[17.39,78.49],[16.51,80.52],[15.49,73.83],[12.97,77.59],[13.08,80.27],[11.94,79.81],[8.52,76.94],[10.57,72.64],[11.62,92.73],[20.4,72.83]];
  const P = p.group.position, F = frames[CONFIG.values.length].pos.clone().sub(P).normalize();
  F.add(new Vector3(.25, .15, 0)).normalize();
  const Rt = new Vector3().crossVectors(UP, F).normalize(), Up = new Vector3().crossVectors(F, Rt).normalize();
  const k = .028, r = p.v.r * 1.006;
  const pos = C.map(([la, lo]) => F.clone().addScaledVector(Rt, (lo - 80) * k).addScaledVector(Up, (la - 22) * k).normalize().multiplyScalar(r));
  const g = new BufferGeometry().setFromPoints(pos);
  g.setAttribute('seed', new BufferAttribute(new Float32Array(pos.map(() => Math.random())), 1));
  const pm = new ShaderMaterial({
    uniforms: { time: { value: 0 }, pr: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float seed;uniform float time,pr;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=.65+.35*sin(time*2.+seed*30.);gl_PointSize=(3.+seed*2.)*pr*vA*(70./-mv.z)*1.4;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vec3(1.,.86,.55)*a*a*vA*2.2,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  const group = new Group(); group.add(new Points(g, pm));
  // network: link each capital to its two nearest neighbours, with pulses running along each link
  const seg = [], tt = [];
  pos.forEach((a, i) => {
    pos.map((b, j) => [j, a.distanceTo(b)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2).forEach(([j]) => {
      if (j < i && pos[j].distanceTo(a) < 1e-6) return;
      for (let q = 0; q < 8; q++) { const u0 = q / 8, u1 = (q + 1) / 8; seg.push(a.clone().lerp(pos[j], u0).normalize().multiplyScalar(r), a.clone().lerp(pos[j], u1).normalize().multiplyScalar(r)); tt.push(u0, u1); }
    });
  });
  const lg = new BufferGeometry().setFromPoints(seg); lg.setAttribute('tt', new BufferAttribute(new Float32Array(tt), 1));
  const lm = new ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute float tt;varying float vT;void main(){vT=tt;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time;varying float vT;void main(){float pulse=pow(1.-fract(vT-time*.35),8.);gl_FragColor=vec4(vec3(.24,.94,.7)*(.22+pulse*1.4),1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  group.add(new LS2(lg, lm));
  p.group.add(group); p.india = group; p.indiaMats = [pm, lm];
}

function buildClouds(p, i) {
  const m = new ShaderMaterial({
    uniforms: { sunDir: { value: p.mat.uniforms.sunDir.value }, time: { value: 0 }, density: { value: null }, seed: { value: i * 7.1 + 3 } },
    vertexShader: `varying vec2 vUv;varying vec3 vWN;varying vec3 vV;void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vWN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `uniform vec3 sunDir;uniform sampler2D density;varying vec2 vUv;varying vec3 vWN;varying vec3 vV;
      void main(){float a=texture2D(density,vUv).r;float l=smoothstep(-.15,.7,dot(vWN,sunDir));float edge=smoothstep(0.,.35,dot(vWN,vV));
        gl_FragColor=vec4(vec3(.95,.97,1.)*(.04+l*1.1),a*edge*(.15+.85*l));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false
  });
  const c = new Mesh(new SphereGeometry(p.v.r * 1.02, 64, 48), m); p.group.add(c); p.clouds = c;
}

// the original procedural surface, now run once per planet into an equirectangular texture
const PLANET_SURFACE = /* glsl */`
  uniform vec3 c1,c2,c3;uniform float seed,scale,bands,bandMix,rock,swirl,kin;
  vec3 rot(vec3 p,vec3 a,float g){return p*cos(g)+cross(a,p)*sin(g)+a*dot(a,p)*(1.-cos(g));}
  vec4 surface(vec3 p){
    if(swirl>0.){vec3 vc=normalize(vec3(.55,-.28,.79));float vd=distance(p,vc);p=rot(p,vc,swirl*pow(max(0.,1.-vd/.42),2.)*3.2);}
    float n=fbm(p*scale+seed+swirl*vec3(fbm(p*1.7))*.8);
    float b=sin(p.y*bands+n*3.2+seed)*.5+.5;float t=mix(n*.62+.5,b,bandMix);
    vec3 col=mix(c1,c2,smoothstep(.2,.62,t));col=mix(col,c3,smoothstep(.6,.95,t));
    if(rock>.5){float cr=1.-abs(snoise(p*7.+seed));col*=.72+.5*pow(cr,6.);float m2=snoise(p*18.+seed);col*=.9+.12*m2;}
    float seam=0.;if(kin>.5){float k1=1.-smoothstep(0.,.03,abs(snoise(p*2.6+seed*1.7)));float mask=smoothstep(-.1,.35,snoise(p*1.3+seed+4.));seam=k1*mask;}
    return vec4(col,seam);
  }`;
// uv -> the same direction three's SphereGeometry uses for that uv
const UV_DIR = /* glsl */`vec3 uvDir(vec2 uv){float th=(1.-uv.y)*3.14159265;float ph=uv.x*6.28318531;return vec3(-cos(ph)*sin(th),cos(th),sin(ph)*sin(th));}`;
async function bakePlanets(onStep) {
  const big = !Q.touch && renderer.capabilities.maxTextureSize >= 4096;
  const W = big ? 3072 : 2048, CW = big ? 2048 : 1024, strips = Q.touch ? 4 : 2;
  const sc = new Scene(), cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new Mesh(new PlaneGeometry(2, 2)); sc.add(quad);
  const vs = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
  const target = w => new WebGLRenderTarget(w, w / 2, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, wrapS: RepeatWrapping, anisotropy: 8, depthBuffer: false });
  // render in horizontal strips, one per frame, so a slow phone GPU never stalls for long
  const bake = async (rt, material) => {
    quad.material = material; const h = Math.ceil(rt.height / strips);
    for (let k = 0; k < strips; k++) { rt.scissor.set(0, k * h, rt.width, h); rt.scissorTest = true; renderer.setRenderTarget(rt); renderer.render(sc, cam); await nextFrame(); }
    rt.scissorTest = false; renderer.setRenderTarget(null); material.dispose();
  };
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i], rt = target(W);
    await bake(rt, new ShaderMaterial({ uniforms: p.surf, vertexShader: vs,
      fragmentShader: NOISE + PLANET_SURFACE + UV_DIR + `varying vec2 vUv;void main(){vec4 s=surface(uvDir(vUv));gl_FragColor=vec4(pow(max(s.rgb,0.),vec3(1./2.2)),s.a);}` }));
    p.albedoRT?.dispose(); p.albedoRT = rt; p.mat.uniforms.albedo.value = rt.texture;
    if (p.clouds) {
      const ct = target(CW);
      await bake(ct, new ShaderMaterial({ uniforms: { seed: p.clouds.material.uniforms.seed }, vertexShader: vs,
        fragmentShader: NOISE + UV_DIR + `uniform float seed;varying vec2 vUv;void main(){vec3 p=uvDir(vUv);float n=fbm(p*3.2+vec3(seed,0.,0.));n+=.5*fbm(p*9.+seed);gl_FragColor=vec4(vec3(smoothstep(.18,.75,n)*.85),1.);}` }));
      p.cloudRT?.dispose(); p.cloudRT = ct; p.clouds.material.uniforms.density.value = ct.texture;
    }
    if (onStep) onStep(i);
  }
  quad.geometry.dispose();
}

function buildPlanets() {
  CONFIG.values.forEach((v, i) => {
    const group = new Group(); group.position.set(...v.pos);
    const sunDir = LIGHT.clone().sub(group.position).normalize();
    // surface colours are baked into a texture at load (bakePlanets); per frame only lighting, rim and seams are computed
    const surf = {
      c1: { value: new Color(v.c[0]) }, c2: { value: new Color(v.c[1]) }, c3: { value: new Color(v.c[2]) },
      seed: { value: i * 13.7 + 2 }, scale: { value: v.scale }, bands: { value: v.bands }, bandMix: { value: v.bandMix }, rock: { value: v.rock },
      swirl: { value: v.swirl || 0 }, kin: { value: v.rock ? 1 : 0 }
    };
    const mat = new ShaderMaterial({
      uniforms: { albedo: { value: null }, rimC: { value: new Color(v.atmo) }, sunDir: { value: sunDir }, time: { value: 0 } },
      vertexShader: `varying vec2 vUv;varying vec3 vWN;varying vec3 vV;
        void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vWN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform sampler2D albedo;uniform vec3 rimC,sunDir;varying vec2 vUv;varying vec3 vWN;varying vec3 vV;
        void main(){
          vec4 a=texture2D(albedo,vUv);vec3 col=pow(a.rgb,vec3(2.2));float seam=a.a;
          float d=dot(vWN,sunDir);float light=smoothstep(-.18,.75,d);
          float rim=pow(1.-max(dot(vWN,vV),0.),2.6);
          col=col*(.05+light*1.3)+rimC*rim*(.06+light*.75)*.8;
          vec3 gold=vec3(1.,.7,.26);col=mix(col,gold*(.35+light*1.5),seam*.9);col+=gold*seam*(1.-light)*1.6;
          gl_FragColor=vec4(col,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const seg = innerWidth < 760 ? 64 : 96;
    const body = new Mesh(new SphereGeometry(v.r, seg, seg * .75 | 0), mat);
    body.rotation.z = .25 * (i % 2 ? 1 : -1);
    body.userData.index = i;
    group.add(body);
    const atmoMat = new ShaderMaterial({
      uniforms: { c: { value: new Color(v.atmo) }, k: { value: 1 }, sunDir: { value: sunDir } },
      vertexShader: `varying vec3 vN;varying vec3 vWN;void main(){vN=normalize(normalMatrix*normal);vWN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec3 c;uniform float k;uniform vec3 sunDir;varying vec3 vN;varying vec3 vWN;
        void main(){float z=-vN.z;float i=smoothstep(0.,.42,z)*smoothstep(.95,.36,z);i=pow(i,2.2);float s=.18+.82*smoothstep(-.5,.7,dot(vWN,sunDir));gl_FragColor=vec4(c*i*k*s*.95,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending
    });
    const atmo = new Mesh(new SphereGeometry(v.r * 1.14, 64, 48), atmoMat); group.add(atmo);
    if (v.ring) {
      const inner = v.r * 1.45, outer = v.r * 2.35;
      const rg = new RingGeometry(inner, outer, 160, 1);
      const rm = new ShaderMaterial({
        uniforms: { c: { value: new Color('#bfe9da') }, inner: { value: inner }, outer: { value: outer } },
        vertexShader: `varying float vR;uniform float inner,outer;void main(){vR=(length(position.xy)-inner)/(outer-inner);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying float vR;uniform vec3 c;void main(){float b=.6+.4*sin(vR*38.+sin(vR*11.)*3.);float gap=smoothstep(.0,.02,abs(vR-.62));float a=b*gap*smoothstep(0.,.06,vR)*smoothstep(1.,.82,vR)*.55;gl_FragColor=vec4(c*a,a);
          #include <colorspace_fragment>
        }`,
        side: DoubleSide, transparent: true, depthWrite: false, blending: AdditiveBlending
      });
      const ring = new Mesh(rg, rm); ring.rotation.x = -Math.PI / 2 + .38; ring.rotation.y = .22; group.add(ring);
    }
    scene.add(group);
    planets.push({ group, body, atmo, mat, surf, atmoMat, v, spin: .02 + i * .006 });
  });
  planets.forEach((p, i) => { if (p.v.rock) buildBelt(p); if (p.v.clouds) buildClouds(p, i); if (p.v.aurora) buildAurora(p); if (p.v.moons) buildMoons(p); });
}

function buildWarp() {
  const n = 700, pos = new Float32Array(n * 6), seeds = [];
  const r = mulberry(11);
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, rad = 4 + Math.pow(r(), .6) * 60; seeds.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, z: -r() * 400, sp: .6 + r() * .8 }); }
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3));
  const m = new LineBasicMaterial({ color: 0xa9c8ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  warp = new LineSegments(g, m); warp.frustumCulled = false; warp.userData.seeds = seeds; camera.add(warp);
}
function updateWarp(dt) {
  const w = Math.max(state.warp, state.legWarp); warp.visible = w > .01; if (!warp.visible) return;   // legWarp: faint streaks while flying between planets
  warp.geometry.setDrawRange(0, state.warp >= state.legWarp ? Infinity : 220 * 2);   // flights use about a third of the lines
  warp.material.opacity = Math.min(1, w * 1.2) * .85;
  const pos = warp.geometry.attributes.position.array, seeds = warp.userData.seeds, speed = 40 + w * 900, len = 2 + w * 70;
  seeds.forEach((s, i) => {
    s.z += speed * s.sp * dt; if (s.z > 2) s.z = -400;
    pos.set([s.x, s.y, s.z, s.x, s.y, s.z - len * s.sp], i * 6);
  });
  warp.geometry.attributes.position.needsUpdate = true;
}

/* ---------- swift bird ---------- */
function buildBird() {
  bird = new Group();
  const mat = new MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0x2a5fd0, emissiveIntensity: .35, metalness: .35, roughness: .35, side: DoubleSide, flatShading: true });
  const body = new Mesh(new SphereGeometry(1, 14, 10), mat); body.scale.set(.32, .26, 1.15); bird.add(body);
  const wingShape = new Shape();
  wingShape.moveTo(0, .38); wingShape.quadraticCurveTo(1.9, .75, 3.6, -1.55); wingShape.quadraticCurveTo(1.7, -.35, 0, -.5); wingShape.lineTo(0, .38);
  const wg = new ShapeGeometry(wingShape, 18); wg.rotateX(Math.PI / 2);
  const mkWing = side => { const piv = new Group(); piv.position.set(.18 * side, .05, .15); const w = new Mesh(wg, mat); w.scale.x = side; piv.add(w); bird.add(piv); return piv; };
  bird.userData.wl = mkWing(-1); bird.userData.wr = mkWing(1);
  const tail = new Shape(); tail.moveTo(-.16, -.75); tail.lineTo(-.6, -2.05); tail.lineTo(0, -1.3); tail.lineTo(.6, -2.05); tail.lineTo(.16, -.75); tail.lineTo(-.16, -.75);
  const tg = new ShapeGeometry(tail); tg.rotateX(Math.PI / 2); bird.add(new Mesh(tg, mat));
  bird.scale.setScalar(.85);
  scene.add(bird);
  // trail
  const n = 90, tp = new Float32Array(n * 3), ta = new Float32Array(n); for (let i = 0; i < n; i++) ta[i] = i / n;
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(tp, 3)); g.setAttribute('age', new BufferAttribute(ta, 1));
  const tm = new ShaderMaterial({
    uniforms: { pr: { value: renderer.getPixelRatio() }, c: { value: new Color('#7fb2ff') } },
    vertexShader: `attribute float age;uniform float pr;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=(1.-age)*7.*pr*(30./-mv.z);vA=1.-age;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 c;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d)*vA*.55;gl_FragColor=vec4(c*a,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  const trail = new Points(g, tm); trail.frustumCulled = false; scene.add(trail);
  bird.userData.trail = trail; bird.userData.hist = []; bird.userData.n = n;
  // flight loop in camera space (+x right, +y up, -z forward)
  bird.userData.path = new CatmullRomCurve3([
    new Vector3(-70, -14, -70), new Vector3(-26, -4, -42), new Vector3(4, 5, -28), new Vector3(30, 12, -34),
    new Vector3(80, 26, -70), new Vector3(70, 50, -170), new Vector3(-20, 40, -220), new Vector3(-110, 10, -150)
  ], true, 'centripetal');
  bird.userData.u = 0; bird.userData.speed = .042; bird.visible = false;
}
const _v = new Vector3(), _v2 = new Vector3();
function updateBird(dt, t) {
  if (!bird.visible) return;
  const ud = bird.userData;
  // slower while crossing the view (u .05-.45), faster on the hidden return leg
  const visibleLeg = ud.u % 1 < .5;
  ud.u += dt * ud.speed * (visibleLeg ? 1 : 2.4);
  const u = ud.u % 1;
  ud.path.getPointAt(u, _v); ud.path.getPointAt((u + .004) % 1, _v2);
  _v.applyMatrix4(camera.matrixWorld); _v2.applyMatrix4(camera.matrixWorld);
  bird.position.copy(_v); bird.lookAt(_v2);
  // bank into the curve
  bird.rotateZ(Math.sin(u * Math.PI * 2) * .35);
  // flap bursts then glide, like a swift
  const cyc = (t * .55) % 1, flapping = cyc < .55;
  const amp = flapping ? .75 : .12, f = flapping ? 15 : 2;
  const a = Math.sin(t * f) * amp;
  ud.wl.rotation.z = a; ud.wr.rotation.z = -a;
  // trail history
  ud.hist.unshift(bird.position.clone()); if (ud.hist.length > ud.n) ud.hist.pop();
  const arr = ud.trail.geometry.attributes.position.array;
  for (let i = 0; i < ud.n; i++) { const h = ud.hist[Math.min(i, ud.hist.length - 1)]; arr[i * 3] = h.x; arr[i * 3 + 1] = h.y; arr[i * 3 + 2] = h.z; }
  ud.trail.geometry.attributes.position.needsUpdate = true;
}

/* ---------- skill cues: one 3D object per planet, for the skill it carries ----------
   robotics → robot arm · ai → neural network · coding → typing code window · mechanics → meshing gears.
   Each is built at about one unit tall, then placed in that planet's stop shot (placeSkillCues) so it sits
   beside the planet, on the side away from the tagline. Colours come from SKILLS in config.js. */
const cues = [];
// where each cue sits in its planet's shot: screen position (-1..1), depth as a fraction of the camera-planet distance, height as a fraction of the screen
const CUE_SPOT = { land: { nx: .6, ny: -.34, d: .6, h: .27 }, port: { nx: .34, ny: .02, d: .58, h: .24 } };

function buildSkillCues() {
  CONFIG.values.forEach((v, i) => {
    const sk = SKILLS[v.skill], make = sk && CUE_BUILDERS[sk.cue]; if (!make) return;
    const g = make(sk); g.userData.pop = 1; g.userData.build = 1; g.userData.t0 = 0; g.userData.base = 1; scene.add(g); cues[i] = g;
  });
}
function placeSkillCues() {
  const portrait = isPortrait(), S0 = portrait ? CUE_SPOT.port : CUE_SPOT.land;
  const th = Math.tan((portrait ? 50 : 38) * Math.PI / 360), asp = innerWidth / innerHeight;
  cues.forEach((g, k) => {
    if (!g || !frames[k + 1]) return;
    const o = CONFIG.values[k].cueSpot, S = Object.assign({}, S0, o && o[portrait ? 'port' : 'land']);   // per-planet override
    const fr = frames[k + 1], dist = fr.pos.distanceTo(planets[k].group.position) * S.d;
    tmpCam.position.copy(fr.pos); tmpCam.lookAt(fr.look); tmpCam.updateMatrixWorld();
    g.position.set(S.nx * th * asp * dist, S.ny * th * dist, -dist).applyMatrix4(tmpCam.matrixWorld);
    g.quaternion.copy(tmpCam.quaternion);
    g.userData.base = S.h * th * dist * 2;   // world height that fills S.h of the screen height
  });
}
// on arrival the cue builds itself (userData.build 0 → 1; each cue's tick stages its own parts)
function popSkillCue(i) {
  const g = cues[i - 1]; if (!g || REDUCED) return;
  g.userData.t0 = clock.t;
  gsap.fromTo(g.userData, { pop: 0, build: 0 }, { pop: 1, build: 1, duration: 1.9, ease: 'none', overwrite: true });
}
// staged progress: 0 before `start`, eases out to 1 over `len` (both in build units)
const stage = (b, start, len) => { const x = MathUtils.clamp((b - start) / len, 0, 1); return 1 - Math.pow(1 - x, 3); };
const flash = (b, at) => Math.exp(-Math.pow((b - at) / .035, 2));
function updateSkillCues(dt, t) {
  // one focal point: during the tour a cue shows only at (and on the way to) its own planet; all show at the start and the finale
  const all = current <= 0 || current === N_STOPS - 1;
  cues.forEach((g, k) => {
    if (!g) return;
    g.visible = !!((all && !leg) || current === k + 1 || (leg && leg.to === k + 1));   // three.js hides only on === false
    if (!g.visible) return;
    g.scale.setScalar(g.userData.base * (.88 + .12 * stage(g.userData.pop, 0, .5)));
    g.userData.tick(dt, t, current === k + 1 || !!(leg && leg.to === k + 1));
  });
}
const cueMat = (color, emissive = 0, ei = 0, metal = .3, rough = .4) => new MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, metalness: metal, roughness: rough });
let cueGlow = null;
function glowSprite(color, size) {
  cueGlow = cueGlow || glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,.3)');
  const sp = new Sprite(new SpriteMaterial({ map: cueGlow, color, transparent: true, depthWrite: false, blending: AdditiveBlending }));
  sp.scale.set(size, size, 1); return sp;
}

// robotics: a two-joint arm with a gripper on a hex base, moving through a pick-and-place loop
function cueArm(sk) {
  const g = new Group(), body = new Group(); body.rotation.set(.18, -.5, 0); g.add(body);
  const white = cueMat(0xf3f6ff, 0x2a3a66, .45, .35, .32), dark = cueMat(0x17355F, 0x091C56, .3, .5, .4);
  const accent = cueMat(new Color(sk.color), new Color(sk.color), .7, .2, .4);
  const base = new Mesh(new CylinderGeometry(.26, .3, .08, 6), dark); base.position.y = -.48; body.add(base);
  const ring = new Mesh(new TorusGeometry(.28, .012, 6, 6), accent); ring.rotation.x = Math.PI / 2; ring.position.y = -.43; body.add(ring);
  const yaw = new Group(); yaw.position.y = -.44; body.add(yaw);
  const turret = new Mesh(new CylinderGeometry(.13, .16, .14, 24), white); turret.position.y = .07; yaw.add(turret);
  const joint = (r, len, m) => { const j = new Mesh(new CylinderGeometry(r, r, len, 20), m); j.rotation.x = Math.PI / 2; return j; };
  const shoulder = new Group(); shoulder.position.y = .17; yaw.add(shoulder); shoulder.add(joint(.085, .2, accent));
  const upper = new Mesh(new BoxGeometry(.1, .44, .1), white); upper.position.y = .22; shoulder.add(upper);
  const elbow = new Group(); elbow.position.y = .44; shoulder.add(elbow); elbow.add(joint(.07, .17, accent));
  const fore = new Mesh(new BoxGeometry(.08, .36, .08), white); fore.position.y = .18; elbow.add(fore);
  const stripe = new Mesh(new BoxGeometry(.084, .08, .084), accent); stripe.position.y = .26; elbow.add(stripe);
  const wrist = new Group(); wrist.position.y = .36; elbow.add(wrist); wrist.add(joint(.05, .13, dark));
  const palm = new Mesh(new BoxGeometry(.17, .05, .09), dark); palm.position.y = .05; wrist.add(palm);
  const fingers = [-1, 1].map(s => { const f = new Mesh(new BoxGeometry(.028, .12, .06), white); f.position.set(s * .06, .13, 0); wrist.add(f); return f; });
  const led = glowSprite(new Color(sk.to), .22); led.position.set(0, .02, .07); wrist.add(led);
  g.userData.tick = (dt, t) => {
    const b = g.userData.build, c = t * .9;
    const sb = stage(b, 0, .22), sy = stage(b, .12, .25), ss = stage(b, .3, .3), se = stage(b, .45, .3), sw = stage(b, .6, .3);
    base.scale.setScalar(Math.max(.001, sb)); ring.scale.setScalar(Math.max(.001, sb));
    yaw.scale.setScalar(Math.max(.001, sy));
    yaw.rotation.y = Math.sin(c * .5) * .8 * sw;
    shoulder.rotation.z = MathUtils.lerp(-1.7, -.45 + Math.sin(c) * .28, ss);       // lies folded, then stands up
    elbow.rotation.z = MathUtils.lerp(2.7, 1.25 + Math.sin(c + 1.1) * .32, se);       // tucked, then extends
    wrist.rotation.z = MathUtils.lerp(-1.4, -.7 + Math.sin(c * 1.4) * .3, sw);
    const open = (.035 + .03 * (.5 + .5 * Math.sin(c * 2))) * sw + .03 * (1 - sw);
    fingers[0].position.x = -open; fingers[1].position.x = open;
    accent.emissiveIntensity = .7 + 2.2 * (flash(b, .58) + flash(b, .73) + flash(b, .88));   // joints flash as they lock
    led.material.opacity = sw * (.55 + .45 * (Math.sin(t * 6) > .2 ? 1 : 0));
  };
  return g;
}

// ai & data: a small neural network; signals run left to right through the layers
function cueNeural(sk) {
  const g = new Group(), net = new Group(), layers = [3, 5, 5, 2], W = 1.25, H = .9, nodes = []; g.add(net);
  layers.forEach((n, l) => {
    for (let k = 0; k < n; k++) nodes.push({ l, p: new Vector3(-W / 2 + l * W / (layers.length - 1), (k - (n - 1) / 2) * (H / 4.2), (Math.random() - .5) * .12) });
  });
  const seg = [], tt = [];
  nodes.forEach(a => nodes.forEach(b => {
    if (b.l !== a.l + 1) return;
    for (let q = 0; q < 6; q++) { seg.push(a.p.clone().lerp(b.p, q / 6), a.p.clone().lerp(b.p, (q + 1) / 6)); tt.push(a.l + q / 6, a.l + (q + 1) / 6); }
  }));
  const lg = new BufferGeometry().setFromPoints(seg); lg.setAttribute('tt', new BufferAttribute(new Float32Array(tt), 1));
  const lm = new ShaderMaterial({
    uniforms: { time: { value: 0 }, build: { value: 4 }, base: { value: new Color('#4f6fd6') }, pulse: { value: new Color('#FCA01B') } },
    vertexShader: `attribute float tt;varying float vT;void main(){vT=tt;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time,build;uniform vec3 base,pulse;varying float vT;void main(){float on=smoothstep(vT,vT+.35,build);float p=pow(1.-fract((vT-time*1.1)/3.),14.);gl_FragColor=vec4((base*.5+pulse*p*2.2)*on,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  net.add(new LineSegments(lg, lm));
  const nodeMat = new MeshBasicMaterial({ color: new Color('#17BDE0') }), sg = new SphereGeometry(.035, 16, 12);
  const dots = [], halos = nodes.map(n => {
    const m = new Mesh(sg, nodeMat); m.position.copy(n.p); net.add(m); dots.push(m);
    const h = glowSprite(new Color('#17BDE0'), .2); h.position.copy(n.p); net.add(h); return h;
  });
  // holographic bracket frame, like the HUD corner ticks
  const fx = W / 2 + .16, fy = H / 2 + .1, k = .14, br = [];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => { br.push(new Vector3(sx * fx, sy * fy, 0), new Vector3(sx * (fx - k), sy * fy, 0), new Vector3(sx * fx, sy * fy, 0), new Vector3(sx * fx, sy * (fy - k), 0)); });
  const frame = new LineSegments(new BufferGeometry().setFromPoints(br), new LineBasicMaterial({ color: 0xB8D8F4, transparent: true, opacity: .7 })); g.add(frame);
  g.userData.tick = (dt, t) => {
    const b = g.userData.build, fb = stage(b, 0, .25);
    frame.scale.setScalar(.7 + .3 * fb); frame.material.opacity = .7 * fb;
    lm.uniforms.time.value = t; lm.uniforms.build.value = b < 1 ? Math.max(0, (b - .15) / .8) * 3.4 : 4;
    halos.forEach((h, i) => {
      const s = stage(b, .15 + nodes[i].l * .18, .2), ph = 1 - ((nodes[i].l - t * 1.1) / 3 % 1 + 1) % 1;
      dots[i].scale.setScalar(Math.max(.001, s)); h.material.opacity = s * (.35 + .65 * Math.pow(ph, 6)) + 1.2 * flash(b, .3 + nodes[i].l * .18);
    });
    net.rotation.y = Math.sin(t * .35) * .25;
  };
  return g;
}

// coding: a code window (header dots like the SKAI coding timer) that types a short Python mission, plus drifting glyphs
function cueTerminal(sk) {
  const k2 = innerWidth < 760 ? 1 : 2;   // the code window draws at 2x on desktop
  const g = new Group(), cv = document.createElement('canvas'); cv.width = 640 * k2; cv.height = 420 * k2;
  const x = cv.getContext('2d'), tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace;
  const C = { k: '#45CDB5', f: '#17BDE0', s: '#FCA01B', p: '#F7FBFF', c: '#7895B5' };
  const code = [
    [['def ', 'k'], ['launch', 'f'], ['(cadet):', 'p']],
    [['    if ', 'k'], ['cadet.curious:', 'p']],
    [['        build', 'f'], ['(robot)', 'p']],
    [['        test', 'f'], ['(); ', 'p'], ['fix', 'f'], ['()', 'p']],
    [['    return ', 'k'], ['"liftoff"', 's']],
    [['# block code first, then Python', 'c']]
  ];
  const total = code.reduce((a, l) => a + l.reduce((b, [s]) => b + s.length, 0), 0);
  let last = -1, drawn = -1;
  const draw = (t) => {
    const shown = Math.floor(((Math.max(0, t) * 22) % (total + 40)));
    const key = Math.min(shown, total) * 2 + ((t * 2.2 | 0) % 2);
    if (key === last) return; last = key;
    x.setTransform(k2, 0, 0, k2, 0, 0); x.clearRect(0, 0, 640, 420);
    x.fillStyle = 'rgba(6,28,30,.86)'; x.strokeStyle = '#18AC6A'; x.lineWidth = 4;
    x.beginPath(); x.roundRect(4, 4, 632, 412, 14); x.fill(); x.stroke();
    x.fillStyle = '#108D55'; x.beginPath(); x.roundRect(6, 6, 628, 50, [12, 12, 0, 0]); x.fill();
    ['#FCA01B', '#FEE714', '#45CDB5'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(34 + i * 26, 31, 8, 0, 7); x.fill(); });
    x.font = '600 22px "Chakra Petch", Arial, sans-serif'; x.fillStyle = '#F7FBFF'; x.textBaseline = 'middle'; x.fillText('mission.py', 124, 31);
    x.font = '500 27px "Chakra Petch", Arial, sans-serif';
    let n = 0, cx = 0, cy = 0;
    code.forEach((line, li) => {
      let px = 30; const py = 92 + li * 52;
      x.fillStyle = 'rgba(120,149,181,.55)'; x.fillText(String(li + 1), px - 4, py); px += 26;
      line.forEach(([s, c]) => { const take = Math.max(0, Math.min(s.length, shown - n)); n += s.length; if (!take) return; const part = s.slice(0, take); x.fillStyle = C[c]; x.fillText(part, px, py); px += x.measureText(part).width; cx = px; cy = py; });
    });
    if ((t * 2.2 | 0) % 2 === 0) { x.fillStyle = '#45CDB5'; x.fillRect(cx + 3, cy - 14, 12, 28); }
    tex.needsUpdate = true;
  };
  draw(0);
  const panel = new Mesh(new PlaneGeometry(1.52, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));   // front side only: no mirrored text from behind
  panel.rotation.y = -.32; panel.renderOrder = 3; g.add(panel);
  const glyph = (s, col, size) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const y = c.getContext('2d');
    y.font = '700 92px "Chakra Petch", Arial, sans-serif'; y.textAlign = 'center'; y.textBaseline = 'middle'; y.fillStyle = col; y.fillText(s, 128, 66);
    const t2 = new CanvasTexture(c); t2.colorSpace = SRGBColorSpace;
    const sp = new Sprite(new SpriteMaterial({ map: t2, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false })); sp.scale.set(size * 2, size, 1); return sp;
  };
  const gl = [glyph('</>', '#45CDB5', .26), glyph('{ }', '#17BDE0', .22), glyph('01', '#FCA01B', .18)];
  const home = [new Vector3(.9, .52, .2), new Vector3(-.92, -.38, .25), new Vector3(.78, -.6, .1)];
  gl.forEach((s, i) => { s.position.copy(home[i]); g.add(s); });
  if (document.fonts) document.fonts.ready.then(() => { last = -1; });
  g.userData.tick = (dt, t, on) => {
    const b = g.userData.build;
    panel.scale.set(Math.max(.001, stage(b, 0, .3)), .03 + .97 * stage(b, .22, .25), 1);
    const tt = t - g.userData.t0 - 1.0;   // start typing once the window is open
    if (on && t - drawn > .08) { drawn = t; draw(b < 1 ? Math.min(tt, -.01) : tt); }
    gl.forEach((s, i) => { s.position.y = home[i].y + Math.sin(t * .9 + i * 2) * .06; s.material.opacity = stage(b, .5 + i * .12, .3) * (.7 + .3 * Math.sin(t * 1.6 + i)); });
  };
  return g;
}

// mechanics: three gears that really mesh (shared module, speeds set by tooth count)
function gearGeometry(n, m, hole) {
  const rp = m * n / 2, ro = rp + m, rr = rp - 1.25 * m, s = new Shape();
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, w = Math.PI / n;
    const pts = [[rr, a - w * .62], [ro, a - w * .28], [ro, a + w * .28], [rr, a + w * .62], [rr, a + w * 1.38]];
    pts.forEach(([r, b], j) => (k === 0 && j === 0 ? s.moveTo : s.lineTo).call(s, Math.cos(b) * r, Math.sin(b) * r));
  }
  const h = new Shape().absarc(0, 0, hole, 0, Math.PI * 2, true); s.holes.push(h);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4, r = (hole + rr) / 2, lh = new Shape(); lh.absarc(Math.cos(a) * r, Math.sin(a) * r, (rr - hole) * .2, 0, Math.PI * 2, true); if (rr - hole > m * 2.2) s.holes.push(lh); }
  const geo = new ExtrudeGeometry(s, { depth: .07, bevelEnabled: true, bevelThickness: .012, bevelSize: .01, bevelSegments: 1, curveSegments: 18 });
  geo.translate(0, 0, -.035); return geo;
}
function cueGears(sk) {
  const g = new Group(), body = new Group(); body.rotation.set(-.32, .42, 0); g.add(body);
  const m = .043;
  const spec = [
    { n: 16, mat: cueMat(0xFCA01B, 0xB96D00, .35, .65, .32) },
    { n: 10, mat: cueMat(0x2784DD, 0x154777, .45, .6, .3) },
    { n: 8, mat: cueMat(0xe8eef8, 0x2a3a66, .35, .7, .28) }
  ];
  const hub = cueMat(0x17355F, 0x091C56, .3, .5, .4);
  const pos = [new Vector3(-.22, -.14, 0)], ang = [0, .35, 1.3];   // ang[i]: direction from gear i-1 to gear i
  for (let i = 1; i < 3; i++) { const d = m * (spec[i - 1].n + spec[i].n) / 2; pos[i] = pos[i - 1].clone().add(new Vector3(Math.cos(ang[i]) * d, Math.sin(ang[i]) * d, 0)); }
  const gears = spec.map((sp, i) => {
    const gg = new Group(); gg.position.copy(pos[i]); body.add(gg);
    gg.add(new Mesh(gearGeometry(sp.n, m, m * 1.2), sp.mat));
    const cap = new Mesh(new CylinderGeometry(m * 1.5, m * 1.5, .1, 6), hub); cap.rotation.x = Math.PI / 2; gg.add(cap);
    return gg;
  });
  // hazard-striped base beam (the engineering HUD's striped meter)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; const y = cv.getContext('2d');
  y.fillStyle = '#091C56'; y.fillRect(0, 0, 256, 32); y.fillStyle = '#FCA01B';
  for (let i = -2; i < 20; i++) { y.beginPath(); y.moveTo(i * 20, 32); y.lineTo(i * 20 + 10, 32); y.lineTo(i * 20 + 22, 0); y.lineTo(i * 20 + 12, 0); y.fill(); }
  const bt = new CanvasTexture(cv); bt.colorSpace = SRGBColorSpace;
  const beam = new Mesh(new BoxGeometry(1.2, .07, .08), new MeshStandardMaterial({ map: bt, metalness: .3, roughness: .5, emissive: 0x332200, emissiveIntensity: .4 }));
  beam.position.set(.02, -.62, -.02); body.add(beam);
  const baseEI = spec.map(sp => sp.mat.emissiveIntensity);
  g.userData.tick = (dt, t) => {
    const b = g.userData.build;
    beam.scale.x = Math.max(.001, stage(b, 0, .25));
    gears.forEach((gg, i) => {
      const st = .15 + i * .2, s = stage(b, st, .32);
      gg.visible = s > .001; gg.position.y = pos[i].y + .6 * (1 - s); gg.scale.setScalar(.7 + .3 * s);
      spec[i].mat.emissiveIntensity = baseEI[i] + 1.6 * flash(b, st + .32 * .7);
    });
    const a0 = t * .45; gears[0].rotation.z = a0;
    for (let i = 1; i < 3; i++) {
      const nA = spec[i - 1].n, nB = spec[i].n, phi = ang[i];
      gears[i].rotation.z = phi + Math.PI + (nA * (phi - gears[i - 1].rotation.z) - Math.PI) / nB;
    }
  };
  return g;
}
const CUE_BUILDERS = { arm: cueArm, neural: cueNeural, terminal: cueTerminal, gears: cueGears };

/* ---------- curved text rings: each planet wears its skill as a ring of type ----------
   A tilted open band around the planet. Its text is drawn once to a canvas strip (Chakra Petch,
   skill name in the skill colour). A shader brightens the near side, dims the far side, and
   reveals the letters behind a sweeping arc head when the tagline appears. */
const rings = [];
const _rv = new Vector3();
function ringTexture(i, sk, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const n = CONFIG.values.length, fs = Math.round(h * .5), track = fs * .2, gap = fs * 1.1;
  const parts = [[sk.name.toUpperCase(), sk.ink], ['*', sk.color], [`MISSION ${pad(i)} / ${pad(n)}`, '#F7FBFF'], ['*', sk.color], ['SKAI SPACE', '#F7FBFF'], ['*', sk.color]];
  const draw = () => {
    x.clearRect(0, 0, w, h);
    x.font = `600 ${fs}px "Chakra Petch", Arial, sans-serif`; x.textBaseline = 'middle';
    const width = s => s === '*' ? fs * .5 : [...s].reduce((a, ch) => a + x.measureText(ch).width + track, 0);
    const unit = parts.reduce((a, [s]) => a + width(s) + gap, 0);
    const reps = Math.max(1, Math.floor(w / unit)), extra = (w - reps * unit) / (reps * parts.length);
    let px = 0;
    for (let r = 0; r < reps; r++) parts.forEach(([s, col]) => {
      x.fillStyle = col;
      if (s === '*') { const d = fs * .2; x.save(); x.translate(px + fs * .25, h / 2); x.rotate(Math.PI / 4); x.fillRect(-d, -d, d * 2, d * 2); x.restore(); }
      else [...s].forEach(ch => { x.fillText(ch, px, h / 2 + 1); px += x.measureText(ch).width + track; });
      px += (s === '*' ? fs * .5 : 0) + gap + extra;
    });
    x.fillStyle = 'rgba(247,251,255,.32)'; x.fillRect(0, 2, w, Math.max(1, h * .03)); x.fillRect(0, h - 2 - Math.max(1, h * .03), w, Math.max(1, h * .03));
  };
  draw();
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  if (document.fonts) document.fonts.ready.then(() => { draw(); t.needsUpdate = true; });
  return t;
}
function buildRings() {
  // ring lettering at 2x where the GPU allows (8192 px strip), 4096 on phones
  const rw = innerWidth < 760 || renderer.capabilities.maxTextureSize < 8192 ? 4096 : 8192;
  CONFIG.values.forEach((v, i) => {
    const sk = SKILLS[v.skill]; if (!sk) return;
    const R = v.r * (v.ring ? 1.3 : 1.36), H = v.r * .14;
    const mat = new ShaderMaterial({
      uniforms: { map: { value: ringTexture(i + 1, sk, rw, rw / 64) }, rev: { value: 0 }, u0: { value: 0 }, op: { value: 0 }, head: { value: new Color(sk.ink) } },
      vertexShader: `varying vec2 vUv;varying float vF;void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vec3 n=normalize(mat3(modelMatrix)*normal);vF=dot(n,normalize(cameraPosition-wp.xyz));gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform sampler2D map;uniform float rev,u0,op;uniform vec3 head;varying vec2 vUv;varying float vF;
        void main(){float a=fract(vUv.x-u0);float show=1.-smoothstep(rev-.012,rev,a);
          vec4 t=texture2D(map,vUv);float face=mix(.14,1.,smoothstep(-.15,.35,vF));
          float tip=rev<.999?exp(-pow((a-rev)*90.,2.))*smoothstep(0.,.04,rev):0.;
          gl_FragColor=vec4((t.rgb*t.a*show*face*.95+head*tip*1.5)*op,1.);}`,
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide
    });
    const tilt = new Group(); tilt.rotation.set(.38, 0, i % 2 ? .14 : -.14); planets[i].group.add(tilt);
    const mesh = new Mesh(new CylinderGeometry(R, R, H, 192, 1, true), mat); mesh.visible = false; mesh.renderOrder = 2; tilt.add(mesh);
    rings[i] = { mesh, u: mat.uniforms };
  });
}
function showRing(i) {
  const R = rings[i - 1]; if (!R) return;
  gsap.killTweensOf([R.u.rev, R.u.op]);
  // start the sweep a little left of the side facing the lens, so it travels across the visible face
  R.mesh.updateMatrixWorld(); const lp = R.mesh.worldToLocal(_rv.copy(camera.position));
  R.u.u0.value = (Math.atan2(lp.x, lp.z) / (Math.PI * 2) + .8) % 1;
  R.mesh.visible = true; R.u.op.value = 1;
  if (REDUCED) { R.u.rev.value = 1; return; }
  gsap.fromTo(R.u.rev, { value: 0 }, { value: 1, duration: 2.4, ease: 'power2.inOut' });
}
function hideRing(i) {
  const R = rings[i - 1]; if (!R || !R.mesh.visible) return;
  gsap.killTweensOf([R.u.rev, R.u.op]);
  gsap.to(R.u.op, { value: 0, duration: REDUCED ? .01 : .5, ease: 'power2.in', onComplete: () => { R.mesh.visible = false; } });
}
// finale: every planet wears its ring in the wide shot
function showAllRings() {
  rings.forEach(R => { if (!R) return; gsap.killTweensOf([R.u.rev, R.u.op]); R.mesh.visible = true; R.u.rev.value = 1; gsap.fromTo(R.u.op, { value: 0 }, { value: .8, duration: REDUCED ? .01 : 1.4, delay: REDUCED ? 0 : .8, ease: 'power2.out' }); });
}
function updateRings(dt) { rings.forEach(R => { if (R && R.mesh.visible) R.mesh.rotation.y += dt * .07; }); }

/* ---------- Earth: the departure point, low in the launch shot ----------
   Day, night-lights and cloud maps (NASA-derived, public domain; public/earth). A dawn line crosses the
   visible face: the far horizon is lit with a blue rim, the near side is night with city lights, and
   India is turned toward the lens. Visible at the start and during the launch flight only. */
let earth = null;
// position in the start shot's camera space (x right, y up, -z forward), radius in world units
const EARTH = { r: 58, land: [20, -66, -100], port: [10, -74, -110], maps: ['earth/earth-day.webp', 'earth/earth-night.webp', 'earth/earth-clouds.webp'] };
function buildEarth() {
  const mat = new ShaderMaterial({
    uniforms: { day: { value: null }, night: { value: null }, clouds: { value: null }, sunDir: { value: new Vector3(0, 1, 0) }, time: { value: 0 }, op: { value: 0 } },
    vertexShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vW;void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `uniform sampler2D day,night,clouds;uniform vec3 sunDir;uniform float time,op;varying vec2 vUv;varying vec3 vN;varying vec3 vW;
      void main(){vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);float d=dot(n,sunDir);float lit=smoothstep(-.08,.28,d);
        vec3 dc=texture2D(day,vUv).rgb;vec3 nc=texture2D(night,vUv).rgb;float cl=texture2D(clouds,vUv+vec2(time*.0012,0.)).r;
        vec3 col=dc*(.03+1.35*max(d,0.));
        col=mix(col,vec3(1.)*(.04+1.15*max(d,0.)),cl*.8);
        vec3 lights=pow(nc,vec3(1.7))*vec3(1.,.8,.5)*3.2*(1.-lit)*(1.-cl*.75);
        col=col*mix(.12,1.,lit)+lights;
        float rim=pow(1.-max(dot(n,v),0.),2.6);
        col+=mix(vec3(1.,.5,.2),vec3(.35,.65,1.),smoothstep(-.05,.35,d))*rim*smoothstep(-.35,.25,d)*1.3;
        gl_FragColor=vec4(col*op,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const atmoMat = new ShaderMaterial({
    uniforms: { sunDir: mat.uniforms.sunDir, op: mat.uniforms.op },
    vertexShader: `varying vec3 vN;varying vec3 vWN;void main(){vN=normalize(normalMatrix*normal);vWN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 sunDir;uniform float op;varying vec3 vN;varying vec3 vWN;
      void main(){float z=-vN.z;float i=smoothstep(0.,.5,z)*smoothstep(1.,.42,z);i=pow(i,2.);float s=smoothstep(-.4,.5,dot(vWN,sunDir));
        gl_FragColor=vec4(mix(vec3(1.,.45,.15),vec3(.3,.62,1.),s)*i*(.12+.88*s)*op*1.25,1.);
        #include <colorspace_fragment>
      }`,
    side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  const g = new Group(), seg = innerWidth < 760 ? 72 : 112;
  g.add(new Mesh(new SphereGeometry(1, seg, seg * .66 | 0), mat), new Mesh(new SphereGeometry(1.035, 64, 40), atmoMat));
  g.visible = false; scene.add(g);
  earth = { g, mat, op: 0, ready: false };
  const loader = new TextureLoader(); let n = 0;
  ['day', 'night', 'clouds'].forEach((k, i) => loader.load(assetUrl(EARTH.maps[i]), t => {
    t.colorSpace = k === 'clouds' ? NoColorSpace : SRGBColorSpace; t.anisotropy = 8; mat.uniforms[k].value = t; renderer.initTexture(t);
    if (++n === 3) earth.ready = true;
  }, undefined, () => {}));   // if the maps can't load, Earth simply stays hidden
}
// lon/lat (degrees) to a direction on three's SphereGeometry, whose u runs from longitude -180
const lonLat = (lon, lat) => { const p = (lon + 180) / 360 * Math.PI * 2, t = lat * Math.PI / 180; return new Vector3(-Math.cos(p) * Math.cos(t), Math.sin(t), Math.sin(p) * Math.cos(t)); };
function placeEarth() {
  if (!earth || !frames[0]) return;
  const portrait = isPortrait(), L = portrait ? EARTH.port : EARTH.land, fr = frames[0];
  frameLocal(fr, L[0], L[1], L[2], earth.g.position); earth.g.scale.setScalar(EARTH.r);
  const q = tmpCam.quaternion;   // frameLocal left tmpCam looking down the start shot
  // the sun sits low ahead of the lens, so the dawn line crosses the visible face
  earth.mat.uniforms.sunDir.value.set(.25, -.06, -1).applyQuaternion(q).normalize();
  // India on the night side, just short of the dawn line, facing the lens
  earth.g.quaternion.setFromUnitVectors(lonLat(78, 22), new Vector3(-.08, .77, .26).normalize().applyQuaternion(q));
}
function updateEarth(dt, t) {
  if (!earth) return;
  const want = earth.ready && (current <= 0 || !!(leg && leg.from === 0 && leg.to === 1)) ? 1 : 0;
  earth.op += (want - earth.op) * Math.min(1, dt * (want ? 1.6 : 2.6));
  earth.mat.uniforms.op.value = earth.op; earth.mat.uniforms.time.value = t;
  earth.g.visible = earth.op > .01;
}

/* ---------- rocket ---------- */
const UP = new Vector3(0, 1, 0);
const RS = 1.35;
let rocket, flame, flameMat, nozzleLight, EX, dust;
const R = { pos: new Vector3(), fwd: new Vector3(0, 0, -1), vel: new Vector3(), prev: new Vector3(), throttle: 0, target: .3, bank: 0, mode: 'intro', ang: 0, orbitIdx: 0, v: 0, nozzle: new Vector3(), prevNozzle: new Vector3(), started: false };

// hull livery, drawn to a canvas (u = around the hull, v = along it, nose at the top)
function rocketTexture(c, S = 2048) {
  c = c || document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d');
  const L = 3.35, Y = y => S - y / L * S, k = S / 1024, rnd = mulberry(9);
  const g = x.createLinearGradient(0, S, 0, 0); g.addColorStop(0, '#c3c9d6'); g.addColorStop(.2, '#eef1f7'); g.addColorStop(1, '#fbfcfe');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  // soft weathering near the engine
  for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(30,40,62,${(rnd() * .05).toFixed(3)})`; x.fillRect(rnd() * S, Y(.95), (2 + rnd() * 9) * k, (Y(0) - Y(.95)) * rnd()); }
  x.fillStyle = '#091C56'; x.fillRect(0, Y(.62), S, Y(.3) - Y(.62));                  // engine section
  for (let u = -S; u < S * 2; u += 34 * k) { x.fillStyle = '#FCA01B'; x.beginPath(); x.moveTo(u, Y(.3)); x.lineTo(u + 16 * k, Y(.3)); x.lineTo(u + 30 * k, Y(.22)); x.lineTo(u + 14 * k, Y(.22)); x.fill(); }   // hazard band
  x.fillStyle = '#091C56'; x.fillRect(0, Y(.22), S, Y(0) - Y(.22));
  x.fillStyle = '#FCA01B'; x.fillRect(0, Y(2.1), S, Y(1.98) - Y(2.1));                  // orange collar
  x.fillStyle = '#17BDE0'; x.fillRect(0, Y(1.95), S, 5 * k);
  x.fillStyle = '#F5A524'; x.fillRect(0, Y(.62) - 4 * k, S, 4 * k);
  const ng = x.createLinearGradient(0, Y(3.35), 0, Y(2.95)); ng.addColorStop(0, '#0A2D94'); ng.addColorStop(1, '#17355F');
  x.fillStyle = ng; x.fillRect(0, 0, S, Y(2.95));                                       // nose cone
  // panel seams and rivet rows
  x.strokeStyle = 'rgba(28,38,66,.45)'; x.lineWidth = 2 * k;
  [.62, .95, 1.3, 1.62, 1.98, 2.1, 2.45, 2.75, 2.95].forEach(h => { x.beginPath(); x.moveTo(0, Y(h)); x.lineTo(S, Y(h)); x.stroke(); });
  x.strokeStyle = 'rgba(28,38,66,.28)'; x.lineWidth = 1.4 * k;
  for (let q = 0; q < 12; q++) { const u = q / 12 * S + 40 * k; x.beginPath(); x.moveTo(u, Y(.62)); x.lineTo(u, Y(1.98)); x.stroke(); x.beginPath(); x.moveTo(u + 42 * k, Y(2.1)); x.lineTo(u + 42 * k, Y(2.95)); x.stroke(); }
  x.fillStyle = 'rgba(28,38,66,.5)';
  [.95, 1.3, 1.62, 2.45, 2.75].forEach(h => { for (let u = 6 * k; u < S; u += 13 * k) { x.beginPath(); x.arc(u, Y(h) - 5 * k, 1.5 * k, 0, 7); x.fill(); } });
  // access hatches with warning tags
  [[150, 1.42], [662, 1.42], [400, 2.3], [912, 2.3]].forEach(([u, h]) => {
    u *= k; x.strokeStyle = 'rgba(28,38,66,.5)'; x.lineWidth = 2 * k; x.strokeRect(u - 26 * k, Y(h) - 20 * k, 52 * k, 40 * k);
    x.fillStyle = '#FCA01B'; x.fillRect(u - 22 * k, Y(h) + 12 * k, 16 * k, 5 * k);
  });
  // lettering, on both sides of the hull
  [256, 768].forEach((u, side) => {
    x.save(); x.translate(u * k, side ? Y(1.78) : Y(.72)); x.rotate(side ? Math.PI / 2 : -Math.PI / 2);
    x.fillStyle = '#0A2D94'; x.font = `700 ${100 * k}px "Chakra Petch", Arial, sans-serif`; x.textBaseline = 'middle'; x.fillText('SKAI', 0, 0);
    x.font = `600 ${24 * k}px "Chakra Petch", Arial, sans-serif`; x.fillStyle = '#FCA01B'; x.fillText('SK-1 · LAUNCHPAD', 6 * k, 60 * k);
    x.font = `600 ${17 * k}px "Chakra Petch", Arial, sans-serif`; x.fillStyle = '#17355F'; x.fillText('BY CONVEGENIUS', 6 * k, -56 * k);
    x.restore();
  });
  return c;
}
// bump map: seams pressed in, rivets raised (same layout as the livery)
function rocketBump(S) {
  const c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d');
  const L = 3.35, Y = y => S - y / L * S, k = S / 1024;
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#3a3a3a'; x.lineWidth = 3 * k;
  [.3, .62, .95, 1.3, 1.62, 1.98, 2.1, 2.45, 2.75, 2.95].forEach(h => { x.beginPath(); x.moveTo(0, Y(h)); x.lineTo(S, Y(h)); x.stroke(); });
  x.lineWidth = 2 * k;
  for (let q = 0; q < 12; q++) { const u = q / 12 * S + 40 * k; x.beginPath(); x.moveTo(u, Y(.62)); x.lineTo(u, Y(1.98)); x.stroke(); x.beginPath(); x.moveTo(u + 42 * k, Y(2.1)); x.lineTo(u + 42 * k, Y(2.95)); x.stroke(); }
  [[150, 1.42], [662, 1.42], [400, 2.3], [912, 2.3]].forEach(([u, h]) => { u *= k; x.strokeRect(u - 26 * k, Y(h) - 20 * k, 52 * k, 40 * k); });
  x.fillStyle = '#c8c8c8';
  [.95, 1.3, 1.62, 2.45, 2.75].forEach(h => { for (let u = 6 * k; u < S; u += 13 * k) { x.beginPath(); x.arc(u, Y(h) - 5 * k, 1.6 * k, 0, 7); x.fill(); } });
  const t = new CanvasTexture(c); t.colorSpace = NoColorSpace; t.anisotropy = 4; return t;
}

let rocketTex = null, rocketCanvas = null;
function buildRocket() {
  rocket = new Group();
  const inner = new Group(); inner.rotation.x = Math.PI / 2; inner.position.z = -1.6; rocket.add(inner);
  const S = innerWidth < 760 ? 1024 : 2048;
  const canvas = rocketCanvas = rocketTexture(null, S);
  rocketTex = new CanvasTexture(canvas); rocketTex.colorSpace = SRGBColorSpace; rocketTex.anisotropy = 8;
  if (document.fonts) document.fonts.ready.then(() => { rocketTexture(canvas, S); rocketTex.needsUpdate = true; });
  const bump = rocketBump(S);
  // gloss paint with a clear coat; metals reflect the sky (scene.environment)
  const skin = new MeshPhysicalMaterial({ map: rocketTex, bumpMap: bump, bumpScale: .9, metalness: .2, roughness: .38, clearcoat: .7, clearcoatRoughness: .18 });
  const white = new MeshPhysicalMaterial({ color: 0xf1f4fa, metalness: .2, roughness: .38, clearcoat: .7, clearcoatRoughness: .18 });
  const navy = new MeshPhysicalMaterial({ color: 0x0A2D94, metalness: .3, roughness: .32, clearcoat: .8, clearcoatRoughness: .15, emissive: 0x091C56, emissiveIntensity: .25 });
  const orange = new MeshPhysicalMaterial({ color: 0xFCA01B, emissive: 0xB96D00, emissiveIntensity: .3, metalness: .15, roughness: .4, clearcoat: .6 });
  const chrome = new MeshStandardMaterial({ color: 0xdfe6f2, metalness: 1, roughness: .16 });
  const metal = new MeshStandardMaterial({ color: 0x5a6582, metalness: .9, roughness: .28, side: DoubleSide });
  const L = 3.35, rad = y => y < .14 ? .32 + .09 * (y / .14) : y < .5 ? .41 + .03 * ((y - .14) / .36) : y < 1.9 ? .44 : .44 * Math.pow(Math.max(0, Math.cos((y - 1.9) / 1.45 * Math.PI / 2)), .8);
  const prof = []; for (let j = 0; j <= 128; j++) { const y = j / 128 * (L - .04); prof.push(new Vector2(Math.max(rad(y), j === 128 ? 0 : .002), y)); }
  inner.add(new Mesh(new LatheGeometry(prof, 96), skin));
  // chrome nose tip and interstage rings
  const tip = new Mesh(new ConeGeometry(.045, .12, 24), chrome); tip.position.y = L - .03; inner.add(tip);
  [.62, 1.98, 2.95].forEach(y => { const ring = new Mesh(new TorusGeometry(rad(y) + .004, .011, 8, 96), chrome); ring.rotation.x = Math.PI / 2; ring.position.y = y; inner.add(ring); });
  // portholes: chrome rims, warm cabin glow
  const glass = new MeshPhysicalMaterial({ color: 0x0b1d45, emissive: 0xffc98a, emissiveIntensity: .55, roughness: .05, metalness: .1, clearcoat: 1 });
  [2.62, 2.4, 2.2].forEach((y, k) => {
    const r0 = rad(y) - .01, sz = k ? .075 : .1;
    const w = new Mesh(new CylinderGeometry(sz, sz, .04, 32), glass); w.rotation.z = Math.PI / 2; w.position.set(r0, y, 0); inner.add(w);
    const rim = new Mesh(new TorusGeometry(sz + .016, .014, 10, 32), chrome); rim.rotation.y = Math.PI / 2; rim.position.set(r0 + .012, y, 0); inner.add(rim);
  });
  // swept fins with a rounded edge and an orange leading edge
  const fs = new Shape(); fs.moveTo(.4, 1.05); fs.lineTo(.4, .08); fs.lineTo(1.02, -.3); fs.lineTo(1.04, .06); fs.quadraticCurveTo(.7, .55, .4, 1.05);
  const fg = new ExtrudeGeometry(fs, { depth: .05, bevelEnabled: true, bevelThickness: .018, bevelSize: .016, bevelSegments: 4, curveSegments: 16 }); fg.translate(0, 0, -.025);
  const edge = new Shape(); edge.moveTo(.4, 1.05); edge.quadraticCurveTo(.7, .55, 1.04, .06); edge.lineTo(1.0, .02); edge.quadraticCurveTo(.66, .5, .36, 1.0); edge.lineTo(.4, 1.05);
  const eg = new ExtrudeGeometry(edge, { depth: .08, bevelEnabled: false, curveSegments: 16 }); eg.translate(0, 0, -.04);
  const finTips = [];
  for (let k = 0; k < 4; k++) {
    const th = k * Math.PI / 2 + Math.PI / 4, f = new Mesh(fg, navy); f.rotation.y = th; inner.add(f);
    f.add(new Mesh(eg, orange));
    finTips.push(new Vector3(1.05 * Math.cos(th), -.12, -1.05 * Math.sin(th)));
  }
  // RCS thruster quads near the nose
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, pod = new Group(); pod.position.set(Math.cos(a) * .37, 2.78, -Math.sin(a) * .37); pod.rotation.y = a; inner.add(pod);
    pod.add(new Mesh(new BoxGeometry(.09, .15, .09), navy));
    [-1, 1].forEach(s => { const n = new Mesh(new ConeGeometry(.016, .04, 10, 1, true), metal); n.rotation.z = s * Math.PI / 2; n.position.set(s * .06, 0, 0); pod.add(n); });
  }
  const ant = new Mesh(new CylinderGeometry(.007, .007, .55, 6), chrome); ant.position.set(-.18, 2.6, .3); ant.rotation.x = -.35; inner.add(ant);
  // main engine: cooled bell with a glowing hot rim, and four small steering engines around it
  const bell = []; for (let j = 0; j <= 24; j++) { const t = j / 24, yb = .02 - t * .47; bell.push(new Vector2(.2 + .17 * Math.pow(t, 1.6), yb)); }
  inner.add(new Mesh(new LatheGeometry(bell, 64), metal));
  const hotRim = new Mesh(new TorusGeometry(.368, .012, 8, 64), new MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: .8, blending: AdditiveBlending, depthWrite: false }));
  hotRim.rotation.x = Math.PI / 2; hotRim.position.y = -.448; inner.add(hotRim);
  const heat = new MeshBasicMaterial({ color: 0xff7a2a, side: BackSide, transparent: true, opacity: .5, blending: AdditiveBlending, depthWrite: false });
  inner.add(new Mesh(new LatheGeometry(bell.map(v => new Vector2(v.x * .96, v.y)), 64), heat));
  const vern = new LatheGeometry([new Vector2(.035, 0), new Vector2(.045, -.05), new Vector2(.07, -.13)], 20);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, m = new Mesh(vern, metal); m.position.set(Math.cos(a) * .3, .06, -Math.sin(a) * .3); inner.add(m); }
  // side boosters (top and bottom in flight so the SKAI lettering stays visible)
  [1, -1].forEach(side => {
    const bp = []; for (let j = 0; j <= 48; j++) { const y = j / 48 * 2.5; const r = y < 2.05 ? .19 : .19 * Math.pow(Math.max(0, Math.cos((y - 2.05) / .48 * Math.PI / 2)), .7); bp.push(new Vector2(Math.max(r, j === 48 ? 0 : .002), y)); }
    const bg = new Group(); bg.position.set(0, .05, side * .66); inner.add(bg);
    bg.add(new Mesh(new LatheGeometry(bp, 48), white));
    const btip = new Mesh(new ConeGeometry(.03, .08, 16), chrome); btip.position.y = 2.5; bg.add(btip);
    const cap = new Mesh(new CylinderGeometry(.193, .193, .16, 48, 1, true), navy); cap.position.y = 1.95; bg.add(cap);
    const band2 = new Mesh(new CylinderGeometry(.193, .193, .05, 48, 1, true), orange); band2.position.y = .3; bg.add(band2);
    [.62, 1.4].forEach(y => { const r = new Mesh(new TorusGeometry(.193, .006, 6, 48), chrome); r.rotation.x = Math.PI / 2; r.position.y = y; bg.add(r); });
    bg.add(new Mesh(new LatheGeometry([new Vector2(.11, .02), new Vector2(.13, -.08), new Vector2(.18, -.24)], 32), metal));
    [.55, 1.75].forEach(y => { const st = new Mesh(new BoxGeometry(.05, .06, .3), metal); st.position.set(0, y, -side * .3); bg.add(st); });
  });
  // flame: white-hot core, turbulent flicker and shock diamonds
  flameMat = new ShaderMaterial({
    uniforms: { time: { value: 0 }, th: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float time,th;void main(){float y=vUv.y;float x=vUv.x*6.2832;
      float turb=.84+.16*sin(time*47.+y*22.+x*3.)*sin(time*29.-y*13.+x*2.);
      float dia=.66+.75*pow(max(0.,sin(y*36.-1.2)),12.)*(1.-smoothstep(.12,.55,y));
      float core=pow(max(0.,1.-y*1.6),3.);
      float a=(pow(1.-y,1.6)*turb*dia+core*.7)*min(th,1.4);
      vec3 c=mix(vec3(1.,.98,.93),vec3(1.,.58,.16),smoothstep(.0,.36,y));c=mix(c,vec3(.32,.56,1.),smoothstep(.52,1.,y));gl_FragColor=vec4(c*a*.85,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide
  });
  const cg = new ConeGeometry(.3, 2.6, 32, 1, true); cg.translate(0, 1.3, 0); cg.rotateX(-Math.PI / 2);
  flame = new Mesh(cg, flameMat); flame.position.z = -2.05; rocket.add(flame);
  const inner2 = new Mesh(cg, flameMat); inner2.scale.set(.45, .45, .5); flame.add(inner2);
  // booster flames, placed in rocket space (lathe z -> rocket -y)
  rocket.userData.bf = [1, -1].map(side => { const m = new Mesh(cg, flameMat); m.position.set(0, -side * .66, -1.95); m.scale.setScalar(.55); rocket.add(m); return m; });
  const glow = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,240,220,1)', 'rgba(255,140,60,.4)'), transparent: true, depthWrite: false, blending: AdditiveBlending }));
  glow.scale.set(1.6, 1.6, 1); glow.position.z = -2.2; rocket.add(glow); rocket.userData.glow = glow;
  // navigation lights: red / green on opposite fins, white strobe on the nose
  const navTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,.25)');
  const mk = (col, pos, sz) => { const sp = new Sprite(new SpriteMaterial({ map: navTex, color: col, transparent: true, depthWrite: false, blending: AdditiveBlending })); sp.position.copy(pos); sp.scale.set(sz, sz, 1); inner.add(sp); return sp; };
  rocket.userData.nav = [mk(0xff3b3b, finTips[0], .55), mk(0x2dff9a, finTips[2], .55), mk(0xffffff, new Vector3(0, 3.42, 0), .7)];
  rocket.userData.heat = heat; rocket.userData.hotRim = hotRim;
  nozzleLight = new PointLight(0xff8a3a, 0, 16, 1.6); nozzleLight.position.z = -2.6; rocket.add(nozzleLight);
  rocket.scale.setScalar(RS);
  rocket.visible = false;
  scene.add(rocket);
}

function buildExhaust() {
  const n = 700, g = new BufferGeometry(), pos = new Float32Array(n * 3), age = new Float32Array(n).fill(1), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = Math.random();
  g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('age', new BufferAttribute(age, 1)); g.setAttribute('seed', new BufferAttribute(seed, 1));
  const m = new ShaderMaterial({
    uniforms: { pr: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float age;attribute float seed;uniform float pr;varying float vA;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);float a=clamp(age,0.,1.);gl_PointSize=a>=1.?0.:mix(.3,1.3+seed*1.2,sqrt(a))*pr*(170./-mv.z);vA=a;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float vA;void main(){float d=length(gl_PointCoord-.5);float s=smoothstep(.5,0.,d);
      vec3 c=mix(vec3(1.,.93,.78),vec3(1.,.47,.12),smoothstep(0.,.22,vA));c=mix(c,vec3(.32,.42,.68),smoothstep(.3,.85,vA));
      float a=s*pow(1.-vA,1.6)*.85;gl_FragColor=vec4(c*a,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  const pts = new Points(g, m); pts.frustumCulled = false; scene.add(pts);
  EX = { g, n, pos, age, vel: new Float32Array(n * 3), life: new Float32Array(n).fill(1), next: 0, acc: 0 };
}
function updateExhaust(dt) {
  const e = EX;
  if (rocket.visible) {
    e.acc += dt * R.throttle * 340;
    const cnt = Math.floor(e.acc); e.acc -= cnt;
    for (let k = 0; k < cnt; k++) {
      const i = e.next, f = (k + 1) / cnt; e.next = (e.next + 1) % e.n;
      const sp = (5 + Math.random() * 6) * (.35 + R.throttle);
      e.pos[i * 3] = R.prevNozzle.x + (R.nozzle.x - R.prevNozzle.x) * f + (Math.random() - .5) * .14;
      e.pos[i * 3 + 1] = R.prevNozzle.y + (R.nozzle.y - R.prevNozzle.y) * f + (Math.random() - .5) * .14;
      e.pos[i * 3 + 2] = R.prevNozzle.z + (R.nozzle.z - R.prevNozzle.z) * f + (Math.random() - .5) * .14;
      e.vel[i * 3] = -R.fwd.x * sp + (Math.random() - .5) * 1.3 + R.vel.x * .15;
      e.vel[i * 3 + 1] = -R.fwd.y * sp + (Math.random() - .5) * 1.3 + R.vel.y * .15;
      e.vel[i * 3 + 2] = -R.fwd.z * sp + (Math.random() - .5) * 1.3 + R.vel.z * .15;
      e.life[i] = .3 + Math.random() * .45 * (.5 + R.throttle);
      e.age[i] = Math.random() * dt / e.life[i];
    }
  }
  const damp = 1 - Math.min(1, dt * 1.4);
  for (let i = 0; i < e.n; i++) {
    if (e.age[i] >= 1) continue;
    e.age[i] += dt / e.life[i];
    e.pos[i * 3] += e.vel[i * 3] * dt; e.pos[i * 3 + 1] += e.vel[i * 3 + 1] * dt; e.pos[i * 3 + 2] += e.vel[i * 3 + 2] * dt;
    e.vel[i * 3] *= damp; e.vel[i * 3 + 1] *= damp; e.vel[i * 3 + 2] *= damp;
  }
  e.g.attributes.position.needsUpdate = true; e.g.attributes.age.needsUpdate = true;
}

function buildDust() {
  const n = innerWidth < 760 ? 1400 : 2400, pos = new Float32Array(n * 3), size = new Float32Array(n), r = mulberry(21);
  for (let i = 0; i < n; i++) { pos[i * 3] = (r() - .5) * 220; pos[i * 3 + 1] = (r() - .5) * 150; pos[i * 3 + 2] = 120 - r() * 620; size[i] = .4 + r() * .9; }
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('size', new BufferAttribute(size, 1));
  const m = new ShaderMaterial({
    uniforms: { pr: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float size;uniform float pr;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);float z=-mv.z;gl_PointSize=size*pr*(60./z);vA=smoothstep(1.,5.,z)*smoothstep(260.,60.,z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d)*vA*.55;gl_FragColor=vec4(vec3(.72,.82,1.)*a,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  dust = new Points(g, m); dust.frustumCulled = false; scene.add(dust);
}

/* ---------- stop framing ---------- */
let frames = [];
const hoverPos = new Vector3(), hoverFwd = new Vector3();
let introCurve = null;
const tmpCam = new PerspectiveCamera(38, 1, .1, 10);
function frameLocal(fr, x, y, z, out = new Vector3()) { tmpCam.position.copy(fr.pos); tmpCam.lookAt(fr.look); tmpCam.updateMatrixWorld(); return out.set(x, y, z).applyMatrix4(tmpCam.matrixWorld); }
const isPortrait = () => innerWidth / innerHeight < .9;

function stopFrames() {
  const portrait = isPortrait();
  const f = [];
  f.push(portrait ? { pos: new Vector3(6, 0, 70), look: new Vector3(-4, -40, -150) } : { pos: new Vector3(-24, 10, 70), look: new Vector3(-70, -30, -150) });
  CONFIG.values.forEach(v => {
    const P = new Vector3(...v.pos), r = v.r;
    const look = portrait ? P.clone().add(new Vector3(0, -r * .85, 0)) : P.clone().add(new Vector3(-r * 1.44, 0, 0));
    const pos = look.clone().add(portrait ? new Vector3(r * .3, r * .35, r * 5.1) : new Vector3(r * .2, r * .35, r * 5.8));
    f.push({ pos, look });
  });
  f.push(portrait ? { pos: new Vector3(0, 40, 40), look: new Vector3(-5, -108, -250) } : { pos: new Vector3(130, 70, 20), look: new Vector3(-90, -60, -270) });
  return f;
}
function buildPath() {
  frames = stopFrames();
  if (planets.length) buildIndiaLights();
  if (renderer) buildConstellation();
  placeSkillCues(); placeEarth();
  const portrait = isPortrait();
  frameLocal(frames[0], portrait ? 4 : 7.2, portrait ? 1.8 : -3.2, portrait ? -30 : -27, hoverPos);
  hoverFwd.set(...CONFIG.values[0].pos).sub(hoverPos).normalize(); hoverFwd.y += .45; hoverFwd.normalize();
  introCurve = new CatmullRomCurve3([
    hoverPos.clone().add(new Vector3(12, -9, 380)), hoverPos.clone().add(new Vector3(6, -5, 220)),
    hoverPos.clone().add(new Vector3(-8, 3, 80)), hoverPos.clone().addScaledVector(hoverFwd, -10).add(new Vector3(-3, -2, 0)), hoverPos.clone()
  ], false, 'centripetal');
}
function stopCam(i, t, oP, oL) {
  const fr = frames[Math.max(0, i)]; oP.copy(fr.pos); oL.copy(fr.look);
  const r = i > 0 && i < N_STOPS - 1 ? CONFIG.values[i - 1].r : 4;
  oP.x += Math.sin(t * .13) * r * .22; oP.y += Math.sin(t * .09 + 1) * r * .1;
}

/* ---------- planet orbits ---------- */
const TILT = .4, OMEGA = .26;
function orbitAt(i, ang, oP, oT) {
  const v = CONFIG.values[i - 1], P = planets[i - 1].group.position, rad = v.r * 1.65, sx = Math.sin(TILT), cz = Math.cos(TILT);
  oP.set(P.x + Math.cos(ang) * rad, P.y + Math.sin(ang) * rad * sx, P.z + Math.sin(ang) * rad * cz);
  if (oT) oT.set(-Math.sin(ang), Math.cos(ang) * sx, Math.cos(ang) * cz).normalize();
}
function entryAngle(i) {
  const P = planets[i - 1].group.position, d = frames[i].pos.clone().sub(P);
  return Math.atan2(d.z / Math.cos(TILT), d.x) - .65;
}
function legEnd(to) {
  if (to === 0) return { pos: hoverPos.clone(), tan: hoverFwd.clone() };
  if (to === N_STOPS - 1) {
    const portrait = isPortrait(), fr = frames[to];
    const pos = frameLocal(fr, portrait ? 4 : 16, portrait ? 6 : 4, -62);
    const tan = fr.look.clone().sub(fr.pos).normalize().add(new Vector3(0, .35, 0)).normalize();
    return { pos, tan };
  }
  const ang = entryAngle(to), pos = new Vector3(), tan = new Vector3(); orbitAt(to, ang, pos, tan);
  return { pos, tan, ang };
}

/* ---------- cinematic shots ---------- */
const _r = new Vector3(), _u = new Vector3();
function basis(f) { _r.crossVectors(f, UP); if (_r.lengthSq() < 1e-4) _r.set(1, 0, 0); _r.normalize(); _u.crossVectors(_r, f).normalize(); }
const SHOTS = {
  chase: { n: '01', label: 'Chase', fn: (p, l, P, f) => { p.copy(P).addScaledVector(f, -19).addScaledVector(_u, 5.5).addScaledVector(_r, 2.4); l.copy(P).addScaledVector(f, 22); } },
  low: { n: '02', label: 'Low angle', fn: (p, l, P, f) => { p.copy(P).addScaledVector(f, -12).addScaledVector(_u, -8).addScaledVector(_r, 6.5); l.copy(P).addScaledVector(f, 6).addScaledVector(_u, 1); } },
  side: { n: '03', label: 'Side track', fn: (p, l, P, f) => { p.copy(P).addScaledVector(_r, 22).addScaledVector(_u, 3).addScaledVector(f, -4); l.copy(P).addScaledVector(f, 2); } },
  front: { n: '04', label: 'Reverse', fn: (p, l, P, f) => { p.copy(P).addScaledVector(f, 22).addScaledVector(_u, 3.5).addScaledVector(_r, 5); l.copy(P).addScaledVector(f, -3); } },
  orbit: { n: '05', label: 'Orbit', fn: (p, l, P, f, t) => { const a = t * .75; p.copy(P).addScaledVector(_r, Math.cos(a) * 19).addScaledVector(f, -Math.sin(a) * 19).addScaledVector(_u, 5.5); l.copy(P); } },
  flyby: { n: '06', label: 'Flyby', fn: (p, l, P, f, t, L) => { p.copy(L.flyby); l.copy(P); } },
  tilt: { n: '07', label: 'Tilt follow', fn: (p, l, P, f, t, L) => { p.copy(L.camPos).lerp(P, .12); l.copy(P).addScaledVector(f, 3); } }
};
const PLAN = { 0: 'chase', 1: 'tilt', 2: 'side', 3: 'orbit', 4: 'flyby', 5: 'front' };
const SWOOP = [[0, -10, 0], [0, 12, 0], [0, -14, 4], [12, 10, 0], [-12, -12, 0], [0, 18, 0], [0, 22, 0]];

let leg = null;
const _dp = new Vector3(), _dl = new Vector3(), _sp = new Vector3(), _sl = new Vector3();
const camLook = new Vector3();

function startLeg(to) {
  const from = current;
  const end = legEnd(to);
  const P0 = R.pos.clone(), f0 = R.fwd.clone();
  const dist = P0.distanceTo(end.pos), lead = Math.min(16, dist * .2);
  const sw = SWOOP[to] || [0, 10, 0];
  const mid = P0.clone().lerp(end.pos, .5).add(new Vector3(...sw));
  const curve = new CatmullRomCurve3([P0, P0.clone().addScaledVector(f0, lead), mid, end.pos.clone().addScaledVector(end.tan, -lead), end.pos], false, 'centripetal');
  const T = CONFIG.tour, dur = MathUtils.clamp(curve.getLength() / T.speed, T.legMin, T.legMax);
  const fp = curve.getPointAt(.8), ft = curve.getTangentAt(.8); basis(ft);
  const flyby = fp.clone().addScaledVector(_r, 12).addScaledVector(_u, 3.5);
  const launching = R.mode === 'hover';
  leg = { from, to, curve, dur, el: 0, shot: PLAN[to] || 'chase', flyby, end, bank: (to % 2 ? 1 : -1) * .6, camPos: camera.position.clone(), camLook: camLook.clone(), launch: launching };
  R.mode = 'leg';
  if (launching) { state.shake = 1; gsap.to(state, { shake: 0, duration: 2.2, ease: 'power2.out' }); }
  if (!Sound.play('sfx-flyby', { vol: launching ? 1 : .75, when: launching ? 0 : .2 })) { if (launching) Sound.whoosh(2.2, .22); else Sound.whoosh(1.2, .1); }
  hideTagline(); hideFinale(); playConstellation(false); rings.forEach((R, k) => hideRing(k + 1));
  bird.visible = false;
}
const pad = n => String(n).padStart(2, '0');
const smooth = (a, b, x) => { const t = MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function updateLeg(dt, t) {
  const L = leg; L.el += dt;
  const ul = Math.min(1, L.el / L.dur);
  const u = ul < .5 ? 2 * ul * ul : 1 - Math.pow(-2 * ul + 2, 2) / 2;
  L.curve.getPointAt(u, R.pos); L.curve.getTangentAt(u, R.fwd);
  R.bank = Math.sin(ul * Math.PI) * L.bank;
  R.target = L.launch && ul < .2 ? 1.5 : 1.1;
  basis(R.fwd);
  SHOTS[L.shot].fn(_dp, _dl, R.pos, R.fwd, t, L);
  // the tagline starts rising while the planet is still approaching
  if (ul >= .85 && L.to >= 1 && L.to <= CONFIG.values.length) showTagline(L.to);   // once the camera has mostly settled into the planet's framing
  const wIn = smooth(0, .24, ul), wOut = smooth(.68, 1, ul);
  _dp.lerpVectors(L.camPos, _dp, wIn); _dl.lerpVectors(L.camLook, _dl, wIn);
  stopCam(L.to, t, _sp, _sl);
  _dp.lerp(_sp, wOut); _dl.lerp(_sl, wOut);
  // never put the lens inside a planet
  planets.forEach(p => { const c = p.group.position, min = p.v.r * 1.25, d = _dp.distanceTo(c); if (d < min) _dp.sub(c).multiplyScalar(min / Math.max(d, .001)).add(c); });
  { const d = _dp.distanceTo(R.pos), min = 11; if (d < min) _dp.sub(R.pos).multiplyScalar(min / Math.max(d, .001)).add(R.pos); }
  state.p = L.from + (L.to - L.from) * ul;
  state.fovPunch = Math.sin(ul * Math.PI) * 5;
  state.legWarp = REDUCED ? 0 : Math.sin(ul * Math.PI) * .085;
  if (ul >= 1) arrive();
}

function arrive() {
  const L = leg; leg = null; const i = L.to;
  if (i === 0) R.mode = 'hover';
  else if (i === N_STOPS - 1) { R.mode = 'depart'; R.v = 20; R.fwd.copy(L.end.tan); }
  else { R.mode = 'orbit'; R.orbitIdx = i; R.ang = L.end.ang; }
  state.fovPunch = 0; state.legWarp = 0;
  bird.visible = i === 0 || i === N_STOPS - 1; bird.userData.u = .56; bird.userData.hist.length = 0;
  if (i === N_STOPS - 1) { playConstellation(true); if (constel) R.fwd.copy(constel.center).sub(R.pos).normalize(); }
  onArrive(i);
}

/* ---------- rocket per-frame ---------- */
const _o = new Vector3();
function updateRocket(dt, t) {
  if (!rocket.visible) return;
  if (R.mode === 'intro') {
    const k = MathUtils.clamp(state.rIntro, 0, 1);
    introCurve.getPointAt(k, R.pos); introCurve.getTangentAt(k, R.fwd);
    if (k >= 1) R.fwd.copy(hoverFwd);
    R.bank = Math.sin(k * Math.PI) * -.7; R.target = k < .95 ? 1.2 : .3;
  } else if (R.mode === 'hover') {
    R.pos.copy(hoverPos); R.pos.y += Math.sin(t * 1.4) * .22; R.pos.x += Math.sin(t * .7) * .12;
    R.fwd.lerp(hoverFwd, Math.min(1, dt * 2)).normalize();
    R.bank *= .95; R.target = .28;
  } else if (R.mode === 'orbit') {
    R.ang += OMEGA * dt; orbitAt(R.orbitIdx, R.ang, R.pos, R.fwd);
    R.bank += (-.35 - R.bank) * Math.min(1, dt * 2); R.target = .4;
  } else if (R.mode === 'depart') {
    R.v += 14 * dt; R.pos.addScaledVector(R.fwd, R.v * dt); R.target = 1.4; R.bank *= .97;
    if (R.pos.distanceTo(camera.position) > 1400) rocket.visible = false;
  }
  R.vel.subVectors(R.pos, R.prev).divideScalar(Math.max(dt, 1e-3)); R.prev.copy(R.pos);
  R.throttle += (R.target - R.throttle) * Math.min(1, dt * 3);
  rocket.position.copy(R.pos);
  _o.copy(R.pos).add(R.fwd); rocket.lookAt(_o); rocket.rotateZ(R.bank);
  const fl = .55 + R.throttle * .75 + Math.sin(t * 40) * .05;
  flame.scale.set(.75 + R.throttle * .3, .75 + R.throttle * .3, fl);
  flameMat.uniforms.time.value = t; flameMat.uniforms.th.value = R.throttle;
  rocket.userData.glow.material.opacity = Math.min(.8, .25 + R.throttle * .45);
  nozzleLight.intensity = R.throttle * 30;
  rocket.userData.bf.forEach(m => m.scale.set(.5, .5, .35 + R.throttle * .45 + Math.sin(t * 37) * .03));
  rocket.userData.heat.opacity = .25 + R.throttle * .45;
  rocket.userData.hotRim.material.opacity = .35 + R.throttle * .5;
  const nav = rocket.userData.nav, blink = (Math.sin(t * 5) > .55) ? 1 : .12, strobe = ((t * 1.1) % 1) < .06 || (((t * 1.1) % 1) > .14 && ((t * 1.1) % 1) < .2) ? 1 : 0;
  nav[0].material.opacity = blink; nav[1].material.opacity = blink; nav[2].material.opacity = strobe;
  R.prevNozzle.copy(R.nozzle);
  R.nozzle.copy(R.pos).addScaledVector(R.fwd, -2.15 * RS);
  if (!R.started) { R.prevNozzle.copy(R.nozzle); R.started = true; }
  Sound.setEngine(R.throttle);
}

/* ---------- camera per-frame ---------- */
const _right = new Vector3(), _up2 = new Vector3();
function updateCamera(dt, t) {
  if (!leg) {
    stopCam(Math.max(0, current), t, _dp, _dl);
    if (state.intro < 1) { _dp.z += (1 - state.intro) * 300; _dp.y += (1 - state.intro) * 10; }
  }
  camLook.copy(_dl);
  state.mx += (state.tmx - state.mx) * Math.min(1, dt * 3); state.my += (state.tmy - state.my) * Math.min(1, dt * 3);
  camera.position.copy(_dp); camera.lookAt(_dl);
  const par = leg ? .3 : 1;
  _right.setFromMatrixColumn(camera.matrixWorld, 0); _up2.setFromMatrixColumn(camera.matrixWorld, 1);
  camera.position.addScaledVector(_right, state.mx * 2.2 * par).addScaledVector(_up2, -state.my * 1.4 * par);
  if (state.shake > .001) camera.position.add(_o.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(state.shake * .45));
  camera.lookAt(_dl);
  const fov = state.fovBase + state.warp * 30 + (state.fovPunch || 0);
  if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!state.rendering || document.hidden || state.ctxLost) { clock.last = now; return; }
  const raw = (now - clock.last) / 1000, dt = Math.min(.05, raw); clock.last = now; clock.t += dt;
  const t = clock.t;
  stars.material.uniforms.time.value = t;
  planets.forEach((p, i) => {
    p.body.rotation.y += dt * p.spin;
    if (p.clouds) { p.clouds.rotation.y += dt * p.spin * 1.35; p.clouds.material.uniforms.time.value = t; }
    if (p.belt) p.belt.rotation.y += dt * .03;
    if (p.aurora) p.aurora.material.uniforms.time.value = t;
    if (p.moons) { p.moons.sys.rotation.y += dt * .12; p.moons.pair.rotation.y += dt * .7; }
    if (p.indiaMats) p.indiaMats.forEach(m => m.uniforms.time.value = t);
    p.mat.uniforms.time.value = t;
  });
  if (leg) updateLeg(dt, t);
  updateRocket(dt, t);
  updateCamera(dt, t);
  camera.updateMatrixWorld();
  updateExhaust(dt);
  updateWarp(dt);
  updateBird(dt, t);
  updateSkillCues(dt, t);
  updateRings(dt);
  updateEarth(dt, t);
  if (constel && constel.group.visible) { constel.sm.uniforms.prog.value = constel.prog; constel.sm.uniforms.time.value = t; constel.lg.setDrawRange(0, Math.floor(constel.prog * constel.n)); }
  finish.uniforms.time.value = t;
  finish.uniforms.ca.value = (Q.touch ? 0 : .0004) + state.warp * .012 + (leg ? .0005 : 0);   // fringe mostly for the warp only
  watchFrameRate(raw);
  composer.render();
}

/* =====================================================================
   DOOR → WARP → SPACE
   ===================================================================== */
async function openDoor() {
  if (!sceneOk) { $('#cap1').textContent = 'Preparing launch'; await sceneReady; }   // rarely needed: the world builds during the scan and briefing
  if (entranceTl) { entranceTl.progress(1).kill(); entranceTl = null; }
  state.rendering = true; state.t0 = performance.now();
  if (Sound.play('sfx-door', { vol: .95 })) Sound.play('sfx-warp', { when: 1.0, vol: .9 }); else { Sound.whoosh(2.6); Sound.riser(3.2); }
  if (!Sound.startAmbient()) Sound.startDrone();
  Sound.startEngine();
  if (rocket) { rocket.visible = true; R.mode = 'intro'; }
  const tl = gsap.timeline();
  if (REDUCED || !renderer) {
    tl.to('#lock, #skip', { opacity: 0, duration: .4 })
      .to('#door', { opacity: 0, duration: .6 })
      .add(() => { state.intro = 1; state.rIntro = 1; afterDoor(); });
    return;
  }
  ringSpin.forEach(t => gsap.to(t, { timeScale: 14, duration: .6, ease: 'power2.in' }));
  tl.to('#skip', { opacity: 0, duration: .3 }, 0)
    .to('.lock-title, .lock-caption, .readout', { opacity: 0, y: 8, duration: .4, ease: 'power2.in' }, 0)
    .to('.r1', { scale: 1.7, opacity: 0, duration: .9, ease: 'power3.in', svgOrigin: '200 200' }, .1)
    .to('.r2', { scale: 1.45, opacity: 0, duration: .9, ease: 'power3.in', svgOrigin: '200 200' }, .15)
    .to('.r3, #prog', { scale: 1.25, opacity: 0, duration: .9, ease: 'power3.in', svgOrigin: '200 200' }, .2)
    .to('.r4', { scale: .6, opacity: 0, duration: .7, ease: 'power3.in', svgOrigin: '200 200' }, .2)
    .to('#core', { scale: .4, opacity: 0, duration: .6, ease: 'power3.in' }, .45)
    .to('.bulk.top', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, .6)
    .to('.bulk.bot', { yPercent: 100, duration: 1, ease: 'expo.inOut' }, .6)
    .to('.door-light', { opacity: 0, duration: 1 }, .8)
    .to('#door', { scale: 1.22, duration: 2.3, ease: 'power2.in', transformOrigin: '50% 50%' }, .7)
    .to('.door-half.l', { xPercent: -100, duration: 2.1, ease: 'expo.inOut' }, .8)
    .to('.door-half.r', { xPercent: 100, duration: 2.1, ease: 'expo.inOut' }, .8)
    .fromTo('#flash', { opacity: 0 }, { opacity: .85, duration: .5, ease: 'power2.in' }, 1.0)
    .to('#flash', { opacity: 0, duration: 1.4, ease: 'power2.out' }, 1.5)
    .to(state, { warp: 1, duration: .9, ease: 'power2.in' }, 1.0)
    .to(state, { intro: 1, duration: 3.6, ease: 'expo.out' }, 1.3)
    .to(state, { rIntro: 1, duration: 4.2, ease: 'power2.inOut' }, 1.1)
    .add(() => { if (!Sound.has('sfx-warp')) Sound.whoosh(1.4, .16); }, 2.6)
    .to(state, { warp: 0, duration: 2.0, ease: 'power3.out' }, 2.1)
    .add(afterDoor, 3.4);
}

function afterDoor() {
  $('#door').style.display = 'none'; $('#lock').style.display = 'none'; $('#skip').style.display = 'none';
  state.inSpace = true;
  if (renderer && R.mode === 'intro') { R.mode = 'hover'; }
  if (bird.userData) { bird.visible = true; bird.userData.u = .3; bird.userData.hist.length = 0; }
  $('#top').classList.add('show');
  current = 0; setAccent(0);
  Sound.vo('vo-welcome', .3);
  startTour();
}

/* =====================================================================
   TOUR: plays by itself. One tagline per planet, then the finale.
   ===================================================================== */
let current = -1;   // the stop the rocket is at (or flying to): 0 start, 1..n planets, n+1 finale
let tourCall = null, tagShown = -1;
function setAccent(i) {
  document.documentElement.style.setProperty('--pa', i > 0 && i <= CONFIG.values.length ? CONFIG.values[i - 1].atmo : '#FCA01B');
}
let lbOn = false;
// bar height from the visible height (innerHeight), not vh, which includes the area behind mobile toolbars
function letterbox(on, instant) {
  lbOn = on;
  const h = Math.round(innerHeight * (isPortrait() ? .13 : .11));
  document.documentElement.style.setProperty('--lbh', h + 'px');
  gsap.to('#lb .bar', { height: on ? h : 0, duration: instant ? 0 : on ? .9 : 1.1, ease: on ? 'expo.out' : 'expo.inOut', overwrite: true });
}
function startTour() {
  tourCall?.kill();
  letterbox(true);
  tourCall = gsap.delayedCall(REDUCED || !renderer ? 1.2 : CONFIG.tour.introHold, () => go(1));
}
// runs once the rocket has reached stop i (after a flight, or after an instant jump)
function onArrive(i) {
  tourCall?.kill();
  if (i >= 1 && i <= CONFIG.values.length) {
    showTagline(i);
    const hold = Math.max(CONFIG.tour.hold, Sound.dur('vo-' + i) + .1);   // let the voice-over finish its line
    tourCall = gsap.delayedCall(hold + (REDUCED || !renderer ? 1 : 0), () => go(i + 1));
  } else if (i === N_STOPS - 1) {
    letterbox(false);
    showFinale(); showAllRings();
  }
}

// lines never wrap or spill toward the planet: step the size down until both fit the box
function fitLines() {
  const box = $('#tag .in'), lines = $$('#tag p');
  lines.forEach(l => { l.style.fontSize = ''; });
  const max = box.clientWidth; if (!max) return;
  let fs = parseFloat(getComputedStyle(lines[0]).fontSize);
  while (lines.some(l => l.scrollWidth > max + 1) && fs > 20) { fs -= 1; lines.forEach(l => { l.style.fontSize = fs + 'px'; }); }
}
function showTagline(i) {
  if (tagShown === i) return; tagShown = i;
  const v = CONFIG.values[i - 1], el = $('#tag');
  setAccent(i);
  $('#tA').textContent = v.line[0]; $('#tB').textContent = v.line[1] || '';
  // skill badge + text colour from SKILLS (config.js)
  const sk = SKILLS[v.skill], chip = $('#chip');
  chip.hidden = !sk;
  if (sk) {
    el.style.setProperty('--sk-from', sk.from); el.style.setProperty('--sk-to', sk.to); el.style.setProperty('--sk-ink', sk.ink);
    chip.dataset.skill = v.skill; $('#chipLbl').textContent = sk.name; $('#chipIco').innerHTML = SKILL_ICONS[v.skill] || '';
  }
  gsap.killTweensOf([el, '#tag .in', '#tag .mask>span', '#chip']);
  el.classList.add('show'); gsap.set(el, { opacity: 1 }); gsap.set('#tag .in', { y: 0 }); gsap.set('#chip', { opacity: 1, x: 0 });
  fitLines();
  popSkillCue(i); showRing(i);
  if (sk && !Sound.play('sfx-' + v.skill, { vol: .7 })) Sound.skill(v.skill);
  Sound.vo('vo-' + i, .35);
  if (REDUCED) return;
  gsap.fromTo('#chip', { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: .8, ease: 'expo.out' });
  gsap.fromTo('#tag .mask>span', { yPercent: 110 }, { yPercent: 0, duration: 1.1, stagger: .12, ease: 'expo.out', delay: .05 });
}
// small white icons for the skill badge (drawn for this page in the SKAI HUD style)
const SKILL_ICONS = {
  robotics: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 4.5V8M2.5 12.5v3M21.5 12.5v3M9.5 16h5"/><circle cx="12" cy="3.6" r="1.1" fill="#fff"/><circle cx="9.3" cy="12.3" r="1.3" fill="#fff" stroke="none"/><circle cx="14.7" cy="12.3" r="1.3" fill="#fff" stroke="none"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><path d="M12 1.8 21 7v10l-9 5.2L3 17V7z" fill="#FCA01B" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9l4 3-4 3M12 12h4.5" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="9" r="1.5" fill="#fff"/><circle cx="8" cy="15" r="1.5" fill="#fff"/><circle cx="12" cy="12" r="1.6" fill="#fff"/><circle cx="16.5" cy="12" r="1.5" fill="#fff"/></svg>',
  coding: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="5" width="14" height="14" rx="1.5" fill="#108D55"/><path d="M8.5 2v3M12 2v3M15.5 2v3M8.5 19v3M12 19v3M15.5 19v3M2 8.5h3M2 12h3M2 15.5h3M19 8.5h3M19 12h3M19 15.5h3"/><path d="M10.2 9.8 8 12l2.2 2.2M13.8 9.8 16 12l-2.2 2.2" stroke-linejoin="round"/></svg>',
  mechanics: '<svg viewBox="0 0 24 24"><path d="M10.4 1.5h3.2l.5 2.9 1.9.8 2.4-1.7 2.3 2.3-1.7 2.4.8 1.9 2.9.5v3.2l-2.9.5-.8 1.9 1.7 2.4-2.3 2.3-2.4-1.7-1.9.8-.5 2.9h-3.2l-.5-2.9-1.9-.8-2.4 1.7-2.3-2.3 1.7-2.4-.8-1.9-2.9-.5v-3.2l2.9-.5.8-1.9-1.7-2.4 2.3-2.3 2.4 1.7 1.9-.8z" fill="#FCA01B" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="#154777" stroke="#fff" stroke-width="1.3"/></svg>'
};
function hideTagline() {
  if (tagShown > 0) hideRing(tagShown);
  tagShown = -1;
  const el = $('#tag'); if (!el.classList.contains('show')) return;
  gsap.killTweensOf([el, '#tag .in']);
  gsap.to('#tag .in', { y: -10, duration: .35, ease: 'power2.in' });
  gsap.to(el, { opacity: 0, duration: .35, ease: 'power2.in', onComplete: () => el.classList.remove('show') });
}
function showFinale() {
  const l = $('#launch'); gsap.killTweensOf(l); l.classList.add('show'); gsap.set(l, { opacity: 1 });
  Sound.play('sfx-finale', { vol: .85, when: .3 }); Sound.vo('vo-finale', 1.4);
  if (!REDUCED) gsap.fromTo('#launch .in > *', { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, stagger: .1, ease: 'expo.out', delay: .4 });
}
function hideFinale() {
  const l = $('#launch'); if (!l.classList.contains('show')) return;
  gsap.killTweensOf(l);
  gsap.to(l, { opacity: 0, duration: .35, ease: 'power2.in', onComplete: () => l.classList.remove('show') });
}
function replay() {
  tourCall?.kill(); hideFinale(); playConstellation(false); leg = null;
  rings.forEach((R, k) => hideRing(k + 1));
  current = 0; state.p = 0; setAccent(0);
  if (renderer) {
    rocket.visible = true; R.mode = 'hover'; R.pos.copy(hoverPos); R.fwd.copy(hoverFwd);
    bird.visible = true; bird.userData.u = .3; bird.userData.hist.length = 0;
  }
  startTour();
}

function go(i) {
  i = MathUtils.clamp(i, 0, N_STOPS - 1);
  if (!state.inSpace) return;
  if (leg ? leg.to === i : i === current) return;
  hideTagline();
  if (REDUCED || !renderer) {
    current = i; state.p = i; setAccent(i);
    if (renderer) {
      if (i === 0) R.mode = 'hover';
      else if (i === N_STOPS - 1) { const e = legEnd(i); R.pos.copy(e.pos); R.fwd.copy(e.tan); R.mode = 'depart'; R.v = 20; rocket.visible = true; }
      else { R.mode = 'orbit'; R.orbitIdx = i; R.ang = entryAngle(i); rocket.visible = true; }
      bird.visible = i === 0 || i === N_STOPS - 1;
    }
    playConstellation(i === N_STOPS - 1);
    onArrive(i); return;
  }
  if (!rocket.visible) { rocket.visible = true; const e = legEnd(current); R.pos.copy(e.pos); R.fwd.copy(e.tan); }
  startLeg(i);
  current = i;
}

/* ---------- logo constellation finale ---------- */
let constel = null;
function buildConstellation() {
  if (constel) { scene.remove(constel.group); }
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M24 25.5C18.6 19.6 10.8 15.6 2 15.2c7.4 2.6 13.6 7.1 18 13.2L17.6 41 24 34.6 30.4 41 28 28.4c4.4-6.1 10.6-10.6 18-13.2-8.8.4-16.6 4.4-22 10.3Z');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.style.cssText = 'position:absolute;width:0;height:0'; svg.appendChild(path); document.body.appendChild(svg);
  const L = path.getTotalLength(), N = 34, pts2 = [];
  for (let i = 0; i < N; i++) { const q = path.getPointAtLength(i / N * L); pts2.push([q.x, q.y]); }
  svg.remove();
  const portrait = isPortrait(), fr = frames[N_STOPS - 1];
  const cx = portrait ? 4 : 50, cy = portrait ? 20 : -15, z = -150, sc = portrait ? .7 : 1.2;
  const pts = pts2.map(([x, y]) => frameLocal(fr, cx + (x - 24) * sc, cy - (y - 26) * sc, z));
  const g = new Group();
  const sg = new BufferGeometry().setFromPoints(pts);
  const seeds = new Float32Array(N).map((_, i) => i / N); sg.setAttribute('idx', new BufferAttribute(seeds, 1));
  const sm = new ShaderMaterial({
    uniforms: { prog: { value: 0 }, time: { value: 0 }, pr: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float idx;uniform float prog,time,pr;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);float on=smoothstep(idx-.02,idx+.02,prog);vA=on*(.75+.25*sin(time*3.+idx*40.));gl_PointSize=(5.+3.*fract(idx*7.3))*pr*vA*(150./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vec3(.85,.95,1.)*a*a*vA*2.,1.);}`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  g.add(new Points(sg, sm));
  const lg = new BufferGeometry().setFromPoints([...pts, pts[0]]);
  const lm = new LineBasicMaterial({ color: 0x17BDE0, transparent: true, opacity: .6, blending: AdditiveBlending, depthWrite: false });
  const line = new Line(lg, lm); lg.setDrawRange(0, 0); g.add(line);
  const center = pts.reduce((a, b) => a.add(b), new Vector3()).divideScalar(N);
  g.visible = false; scene.add(g);
  constel = { group: g, sm, lg, n: N + 1, center, prog: 0 };
}
function playConstellation(on) {
  if (!constel) return;
  gsap.killTweensOf(constel);
  if (!on) { constel.group.visible = false; constel.prog = 0; return; }
  constel.group.visible = true; constel.prog = 0;
  gsap.to(constel, { prog: 1, duration: REDUCED ? .01 : 3, delay: REDUCED ? 0 : 1.4, ease: 'power1.inOut', onStart: () => Sound.blip(660, .3, 'sine', .05) });
}

function syncSound() {
  const s = $('#sound'); s.classList.toggle('off', !Sound.on); s.setAttribute('aria-pressed', Sound.on);
  $('#soundTxt').textContent = Sound.on ? 'Sound on' : 'Sound off';
}
function initInput() {
  // gentle mouse parallax only; the tour itself needs no input
  addEventListener('pointermove', e => { state.tmx = (e.clientX / innerWidth - .5) * 2; state.tmy = (e.clientY / innerHeight - .5) * 2; });
  $('#replay').addEventListener('click', replay);
  $('#ctaLink').href = CONFIG.ctaUrl;
  if (KIOSK) {
    let idle = 0; const bump = () => { idle = 0; };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, bump, { passive: true }));
    setInterval(() => { if (++idle > 75) location.reload(); }, 1000);
    addEventListener('pointerdown', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); }, { once: true });
  }
  $('#sound').addEventListener('click', () => { Sound.init(); Sound.set(!Sound.on); syncSound(); });
  let rebuild = null;
  addEventListener('resize', () => {
    if ($('#tag').classList.contains('show')) fitLines();
    if (lbOn) letterbox(true, true);
    if (!sceneOk) return;
    applySize(); camera.aspect = innerWidth / innerHeight;
    state.fovBase = isPortrait() ? 50 : 38; camera.updateProjectionMatrix();
    clearTimeout(rebuild); rebuild = setTimeout(buildPath, 180);   // stop frames, constellation, cue spots: once, after rotating
  });
  // pause the sound engine with the tab (rendering already pauses)
  document.addEventListener('visibilitychange', () => { if (!Sound.ctx) return; if (document.hidden) Sound.ctx.suspend(); else Sound.ctx.resume(); });
  document.fonts?.ready.then(() => { if ($('#tag').classList.contains('show')) fitLines(); });
}

/* =====================================================================
   BOOT
   ===================================================================== */
// compile every shader and upload every texture now (behind the loading screen), including things that are hidden
// until later (rocket, Earth, rings, skill objects), then render one frame through the whole effects chain.
// Otherwise each would compile and upload on first appearance, which is the stutter at the door and the launch.
async function prewarm() {
  const hidden = []; scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
  const seen = new Set(), up = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); renderer.initTexture(t); } };
  scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach(m => { for (const k in m) up(m[k]); if (m.uniforms) for (const k in m.uniforms) up(m.uniforms[k].value); }); });
  composer.render();
  hidden.forEach(o => { o.visible = false; });
}
const nextFrame = () => new Promise(r => { requestAnimationFrame(() => r()); setTimeout(r, 120); });
function bootStep(p, label) {
  const bar = $('#bootBar'); if (!bar) return;
  bar.style.animation = 'none'; bar.style.transform = `scaleX(${p})`;
  if (label) $('#bootLbl').textContent = label;
}
// the 3D world: built, baked and pre-warmed in the background while the visitor scans in and watches the briefing
let sceneReady = Promise.resolve(false), sceneOk = false;
async function buildScene() {
  const ok = await initThree();
  if (!ok) { state.rendering = false; bird = { visible: false, userData: null }; return false; }
  await bakePlanets();
  state.fovBase = isPortrait() ? 50 : 38;
  camera.fov = state.fovBase; camera.updateProjectionMatrix();
  state.intro = 0; current = 0; updateCamera(0, 0); current = -1; camera.updateMatrixWorld();
  await nextFrame(); await prewarm();
  sceneOk = true; requestAnimationFrame(frame);
  return true;
}
async function boot() {
  bootStep(.35, 'Loading star charts'); await nextFrame();
  $('#srValues').innerHTML = '<h2>SKAI Space</h2><p>2040. The jobs of tomorrow don’t have names yet. How do you prepare for a world no one can map?</p>' + CONFIG.values.map(v => `<p>${SKILLS[v.skill] ? SKILLS[v.skill].name + ': ' : ''}${v.line.join(' ')}</p>`).join('') + '<p><a href="' + CONFIG.ctaUrl + '">Visit skaispace.ai</a></p>';
  // the lock is ready almost at once; the 3D world is not needed until the door opens
  initLock(); initInput();
  entranceTl?.pause(0);   // the lock's entrance waits for the loading screen
  sceneReady = buildScene();
  bootStep(.8, 'Sealing the bay');
  await Promise.race([document.fonts ? document.fonts.ready : null, new Promise(r => setTimeout(r, 2500))]);
  bootStep(1); Sound.preload(); await new Promise(r => setTimeout(r, 280));
  const ld = $('#boot'); ld.classList.add('done'); setTimeout(() => ld.remove(), 700);
  entranceTl?.play(0);
  if (location.hash === '#space') { Sound.on = false; syncSound(); grant(true); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
