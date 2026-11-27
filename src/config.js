// Edit content here: one planet per tagline (each carries one skill), plus the timing of the self-playing tour.
/* =====================================================================
   CONFIG
   ===================================================================== */

// Skill styles, taken from the per-skill HUD frames in the SKAI Figma file (Skai-Design › Final).
// color: the skill's plate colour · ink: the brighter tint used for text on the dark sky · cue: which 3D object to build
export const SKILLS = {
  robotics:  { name: 'Robotics',  color: '#E91FA8', from: '#961477', to: '#FC22B3', ink: '#FC4FC4', cue: 'arm' },
  ai:        { name: 'AI & Data', color: '#2E48A3', from: '#2E48A3', to: '#0A2D94', ink: '#17BDE0', cue: 'neural' },
  coding:    { name: 'Coding',    color: '#108D55', from: '#108D55', to: '#18AC6A', ink: '#45CDB5', cue: 'terminal' },
  mechanics: { name: 'Mechanics', color: '#FCA01B', from: '#154777', to: '#2784DD', ink: '#FCA01B', cue: 'gears' }
};

export const CONFIG = {
  ctaUrl: 'https://www.skaispace.ai/',

  // Seconds. From the door opening to the finale is about 25 s (about 30 s from the tap).
  // introHold: rocket hovers before the first flight · hold: time parked at each planet
  // speed: flight speed (units/s) · legMin/legMax: shortest and longest flight
  tour: { introHold: 1.2, hold: 2.0, speed: 46, legMin: 2.6, legMax: 3.6 },

  // line: [first line, second line] · skill: a key of SKILLS (badge, text colour and the 3D cue beside the planet)
  // The rest is the planet's look; atmo is its glow colour.
  values: [
    // cueSpot (optional) moves this planet's 3D cue in its shot: here the arm sits off the planet, in clear sky
    { line: ['Not a lab.', 'A launchpad.'], skill: 'robotics', cueSpot: { land: { nx: .84, ny: -.52, h: .18 } },
      c: ['#1c0623', '#8a2a86', '#f4c4ea'], atmo: '#E91FA8', r: 7, pos: [-16, 3, -70], scale: 1.9, bands: 0, bandMix: 0, rock: 0, clouds: true, aurora: true },
    { line: ['Lead the AI future.', 'Not just follow it.'], skill: 'ai',
      c: ['#3a1206', '#c9572a', '#f2c39a'], atmo: '#FCA01B', r: 10, pos: [24, -5, -150], scale: 2.4, bands: 15, bandMix: .8, rock: 0, swirl: 1 },
    { line: ['Lead the AI race.', 'Or follow it.'], skill: 'coding',
      c: ['#032820', '#13a37d', '#cbffea'], atmo: '#45CDB5', r: 9, pos: [-22, 5, -230], scale: 2.1, bands: 6, bandMix: .3, rock: 0, ring: true },
    { line: ['Future-proof', 'your school.'], skill: 'mechanics',
      c: ['#17110f', '#6e4a3c', '#d2ad95'], atmo: '#FCA01B', r: 7, pos: [8, -3, -320], scale: 3.6, bands: 0, bandMix: 0, rock: 1 }
  ]
};
