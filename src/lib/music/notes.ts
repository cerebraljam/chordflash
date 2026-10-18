export type Lang = 'en' | 'fr';

const NAMES: Record<Lang, string[]> = {
  en: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  fr: ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
};

export const A4 = 440;

export function midiToFreq(midi: number): number {
  return A4 * 2 ** ((midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / A4);
}

/** Pitch class 0..11 (C = 0) of a (possibly fractional) MIDI note. */
export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function pitchClassName(pc: number, lang: Lang): string {
  return NAMES[lang][((pc % 12) + 12) % 12];
}

/** e.g. 40 -> "E2" / "Mi2" */
export function noteName(midi: number, lang: Lang): string {
  const m = Math.round(midi);
  return pitchClassName(m, lang) + (Math.floor(m / 12) - 1);
}
