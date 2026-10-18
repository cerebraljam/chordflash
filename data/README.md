# Song data

The app ships `src/lib/songs/songs.json`: the chord progressions of the on-disc
songs of Rock Band 1–3, Rocksmith and Rocksmith 2014. No lyrics, no audio.

## How it's built

```
node scripts/setlists.mjs   # Wikipedia setlist tables → data/setlists.json
node scripts/match.mjs      # setlists × Chordonomicon → src/lib/songs/songs.json
```

`match.mjs` needs `data/raw/chordonomicon_v2.csv` (264 MB, not committed):

```
curl -L -o data/raw/chordonomicon_v2.csv \
  https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/main/chordonomicon_v2.csv
```

Chordonomicon has no song titles, only Spotify ids, so the script:

1. looks up each artist on MusicBrainz and follows its link to Spotify (1 request/s),
2. keeps the Chordonomicon rows of those artists,
3. gets each track's title from Spotify's public oEmbed endpoint (no key needed),
4. matches titles to the setlist (case, punctuation and "- Remastered" suffixes ignored).

Every web lookup is cached in `data/cache/`, so re-runs are fast.
`data/unmatched.txt` lists the setlist songs that couldn't be matched.

## Sources and licenses

- Chord progressions: [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon)
  (Kantarelis et al., 2024), **CC BY-NC 4.0**: non-commercial use, with attribution
  (shown in the app next to each song). The chords are user-written, so they may contain mistakes.
- Setlists (titles, artists, years, Rocksmith 2014 tunings): Wikipedia, CC BY-SA 4.0.
- Artist → Spotify links: MusicBrainz (CC0). Track titles: Spotify oEmbed.
