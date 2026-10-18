// Builds data/setlists.json: on-disc songs (title, artist, year) of the games
// we cover, parsed from the Wikipedia setlist tables. Facts only, no lyrics.
//
//   node scripts/setlists.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const UA = 'chordflash/0.1 (personal practice app; cerebraljam@gmail.com)';
const CACHE = 'data/cache';

/** Wikipedia page, game label, and which tables (by preceding section heading) hold on-disc songs. */
const SOURCES = [
  { page: 'List_of_songs_in_Rock_Band', game: 'Rock Band', sections: ['Main setlist', 'Bonus songs'] },
  { page: 'List_of_songs_in_Rock_Band_2', game: 'Rock Band 2', sections: ['Track listing'] },
  { page: 'List_of_songs_in_Rock_Band_3', game: 'Rock Band 3', sections: ['Track listing'] },
  // Only the first table: the second lists unlockable tracks by the developers.
  { page: 'Rocksmith', game: 'Rocksmith', sections: ['Soundtrack'], firstOnly: true },
  { page: 'Rocksmith_2014', game: 'Rocksmith 2014', sections: ['Track list'] },
];

async function wikitext(page) {
  const file = `${CACHE}/wiki_${page}.txt`;
  if (!existsSync(file)) {
    const res = await fetch(`https://en.wikipedia.org/w/index.php?title=${page}&action=raw`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return readFileSync(file, 'utf8');
}

/** Wikitext cell → plain text. */
export function clean(s) {
  return s
    .replace(/<span style="display:\s*none"[^>]*>[\s\S]*?<\/span>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{sort\|[^|}]*\|([^}]*)\}\}/gi, '$1')
    .replace(/\{\{sortname\|([^|}]*)\|([^|}]*)[^}]*\}\}/gi, '$1 $2')
    .replace(/\{\{nowrap\|([^}]*)\}\}/gi, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a wikitable into rows of raw cell strings (header row included). */
function tableRows(table) {
  const rows = [];
  for (const chunk of table.split(/\n\|-[^\n]*/)) {
    const cells = [];
    // A cell can wrap onto the next line (a long link): glue continuation lines back on.
    const lines = chunk.split('\n').reduce((acc, l) => {
      if (/^[|!{]/.test(l) || !acc.length) acc.push(l);
      else acc[acc.length - 1] += ' ' + l;
      return acc;
    }, []);
    for (const line of lines) {
      if (!/^[|!]/.test(line) || /^\{\||^\|\}|^\|\+/.test(line)) continue;
      for (const cell of line.slice(1).split(/\|\||!!/)) {
        // Drop cell attributes: `style="…" | text` (but keep `[[a|b]]` links intact).
        const m = cell.match(/^\s*(?:[a-z-]+=(?:"[^"]*"|[^\s|]+)\s*)+\|(.*)$/i);
        cells.push(m ? m[1] : cell);
      }
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function songsFrom(text, source) {
  const out = [];
  let section = '';
  let taken = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^==+\s*(.*?)\s*==+\s*$/);
    if (h) section = h[1];
    if (!lines[i].startsWith('{|') || !lines[i].includes('wikitable')) continue;
    let end = i + 1;
    while (end < lines.length && !lines[end].startsWith('|}')) end++;
    const table = lines.slice(i, end + 1).join('\n');
    i = end;
    if (!source.sections.includes(section) || (source.firstOnly && taken++ > 0)) continue;

    const [header, ...rows] = tableRows(table);
    const names = header.map((h) => clean(h).toLowerCase());
    const col = (re) => names.findIndex((n) => re.test(n));
    const ti = col(/song|title/);
    const ai = col(/artist/);
    const yi = col(/year|decade/);
    const tu = col(/tuning/);
    for (const r of rows) {
      const rawTitle = clean(r[ti] ?? '');
      if (!rawTitle || /unlockable/i.test(rawTitle)) continue;
      const title = rawTitle
        .replace(/\((cover|live|re-recording|re-recorded)[^)]*\)/gi, '')
        .replace(/^"|"$/g, '')
        .replace(/"/g, '')
        .trim();
      const year = Number((clean(r[yi] ?? '').match(/\d{4}/) ?? [])[0]) || null;
      const tuning = tu >= 0 ? clean(r[tu] ?? '').replace(/:.*$/, '') || null : null;
      out.push({ title, artist: clean(r[ai] ?? ''), year, game: source.game, ...(tuning ? { tuning } : {}) });
    }
  }
  return out;
}

mkdirSync(CACHE, { recursive: true });
const all = [];
for (const s of SOURCES) {
  const songs = songsFrom(await wikitext(s.page), s);
  console.log(`${s.game}: ${songs.length} songs`);
  all.push(...songs);
}
writeFileSync('data/setlists.json', JSON.stringify(all, null, 1));
console.log(`total ${all.length}, ${new Set(all.map((s) => s.artist)).size} artists → data/setlists.json`);
