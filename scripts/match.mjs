// Matches the setlists (data/setlists.json) to Chordonomicon chord progressions
// and writes src/lib/songs/songs.json for the app.
//
//   node scripts/match.mjs            all steps
//   node scripts/match.mjs --count    stop after counting candidate songs
//
// Chordonomicon has no titles, only Spotify ids, so:
//   1. artist name → MusicBrainz → Spotify artist id (MusicBrainz url relations)
//   2. keep the Chordonomicon rows of those artists
//   3. Spotify track id → title via Spotify's public oEmbed endpoint
//   4. match titles to the setlist
// Every lookup is cached in data/cache/, so re-runs only fetch what's missing.
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const UA = 'chordflash/0.1 (personal practice app; cerebraljam@gmail.com)';
const CSV = 'data/raw/chordonomicon_v2.csv';
const OUT = 'src/lib/songs/songs.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cache(name) {
  const file = `data/cache/${name}.json`;
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return { data, save: () => writeFileSync(file, JSON.stringify(data)) };
}

/** Lower-case, no accents, punctuation, parentheses, leading "the", or remaster/version suffixes. */
export function normTitle(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+-\s+.*$/, '') // "Song - Remastered 2011", "Song - Live"
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '') // "(Keep 'Em Separated)", "(feat. …)", "[Live]"
    .replace(/\s'\d\d$/, '') // "Ace of Spades '08"
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/^the /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    await sleep(2000 * (attempt + 1)); // 503 rate limit or transient error
  }
  throw new Error(`failed: ${url}`);
}

/** Spotify artist ids linked from a MusicBrainz artist. */
async function spotifyLinks(mbid) {
  const full = await getJson(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`);
  await sleep(1100);
  return (full?.relations ?? [])
    .map((r) => r.url?.resource ?? '')
    .filter((u) => u.includes('open.spotify.com/artist/'))
    .map((u) => u.split('/artist/')[1].split(/[?/]/)[0]);
}

/**
 * Tries the name as written, without a leading "The", and with a plain
 * apostrophe, and the top few matches of each (several artists can share a
 * name, e.g. Beck): the first with a Spotify link wins.
 */
async function lookupArtist(name) {
  const variants = [...new Set([name, name.replace(/^The /, ''), name.replace(/['’]/g, '')])];
  const tried = new Set();
  for (const v of variants) {
    const found = await getJson(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${v}"`)}&fmt=json&limit=5`);
    await sleep(1100);
    for (const a of (found?.artists ?? []).filter((a) => a.score >= 80 && !tried.has(a.id)).slice(0, 3)) {
      tried.add(a.id);
      const ids = await spotifyLinks(a.id);
      if (ids.length) return ids;
    }
  }
  return [];
}

// 1. Spotify artist ids via MusicBrainz (max 1 request/second).
async function spotifyArtists(names) {
  const c = cache('mb_artists');
  let fetched = 0;
  for (const name of names) {
    // Artists found earlier are kept; misses are retried with the broader lookup.
    if (c.data[name]?.length || c.data[`${name}#retried`]) continue;
    c.data[name] = await lookupArtist(name);
    if (!c.data[name].length) c.data[`${name}#retried`] = true;
    if (++fetched % 10 === 0) {
      c.save();
      console.log(`  musicbrainz: ${fetched} artists looked up`);
    }
  }
  c.save();
  return c.data;
}

