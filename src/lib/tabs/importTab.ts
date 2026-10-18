import type { Tab, TabBar, TabTrack } from './tab';

/** File types alphaTab reads. */
export const TAB_FILE_TYPES = '.gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gtp,.xml,.musicxml,.mxl';

/**
 * Reads a Guitar Pro (3–7) or MusicXML file with alphaTab. Keeps, per
 * stringed track, the first voice: each beat's notes as string/fret (capo
 * included), chord names and section markers. Tied notes (held, not played
 * again) and dead notes are dropped. alphaTab is loaded only when needed.
 */
export async function importTab(bytes: Uint8Array, fileName: string): Promise<Tab> {
  const alphaTab = await import('@coderline/alphatab');
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes);
  const tracks: TabTrack[] = [];
  for (const track of score.tracks) {
    const staff = track.staves[0];
    if (!staff || !staff.isStringed || staff.isPercussion || !staff.tuning.length) continue;
    const capo = staff.capo;
    const bars: TabBar[] = staff.bars.map((bar) => ({
      ...(bar.masterBar.section?.text ? { section: bar.masterBar.section.text } : {}),
      events: (bar.voices[0]?.beats ?? [])
        .filter((b) => !b.isRest || b.chord)
        .map((b) => ({
          notes: b.notes
            .filter((n) => n.isStringed && !n.isTieDestination && !n.isDead)
            .map((n) => ({ string: n.string - 1, fret: n.fret + capo }))
            .sort((a, z) => a.string - z.string),
          ...(b.chord?.name ? { chord: b.chord.name } : {}),
        }))
        .filter((e) => e.notes.length || e.chord),
    }));
    if (bars.some((b) => b.events.length)) {
      // alphaTab lists tunings highest string first.
      tracks.push({ name: track.name || `Track ${track.index + 1}`, tuning: [...staff.tuning].reverse(), capo, bars });
    }
  }
  if (!tracks.length) throw new Error('No guitar or bass track with notes found in this file.');
  const base = fileName.replace(/\.[^.]+$/, '');
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: score.title || base,
    artist: score.artist || '',
    fileName,
    importedAt: Date.now(),
    tracks,
  };
}
