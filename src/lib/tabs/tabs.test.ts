import { describe, expect, it } from 'vitest';
import * as alphaTab from '@coderline/alphatab';
import { importTab } from './importTab';
import { chordSections, isBassTrack, sectionStarts, selectNotes, standardShift, tuningName } from './tab';

/** A real Guitar Pro 7 file, written by alphaTab from its text format. */
function gpFile(tex: string): Uint8Array {
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex);
  return new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings());
}

// alphaTex strings count from the highest (1) to the lowest (6 on guitar, 4 on bass).
const RIFF = `\\title "Test Riff" \\artist "Me" .
\\track "Lead" \\staff {tabs} \\tuning (E4 B3 G3 D3 A2 D2)
\\section "Intro" 0.6.8 3.6.8 5.6.8 5.6.8 3.5.4 (0.1 2.2).4 | r.1 |
\\section "Verse" 7.6.4 -.6.4 x.6.4 5.5.4 |
\\track "Bass" \\staff {tabs} \\tuning (G2 D2 A1 E1)
\\section "Intro" 0.4.4 3.4.4 0.3.2 | r.1 |
\\section "Verse" 5.4.2 5.3.2 |
\\track "Rhythm" \\staff {tabs}
\\chord ("G" 3 0 0 0 2 3) \\chord ("C" 0 1 0 2 3 -1) \\chord ("D" 2 3 2 0 -1 -1)
\\section "Intro" (3.6 2.5 0.4 0.3 0.2 3.1).2 {ch "G"} (3.6 2.5 0.4 0.3 0.2 3.1).2 | r.1 |
\\section "Verse" (3.5 2.4 0.3 1.2 0.1).2 {ch "C"} (0.4 2.3 3.2 2.1).2 {ch "D"} |`;

describe('importTab', () => {
  it('reads tracks, tuning, sections, notes and chord names from a Guitar Pro file', async () => {
    const tab = await importTab(gpFile(RIFF), 'riff.gp');
    expect(tab.title).toBe('Test Riff');
    expect(tab.artist).toBe('Me');
    expect(tab.tracks.map((t) => t.name)).toEqual(['Lead', 'Bass', 'Rhythm']);
    const [lead, bass] = tab.tracks;
    expect(lead.tuning).toEqual([38, 45, 50, 55, 59, 64]);
    expect(bass.tuning).toEqual([28, 33, 38, 43]);
    expect(lead.bars[0].section).toBe('Intro');
    expect(lead.bars[0].events[0].notes).toEqual([{ string: 0, fret: 0 }]);
    // Bar 2: the tied note and the dead note are gone.
    expect(lead.bars[2].events.map((e) => e.notes)).toEqual([[{ string: 0, fret: 7 }], [{ string: 1, fret: 5 }]]);
    expect(tab.tracks[2].bars[0].events[0].chord).toBe('G');
  });

  it('adds the capo to the frets', async () => {
    const tab = await importTab(gpFile(`\\title "Capo" . \\track "G" \\staff {tabs} \\capo 2 0.5.4 2.5.4 |`), 'c.gp');
    expect(tab.tracks[0].capo).toBe(2);
    expect(tab.tracks[0].bars[0].events.map((e) => e.notes[0].fret)).toEqual([2, 4]);
  });

  it('rejects files without a stringed track', async () => {
    await expect(importTab(new Uint8Array([1, 2, 3, 4]), 'junk.gp')).rejects.toThrow();
  });
});

describe('tab selection', () => {
  it('names tunings', () => {
    expect(tuningName([40, 45, 50, 55, 59, 64])).toBe('Standard');
    expect(tuningName([39, 44, 49, 54, 58, 63])).toBe('E♭ standard');
    expect(tuningName([38, 45, 50, 55, 59, 64])).toBe('Drop D');
    expect(tuningName([36, 41, 46, 51, 55, 60])).toBe('C standard');
    expect(tuningName([36, 43, 48, 53, 57, 62])).toBe('C G C F A D');
    expect(standardShift([27, 32, 37, 42])).toEqual({ base: 'bass', shift: -1 });
  });

  it('takes the single notes of a bar range, merging immediate repeats and skipping chords', async () => {
    const tab = await importTab(gpFile(RIFF), 'riff.gp');
    const lead = tab.tracks[0];
    const intro = selectNotes(lead, 0, 1, false);
    expect(intro.instrument).toBe('t-38-45-50-55-59-64'); // Drop D can't be played on a standard guitar
    // Every note, the repeated 5th fret included.
    expect(intro.sequence.map((id) => id.split(':').slice(1).join(':'))).toEqual(['0:0', '0:3', '0:5', '0:5', '1:3']);
    expect(intro.skippedChords).toBe(1);
    // The staff: every beat with notes, single notes numbered in playing order, the chord shown but not asked.
    expect(intro.staff[0].section).toBe('Intro');
    expect(intro.staff[0].events.map((e) => e.step)).toEqual([0, 1, 2, 3, 4, null]);
    expect(intro.staff[1].events).toEqual([]);
    expect(intro.items).toHaveLength(4);
    expect(sectionStarts(lead)).toEqual([{ bar: 0, name: 'Intro' }, { bar: 2, name: 'Verse' }]);
    expect(isBassTrack(lead)).toBe(false);
    expect(isBassTrack(tab.tracks[1])).toBe(true);
    expect(selectNotes(tab.tracks[1], 0, 2, false).instrument).toBe('bass');
  });

  it('plays a shifted standard tuning with the same frets on a standard instrument when asked', () => {
    const eb = { name: 'Eb', tuning: [39, 44, 49, 54, 58, 63], capo: 0, bars: [{ events: [{ notes: [{ string: 0, fret: 3 }] }] }] };
    expect(selectNotes(eb, 0, 0, true).sequence).toEqual(['guitar:0:3']);
    expect(selectNotes(eb, 0, 0, false).sequence).toEqual(['t-39-44-49-54-58-63:0:3']);
  });

  it('turns chord names into song sections', async () => {
    const tab = await importTab(gpFile(RIFF), 'riff.gp');
    expect(chordSections(tab.tracks[2])).toEqual([
      { name: 'Intro', chords: ['G'] },
      { name: 'Verse', chords: ['C', 'D'] },
    ]);
    expect(chordSections(tab.tracks[0])).toEqual([]);
  });
});