/** Minimal CSV line split (fields may be double-quoted). */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cur), (cur = '');
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// 2. Chordonomicon rows by those artists.
async function candidateRows(artistIds) {
  const rows = [];
  const lines = createInterface({ input: createReadStream(CSV), crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    const f = splitCsv(line);
    if (!header) {
      header = f;
      continue;
    }
    const row = Object.fromEntries(header.map((h, i) => [h, f[i]]));
    if (row.spotify_song_id && artistIds.has(row.spotify_artist_id)) rows.push(row);
  }
  return rows;
}

// 3. Track titles via Spotify oEmbed (no key needed).
/**
 * Fetches titles artist by artist, in small batches, and stops for an artist
 * as soon as all of its setlist songs are found (an artist can have hundreds
 * of tracks in Chordonomicon for the one song we need).
 */
async function trackTitles(rowsByArtist, wantedByArtist) {
  const c = cache('spotify_titles');
  let fetched = 0;
  const fetchOne = async (id) => {
    const r = await getJson(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`).catch(() => null);
    c.data[id] = r?.title ?? null;
    if (++fetched % 200 === 0) {
      c.save();
      console.log(`  spotify: ${fetched} titles fetched`);
    }
    await sleep(100);
  };
  for (const [artistId, rows] of rowsByArtist) {
    const wanted = new Set(wantedByArtist.get(artistId) ?? []);
    const ids = [...new Set(rows.map((r) => r.spotify_song_id))];
    const tickOff = () => ids.forEach((id) => c.data[id] && wanted.delete(normTitle(c.data[id])));
    tickOff(); // titles cached by an earlier run
    for (let i = 0; i < ids.length && wanted.size; i += 8) {
      await Promise.all(ids.slice(i, i + 8).filter((id) => !(id in c.data)).map(fetchOne));
      tickOff();
    }
  }
  c.save();
  console.log(`  spotify: ${fetched} titles fetched this run`);
  return c.data;
}

mkdirSync('data/cache', { recursive: true });
const setlists = JSON.parse(readFileSync('data/setlists.json', 'utf8'));
const artistNames = [...new Set(setlists.map((s) => s.artist))];

console.log(`1. ${artistNames.length} artists → Spotify ids via MusicBrainz`);
const artistMap = await spotifyArtists(artistNames);
const withIds = artistNames.filter((n) => artistMap[n]?.length);
console.log(`   ${withIds.length} artists have a Spotify id`);

console.log('2. scanning Chordonomicon');
const artistIds = new Set(withIds.flatMap((n) => artistMap[n]));
const rows = await candidateRows(artistIds);
const trackIds = [...new Set(rows.map((r) => r.spotify_song_id))];
console.log(`   ${rows.length} rows, ${trackIds.length} distinct tracks`);
if (process.argv.includes('--count')) process.exit(0);

console.log('3. track titles');
const byArtistId = new Map();
for (const r of rows) {
  const list = byArtistId.get(r.spotify_artist_id) ?? [];
  list.push(r);
  byArtistId.set(r.spotify_artist_id, list);
}
const wantedByArtist = new Map();
for (const s of setlists) {
  for (const id of artistMap[s.artist] ?? []) wantedByArtist.set(id, [...(wantedByArtist.get(id) ?? []), normTitle(s.title)]);
}
const titles = await trackTitles(byArtistId, wantedByArtist);

console.log('4. matching');
const songs = new Map();
let unmatched = [];
for (const s of setlists) {
  const want = normTitle(s.title);
  const candidates = (artistMap[s.artist] ?? [])
    .flatMap((id) => byArtistId.get(id) ?? [])
    .filter((r) => titles[r.spotify_song_id] && normTitle(titles[r.spotify_song_id]) === want);
  if (!candidates.length) {
    unmatched.push(`${s.artist} — ${s.title}`);
    continue;
  }
  // Several user versions may exist: keep the one with the most section labels, then the longest.
  const sections = (r) => (r.chords.match(/<[a-z]+_\d+>/g) ?? []).length;
  candidates.sort((a, b) => sections(b) - sections(a) || b.chords.length - a.chords.length);
  const key = `${s.artist}|${want}`;
  const prev = songs.get(key);
  if (prev) {
    prev.games.push(s.game);
    continue;
  }
  songs.set(key, {
    title: s.title,
    artist: s.artist,
    year: s.year,
    games: [s.game],
    ...(s.tuning ? { tuning: s.tuning } : {}),
    chordonomiconId: Number(candidates[0].id),
    chords: candidates[0].chords,
  });
}
mkdirSync('src/lib/songs', { recursive: true });
writeFileSync(OUT, JSON.stringify([...songs.values()], null, 1));
writeFileSync('data/unmatched.txt', unmatched.join('\n') + '\n');
console.log(`   matched ${songs.size} songs (${unmatched.length} setlist entries unmatched → data/unmatched.txt) → ${OUT}`);
