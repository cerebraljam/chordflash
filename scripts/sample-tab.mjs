// Writes samples/ode-to-joy.gp: a real Guitar Pro 7 file to try the Riffs mode
// without downloading one. Ode to Joy (Beethoven, public domain) in C: melody,
// chords (with chord names) and bass, in three sections.
//
//   node scripts/sample-tab.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import * as alphaTab from '@coderline/alphatab';

// alphaTex: fret.string.duration, strings counted from the highest (1).
// Melody notes: E4 = 0.1, F4 = 1.1, G4 = 3.1, C4 = 1.2, D4 = 3.2, G3 = 0.3.
const A1 = '0.1.4 0.1.4 1.1.4 3.1.4 | 3.1.4 1.1.4 0.1.4 3.2.4 | 1.2.4 1.2.4 3.2.4 0.1.4 |';
const MELODY = [
  `\\section "A" ${A1} 0.1.4 {d} 3.2.8 3.2.2 |`,
  `${A1} 3.2.4 {d} 1.2.8 1.2.2 |`,
  `\\section "B" 3.2.4 3.2.4 0.1.4 1.2.4 | 3.2.4 0.1.8 1.1.8 0.1.4 1.2.4 | 3.2.4 0.1.8 1.1.8 0.1.4 3.2.4 | 1.2.4 3.2.4 0.3.2 |`,
  `\\section "A'" ${A1} 3.2.4 {d} 1.2.8 1.2.2`,
].join(' ');

const C = '(0.1 1.2 0.3 2.4 3.5).2 {ch "C"}';
const G = '(3.1 0.2 0.3 0.4 2.5 3.6).2 {ch "G"}';
const bar = (a, b = a) => `${a} ${b} |`;
const CHORDS = [
  `\\section "A" ${bar(C)} ${bar(G)} ${bar(C)} ${bar(G)} ${bar(C)} ${bar(G)} ${bar(C)} ${bar(G, C)}`,
  `\\section "B" ${bar(G)} ${bar(C)} ${bar(G)} ${bar(C, G)}`,
  `\\section "A'" ${bar(C)} ${bar(G)} ${bar(C)} ${G} ${C}`,
].join(' ');

// Bass (G D A E, string 1 = G): C2 = 3.3, G1 = 3.4.
const c = '3.3.2';
const g = '3.4.2';
const BASS = [
  `\\section "A" ${bar(c)} ${bar(g)} ${bar(c)} ${bar(g)} ${bar(c)} ${bar(g)} ${bar(c)} ${bar(g, c)}`,
  `\\section "B" ${bar(g)} ${bar(c)} ${bar(g)} ${bar(c, g)}`,
  `\\section "A'" ${bar(c)} ${bar(g)} ${bar(c)} ${g} ${c}`,
].join(' ');

const tex = `\\title "Ode to Joy" \\artist "Ludwig van Beethoven" \\tempo 100 .
\\track "Melody" \\staff {tabs}
${MELODY}
\\track "Chords" \\staff {tabs}
\\chord ("C" 0 1 0 2 3 -1) \\chord ("G" 3 0 0 0 2 3)
${CHORDS}
\\track "Bass" \\staff {tabs} \\tuning (G2 D2 A1 E1)
${BASS}`;

const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex);
const bytes = new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings());
mkdirSync('samples', { recursive: true });
writeFileSync('samples/ode-to-joy.gp', bytes);
console.log(`samples/ode-to-joy.gp: ${bytes.length} bytes, ${score.masterBars.length} bars, tracks: ${score.tracks.map((t) => t.name).join(', ')}`);
