// Builds src/lib/songs/jrock.json: a "J-Rock" collection with every Chordonomicon
// song of a hand-picked list of Japanese rock artists. Not tied to a game setlist.
//
//   node scripts/jrock.mjs
//
// Artists are found by name among the Spotify artists of the dataset's
// Japanese-tagged rows (names read from each artist's Spotify page, cached in
// data/cache/spotify_artists.json). Titles come from Spotify oEmbed, as in
// match.mjs; rows without a Spotify track id have no title and are left out.
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const UA = 'chordflash/0.1 (personal practice app; cerebraljam@gmail.com)';
const CSV = 'data/raw/chordonomicon_v2.csv';
const OUT = 'src/lib/songs/jrock.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Display name, then other spellings (Spotify or MusicBrainz may list the name in Japanese). */
const ARTISTS = [
  'ONE OK ROCK', 'RADWIMPS', 'back number', 'ASIAN KUNG-FU GENERATION', 'ELLEGARDEN', 'BUMP OF CHICKEN',
  'Mr.Children', ['Official HIGE DANdism', 'Official髭男dism'], 'Shonen Knife', ['Ho-kago Tea Time', 'Ho - Kago Tea Time'],
  'MONGOL800', ['Sambomaster', 'サンボマスター'], 'KANA-BOON', 'ORANGE RANGE', 'X JAPAN', 'GLAY', 'NUMBER GIRL',
  'Galileo Galilei', 'flumpool', 'THE YELLOW MONKEY', 'King Gnu', 'Mrs. GREEN APPLE', 'the brilliant green',
  'BEAT CRUSADERS', 'MAN WITH A MISSION', 'THE ORAL CIGARETTES', 'UVERworld', 'Husking Bee', 'SPYAIR', 'MONOEYES',
  'JUDY AND MARY', 'SCANDAL', 'Do As Infinity', 'the GazettE', 'DIR EN GREY', 'BUCK-TICK', 'BABYMETAL', 'coldrain',
  'MY FIRST STORY', 'sumika', 'Saucy Dog', "OKAMOTO'S", 'YUI', 'Supercar', 'Fishmans', 'Survive Said The Prophet',
  ['Ulfuls', 'ウルフルズ'], 'Hi-STANDARD', 'GOING STEADY', ['Ging Nang BOYZ', '銀杏BOYZ'], ['THE BLUE HEARTS', 'ザ・ブルーハーツ'],
  'THE HIGH-LOWS', 'The Birthday', 'thee michelle gun elephant', 'Hump Back', '04 Limited Sazabys', 'SHISHAMO',
  ['Kenshi Yonezu', '米津玄師'], ['Yorushika', 'ヨルシカ'], 'Aqua Timez', ['Ikimonogakari', 'いきものがかり'],
  ['Remioromen', 'レミオロメン'], "L'Arc~en~Ciel", 'SID', ['Spitz', 'スピッツ'], ['Sukima Switch', 'スキマスイッチ'],
  ['Gen Hoshino', '星野源'], ['Aimyon', 'あいみょん'], ['Kobukuro', 'コブクロ'], ['Yuzu', 'ゆず'],
].map((a) => (Array.isArray(a) ? a : [a]));

const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/&#x27;/g, "'").replace(/[^\p{L}\p{N}']/gu, '');

/** Spotify's title without version noise: "Hakujitsu - 10 years version", "Celebration (Movie Edit) [feat. …]". */
export const cleanTitle = (t) =>
  t
    .replace(/\s*[([（〜~](feat\.|from |with |movie|[^)\]）〜~]*\b(version|mix|remaster(ed)?|edit|ver|live)\b)[^)\]）〜~]*[)\]）〜~]/gi, '')
    .replace(/\s+-\s+(ep\.|.*\b(version|mix|remaster(ed)?|edit|ver|live|from)\b).*$/i, '')
    .trim();

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

/** Same title normalisation as match.mjs, but keeps Japanese characters. */
const normTitle = (s) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+-\s+.*$/, '')
    .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g, '')
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim();

const names = JSON.parse(readFileSync('data/cache/spotify_artists.json', 'utf8'));
const mb = JSON.parse(readFileSync('data/cache/mb_artists.json', 'utf8'));
/** Spotify artist id → display name. */
const artistIds = new Map();
const found = new Set();
for (const [display, ...aliases] of ARTISTS) {
  const spellings = new Set([display, ...aliases].map(norm));
  const ids = [
    ...Object.entries(names).filter(([, n]) => n && spellings.has(norm(n))).map(([id]) => id),
    ...[display, ...aliases].flatMap((n) => mb[n] ?? []),
  ];
  for (const id of ids) artistIds.set(id, display);
  if (ids.length) found.add(display);
}
console.log(`${found.size} artists have a Spotify id; not found: ${ARTISTS.map((a) => a[0]).filter((a) => !found.has(a)).join(', ')}`);

const rows = [];
let header = null;
let untitled = 0;
for await (const line of createInterface({ input: createReadStream(CSV), crlfDelay: Infinity })) {
  const f = splitCsv(line);
  if (!header) {
    header = f;
    continue;
  }
  const row = Object.fromEntries(header.map((h, i) => [h, f[i]]));
  if (!artistIds.has(row.spotify_artist_id)) continue;
  if (row.spotify_song_id) rows.push(row);
  else untitled++;
}
console.log(`${rows.length} rows with a Spotify track (${untitled} without, left out)`);

const titlesFile = 'data/cache/spotify_titles.json';
const titles = existsSync(titlesFile) ? JSON.parse(readFileSync(titlesFile, 'utf8')) : {};
const todo = [...new Set(rows.map((r) => r.spotify_song_id))].filter((id) => !(id in titles));
for (let i = 0; i < todo.length; i += 8) {
  await Promise.all(
    todo.slice(i, i + 8).map(async (id) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`, { headers: { 'User-Agent': UA } }).catch(() => null);
        if (res?.ok) return (titles[id] = (await res.json()).title ?? null);
        if (res?.status === 404) return (titles[id] = null);
        await sleep(2000 * (attempt + 1));
      }
    }),
  );
  if (i % 200 === 0) writeFileSync(titlesFile, JSON.stringify(titles));
  await sleep(100);
}
writeFileSync(titlesFile, JSON.stringify(titles));

// One version per song: the one with the most section labels, then the longest.
const sections = (r) => (r.chords.match(/<[a-z]+_\d+>/g) ?? []).length;
const songs = new Map();
for (const r of rows.sort((a, b) => sections(b) - sections(a) || b.chords.length - a.chords.length)) {
  const title = titles[r.spotify_song_id] && cleanTitle(titles[r.spotify_song_id]);
  if (!title) continue;
  const artist = artistIds.get(r.spotify_artist_id);
  const key = `${artist}|${normTitle(title)}`;
  if (songs.has(key)) continue;
  songs.set(key, {
    title,
    artist,
    year: Number((r.release_date ?? '').slice(0, 4)) || null,
    games: ['J-Rock'],
    chordonomiconId: Number(r.id),
    chords: r.chords,
  });
}
const list = [...songs.values()].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
writeFileSync(OUT, JSON.stringify(list, null, 1));
const per = {};
for (const s of list) per[s.artist] = (per[s.artist] ?? 0) + 1;
console.log(`${list.length} songs → ${OUT}`);
console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(' · '));
