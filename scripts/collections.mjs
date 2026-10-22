// Builds the song collections that aren't game setlists: every Chordonomicon song
// of a hand-picked list of artists, one JSON file per collection in src/lib/songs/.
//
//   node scripts/collections.mjs
//
// Artists are found by name among the Spotify artists of the rows carrying the
// collection's genre tags (names read from each artist's Spotify page, cached in
// data/cache/spotify_artists.json), plus the MusicBrainz lookups cached by
// match.mjs. Titles come from Spotify oEmbed; rows without a Spotify track id
// have no title and are left out.
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const UA = 'chordflash/0.1 (personal practice app; cerebraljam@gmail.com)';
const CSV = 'data/raw/chordonomicon_v2.csv';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Artists: display name, then other spellings (Spotify or MusicBrainz may write it another way). */
const COLLECTIONS = [
  {
    name: 'J-Rock',
    file: 'src/lib/songs/jrock.json',
    tags: /'(j-[^']*|japanese[^']*|anime[^']*|visual kei|kayokyoku|shibuya-kei|okinawan[^']*)'/i,
    artists: [
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
    ],
  },
  {
    name: 'Québec',
    file: 'src/lib/songs/quebec.json',
    tags: /'[^']*(quebec|qu[ée]b[ée]cois|acadien)[^']*'/i,
    // French-speaking Quebec and Acadian artists (the tags also cover English-language Canadian bands).
    artists: [
      'Les Trois Accords', 'Les Cowboys Fringants', 'Jean Leloup', 'Kevin Parent', 'Harmonium', 'Beau Dommage',
      'Robert Charlebois', 'Paul Piché', 'Richard Séguin', 'Michel Rivard', 'Offenbach', 'Vulgaires Machins', 'Karkwa',
      'Louis-Jean Cormier', 'Bernard Adamus', 'Fred Fortin', 'Les Colocs', 'Daniel Bélanger', 'Éric Lapointe', 'Kaïn',
      'Okoumé', 'Mes Aïeux', 'Marjo', 'Plume Latraverse', 'Richard Desjardins', 'Lisa LeBlanc', 'Les Hay Babies',
      'Salebarbes', '2Frères', 'Les Respectables', 'Groovy Aardvark', 'Malajube', "Avec pas d'casque", 'Pierre Lapointe',
      'Jean-Pierre Ferland', 'Gilles Vigneault', 'Félix Leclerc', 'Claude Dubois', 'Diane Dufresne', 'Isabelle Boulay',
      'Roch Voisine', 'Marie-Mai', 'Bleu Jeans Bleu', 'Dumas', 'Ariane Moffatt', 'Cœur de pirate', 'Les Sœurs Boulay',
      'Patrice Michaud', 'Philippe B', 'Tire le coyote', 'Damien Robitaille', 'La Chicane', 'Bob Bissonnette',
      'Les Denis Drolet', "Mononc' Serge", 'Zachary Richard', "P'tit Belliveau", '1755', 'Cayouche', 'Gab Bouchard',
      'Thierry Larose', 'Hert LeBlanc', 'Fred Pellerin', 'Lynda Lemay', 'Sylvain Cossette', 'Jean-François Breau',
      'Ingrid St-Pierre', 'Daniel Boucher', "Les Charbonniers de l'enfer", 'Les Vilains Pingouins', 'Paul Daraîche',
      'Patrick Norman', 'Bois-Joli', 'Québec Redneck Bluegrass Project', 'Orloge Simard', 'Jimmy Hunt', 'Céline Dion',
      'Ginette Reno', 'Garou', 'Corneille', 'Vincent Vallières', 'Klô Pelgag', 'Safia Nolin', 'Alexandre Poulin',
      'Les Louanges', 'Hubert Lenoir', 'Les Breastfeeders', 'Les Deuxluxes', 'Claude Gauthier', 'Les B.B.', 'Daniel Lavoie',
      'Luc De Larochellière', 'Marc Dupré', 'Fouki', 'Loud', 'Les Goules',
    ],
  },
  {
    name: 'French',
    file: 'src/lib/songs/french.json',
    tags: /'[^']*(chanson|french|fran[cç]ais|variete|belgian|swiss|francophone)[^']*'/i,
    // French-language artists from France, Belgium and Switzerland.
    artists: [
      'Téléphone', 'Noir Désir', 'Indochine', 'Louise Attaque', 'Jacques Brel', 'Georges Brassens', 'Renaud',
      'Francis Cabrel', 'Jean-Jacques Goldman', 'Johnny Hallyday', 'Serge Gainsbourg', 'Charles Aznavour', 'Édith Piaf',
      'Joe Dassin', 'Michel Sardou', 'Alain Souchon', 'Laurent Voulzy', 'Jacques Dutronc', 'Françoise Hardy', 'Manu Chao',
      'Mano Negra', 'Tryo', 'Zaz', 'Stromae', 'Angèle', 'Vianney', 'Kendji Girac', 'Christophe Maé', ['M', '-M-'],
      'Bénabar', 'Calogero', 'Raphaël', 'Saez', 'Hubert-Félix Thiéfaine', 'Trust', 'Les Rita Mitsouko', 'Étienne Daho',
      'Les Wampas', 'Jean-Louis Aubert', 'Alain Bashung', 'Julien Doré', 'Benjamin Biolay', 'Louane', 'Indila',
      'Yves Montand', 'Hugues Aufray', 'Maxime Le Forestier', 'Les Négresses Vertes', 'BB Brunes', 'Superbus',
      'Les Innocents', 'Kyo', 'Mickey 3D', 'Dionysos', 'Debout sur le Zinc', 'Les Fatals Picards', 'Sanseverino',
      'Thomas Dutronc', 'Pierre Perret', 'Jean Ferrat', 'Barbara', 'Léo Ferré', 'Michel Polnareff', 'Claude François',
      'Daniel Balavoine', 'Patrick Bruel', 'Florent Pagny', 'Pascal Obispo', 'Mylène Farmer', 'Patricia Kaas',
      'Vanessa Paradis', 'Carla Bruni', 'Keren Ann', 'Cali', 'Renan Luce', 'Oldelaf', 'Gérald De Palmas',
      'Gilbert Bécaud', 'Nino Ferrer', 'Henri Salvador', 'Boris Vian', 'Les Ogres De Barback', 'La Rue Ketanou',
      'Matmatah', 'Miossec', 'Dominique A', 'Bernard Lavilliers', 'Gaëtan Roussel', 'Feu! Chatterton', 'Pomme',
      'Clara Luciani', 'Juliette Armanet', 'Eddy de Pretto', 'Gauvain Sers', 'Boulevard des Airs', 'Claudio Capéo',
      'Slimane', 'Amir', 'Charles Trenet', 'Dalida', 'Sylvie Vartan', 'Saule', 'Axelle Red', 'Arno', 'Maurane',
      'Plastic Bertrand', ['Salvatore Adamo', 'Adamo'], 'Stephan Eicher', 'Jean-Louis Murat', 'Alain Chamfort', 'Yelle',
      'Fréro Delavega',
    ],
  },
].map((c) => ({ ...c, artists: c.artists.map((a) => (Array.isArray(a) ? a : [a])) }));

