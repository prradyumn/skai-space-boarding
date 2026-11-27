// Edit content here: one planet per domain, the skills shown in the briefing, and the timing of the self-playing tour.
// Source: SKAI Space framework (6 carrier domains, 10 skills in 5 groups; Grades 3-9, NCF-SE 2023, CBSE CT&AI).
/* =====================================================================
   CONFIG
   ===================================================================== */

// Domains (the "carriers": the build is how a skill gets taught). One planet each.
// Robotics, AI & Data and the steel plate come from the per-skill HUD frames in the SKAI Figma file (Skai-Design › Final);
// the others use the SKAI palette. color: plate colour · from/to: badge gradient · ink: tint for text on the sky · cue: 3D object
// (The object is still called SKILLS in code; each key is a domain.)
export const SKILLS = {
  mechanics:        { name: 'Structures & Mechanical', short: 'Structures', color: '#FCA01B', from: '#154777', to: '#2784DD', ink: '#FCA01B', cue: 'gears' },
  electronics:      { name: 'Electronics',            color: '#108D55', from: '#108D55', to: '#18AC6A', ink: '#45CDB5', cue: 'circuit' },
  robotics:         { name: 'Robotics',               color: '#E91FA8', from: '#961477', to: '#FC22B3', ink: '#FC4FC4', cue: 'arm' },
  ai:               { name: 'AI & Data',              color: '#2E48A3', from: '#2E48A3', to: '#0A2D94', ink: '#17BDE0', cue: 'neural' },
  design:           { name: 'Design & Innovation',    short: 'Design', color: '#F5A524', from: '#B96D00', to: '#F5A524', ink: '#FEE714', cue: 'bulb' },
  entrepreneurship: { name: 'Entrepreneurship',       color: '#707CEC', from: '#3B2F9E', to: '#707CEC', ink: '#A9B1FF', cue: 'chart' }
};

// Skills (the "cargo": what gets assessed), in 5 groups. Shown on the briefing's route screen.
export const SKILL_GROUPS = [
  { name: 'Thinking', color: '#17BDE0', skills: ['Critical thinking', 'Creative thinking'] },
  { name: 'Social',   color: '#FC4FC4', skills: ['Empathy & perspective-taking', 'Communication', 'Collaboration'] },
  { name: 'Making',   color: '#FCA01B', skills: ['Making and iteration'] },
  { name: 'Self',     color: '#45CDB5', skills: ['Agency and self-direction', 'Responsible action'] },
  { name: 'Digital',  color: '#A9B1FF', skills: ['Computational thinking', 'Coding and algorithms'] }
];

export const CONFIG = {
  ctaUrl: 'https://www.skaispace.ai/',

  // Seconds. introHold: rocket hovers before the first flight · hold: time parked at each planet (at least the voice line)
  // speed: flight speed (units/s) · legMin/legMax: shortest and longest flight
  tour: { introHold: 1.2, hold: 2.0, speed: 46, legMin: 2.6, legMax: 3.6 },

  // One planet per domain, in framework order. line: [first line, second line] (voice file vo-<n>) · skill: a key of SKILLS.
  // DRAFT lines (need sign-off): Electronics "Every circuit / starts with a spark." · Design "Imagine it. / Then build it."
  // The rest is the planet's look; atmo is its glow colour.
  values: [
    // belt: false drops the asteroid belt; cueSpot sets the gears in clear sky below the planet (decluttered opener)
    { line: ['Not a lab.', 'A launchpad.'], skill: 'mechanics', belt: false, cueSpot: { land: { nx: .8, ny: -.5, h: .22 } },
      c: ['#17110f', '#6e4a3c', '#d2ad95'], atmo: '#FCA01B', r: 7, pos: [-16, 3, -70], scale: 3.6, bands: 0, bandMix: 0, rock: 1 },
    { line: ['Every circuit', 'starts with a spark.'], skill: 'electronics',
      c: ['#032820', '#13a37d', '#cbffea'], atmo: '#45CDB5', r: 9, pos: [24, -5, -150], scale: 2.1, bands: 6, bandMix: .3, rock: 0, ring: true },
    // cueSpot (optional) moves this planet's 3D cue in its shot: here the arm sits off the planet, in clear sky
    { line: ['Lead the AI race.', 'Or follow it.'], skill: 'robotics', cueSpot: { land: { nx: .84, ny: -.52, h: .18 } },
      c: ['#1c0623', '#8a2a86', '#f4c4ea'], atmo: '#E91FA8', r: 7, pos: [-22, 5, -230], scale: 1.9, bands: 0, bandMix: 0, rock: 0, clouds: true, aurora: true },
    { line: ['Lead the AI future.', 'Not just follow it.'], skill: 'ai',
      c: ['#3a1206', '#c9572a', '#f2c39a'], atmo: '#FCA01B', r: 10, pos: [20, -3, -310], scale: 2.4, bands: 15, bandMix: .8, rock: 0, swirl: 1 },
    { line: ['Imagine it.', 'Then build it.'], skill: 'design',
      c: ['#2e1d02', '#c98a1a', '#ffe9a8'], atmo: '#F5A524', r: 8, pos: [-24, 6, -390], scale: 2.0, bands: 9, bandMix: .55, rock: 0, moons: true },
    { line: ['Future-proof', 'your school.'], skill: 'entrepreneurship',
      c: ['#120e3a', '#5b4fd1', '#dde0ff'], atmo: '#707CEC', r: 9, pos: [6, -4, -470], scale: 2.2, bands: 4, bandMix: .25, rock: 0, clouds: true }
  ]
};