/** Name for matching: case, accents, punctuation and HTML entities ignored (Japanese kept as is). */
const norm = (s) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^\p{L}\p{N}']/gu, '');

/** Spotify's title without version noise: "Hakujitsu - 10 years version", "Celebration (Movie Edit) [feat. …]". */
export const cleanTitle = (t) =>
  t
    .replace(/\s*[([（〜~](feat\.|from |with |avec |en concert|en direct|en public|movie|take \d|[^)\]）〜~]*\b(version|mix|remix|remaster(ed)?|remasteris|edit|ver|live)\b)[^)\]）〜~]*[)\]）〜~]/gi, '')
    // "- Remastered 2011", "- Edition Remixée", "- Réenregistrement 1987", "- Acoustic Session" (a real subtitle stays).
    .replace(/\s+-\s+(ep\.|.*\b(version|mix|remix|remaster(ed)?|remasteris|edit|ver|live|from|acoustic|session|bonus)\b|[ée]dition|r[ée]enregistrement).*$/i, '')
    .trim();

/** Same title normalisation as match.mjs, but keeps non-Latin characters. */
const normTitle = (s) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+-\s+.*$/, '')
    .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g, '')
    .replace(/[\s\p{P}]+/gu, ' ')
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

async function* csvRows() {
  let header = null;
  for await (const line of createInterface({ input: createReadStream(CSV), crlfDelay: Infinity })) {
    const f = splitCsv(line);
    if (!header) header = f;
    else yield Object.fromEntries(header.map((h, i) => [h, f[i]]));
  }
}

async function getText(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (res?.ok) return res.text();
    if (res?.status === 404) return null;
    await sleep(2000 * (attempt + 1));
  }
  return undefined; // gave up: not cached, retried next run
}

// 1. Artists of the tagged rows, per collection.
console.log('1. scanning tags');
for (const c of COLLECTIONS) c.tagged = new Set();
for await (const r of csvRows()) {
  if (!r.spotify_artist_id) continue;
  for (const c of COLLECTIONS) if (c.tags.test(r.genres ?? '')) c.tagged.add(r.spotify_artist_id);
}

// 2. Their names, from each artist's Spotify page.
const namesFile = 'data/cache/spotify_artists.json';
const names = existsSync(namesFile) ? JSON.parse(readFileSync(namesFile, 'utf8')) : {};
const unnamed = [...new Set(COLLECTIONS.flatMap((c) => [...c.tagged]))].filter((id) => !(id in names));
console.log(`2. ${unnamed.length} artist names to fetch`);
for (let i = 0; i < unnamed.length; i += 4) {
  await Promise.all(
    unnamed.slice(i, i + 4).map(async (id) => {
      const page = await getText(`https://open.spotify.com/artist/${id}`);
      if (page !== undefined) names[id] = (page?.match(/og:title" content="([^"]*)/) ?? [])[1] ?? null;
    }),
  );
  if (i % 200 === 0) writeFileSync(namesFile, JSON.stringify(names));
  await sleep(300);
}
writeFileSync(namesFile, JSON.stringify(names));

// 3. The listed artists' Spotify ids.
const mb = JSON.parse(readFileSync('data/cache/mb_artists.json', 'utf8'));
/** Spotify artist id → [collection, display name]. */
const owners = new Map();
for (const c of COLLECTIONS) {
  const found = new Set();
  for (const [display, ...aliases] of c.artists) {
    const spellings = new Set([display, ...aliases].map(norm));
    const ids = new Set([
      ...[...c.tagged].filter((id) => names[id] && spellings.has(norm(names[id]))),
      ...[display, ...aliases].flatMap((n) => mb[n] ?? []),
    ]);
    for (const id of ids) owners.set(id, [...(owners.get(id) ?? []), [c, display]]);
    if (ids.size) found.add(display);
  }
  console.log(`3. ${c.name}: ${found.size} of ${c.artists.length} artists found; not found: ${c.artists.map((a) => a[0]).filter((a) => !found.has(a)).join(', ')}`);
}

// 4. Their songs (those with a Spotify track: the title comes from it).
for (const c of COLLECTIONS) (c.rows = []), (c.untitled = 0);
for await (const r of csvRows()) {
  for (const [c, artist] of owners.get(r.spotify_artist_id) ?? []) {
    if (r.spotify_song_id) c.rows.push({ ...r, artist });
    else c.untitled++;
  }
}

// 5. Titles via Spotify oEmbed.
const titlesFile = 'data/cache/spotify_titles.json';
const titles = existsSync(titlesFile) ? JSON.parse(readFileSync(titlesFile, 'utf8')) : {};
const todo = [...new Set(COLLECTIONS.flatMap((c) => c.rows.map((r) => r.spotify_song_id)))].filter((id) => !(id in titles));
console.log(`5. ${todo.length} titles to fetch`);
for (let i = 0; i < todo.length; i += 8) {
  await Promise.all(
    todo.slice(i, i + 8).map(async (id) => {
      const body = await getText(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`);
      if (body !== undefined) titles[id] = body ? JSON.parse(body).title ?? null : null;
    }),
  );
  if (i % 400 === 0) writeFileSync(titlesFile, JSON.stringify(titles));
  await sleep(100);
}
writeFileSync(titlesFile, JSON.stringify(titles));

// 6. One version per song: the one with the most section labels, then the longest.
const sections = (r) => (r.chords.match(/<[a-z]+_\d+>/g) ?? []).length;
for (const c of COLLECTIONS) {
  const songs = new Map();
  for (const r of c.rows.sort((a, b) => sections(b) - sections(a) || b.chords.length - a.chords.length)) {
    const title = titles[r.spotify_song_id] && cleanTitle(titles[r.spotify_song_id]);
    if (!title) continue;
    const key = `${r.artist}|${normTitle(title)}`;
    if (songs.has(key)) continue;
    songs.set(key, {
      title,
      artist: r.artist,
      year: Number((r.release_date ?? '').slice(0, 4)) || null,
      games: [c.name],
      chordonomiconId: Number(r.id),
      chords: r.chords,
    });
  }
  const list = [...songs.values()].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
  writeFileSync(c.file, JSON.stringify(list, null, 1));
  const per = {};
  for (const s of list) per[s.artist] = (per[s.artist] ?? 0) + 1;
  console.log(`6. ${c.name}: ${list.length} songs (${c.untitled} rows without a title left out) → ${c.file}`);
  console.log('   ' + Object.entries(per).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(' · '));
}
