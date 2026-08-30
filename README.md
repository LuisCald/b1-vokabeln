# B1 Vokabeln

A spaced-repetition flashcard trainer for the German **DTZ / B1** vocabulary, built to run
on a phone. Works offline, stores progress locally, no account and no backend.

**2,640 cards** — every word from the official DTZ *Alphabetische Wortliste*, each with an
English gloss, gender and plural, principal parts for verbs, an authentic example sentence,
and a corpus frequency rank used to order the deck so the most useful words come first.

## Using it

- **Study** — mixes cards that are due with a capped number of new ones.
- **Review only** — no new cards, just what is due.
- **Drill worst** — the words you get wrong most, ignoring the schedule.
- Tap the card to reveal, then rate **Again / Hard / Good / Easy**. On a keyboard:
  `space` reveals and marks Good, `1`–`4` grade directly.

Scheduling is SM-2 (the Anki algorithm). A word you miss comes back within the same
session; one you know drifts out to days, then weeks.

### Install on a phone

Open the site in Safari or Chrome and choose **Add to Home Screen**. It then launches
full-screen and works with no connection.

## Your data

Progress lives in `localStorage` in one browser. It is **not** synced between devices.
Settings → **Export progress** writes a `.json` backup (drop it in Dropbox); **Import**
loads it on another device. Clearing site data erases progress, so export now and then.

## Running locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly as a `file://` URL will not work — `deck.json` is loaded
with `fetch`, which needs HTTP.

## Rebuilding the deck

`deck.json` is generated from two PDFs that are deliberately **not** in this repo
(see `.gitignore`). With them present in the project root:

```sh
cd tools
pdftotext -bbox-layout ../dtz_wortliste.pdf dtz_bb.xml
pdftotext -bbox-layout -f 150 -l 192 ../RANDAL1.pdf randal_idx.xml
python3 parse_dtz.py      # DTZ wordlist  -> dtz_entries.json
python3 parse_freq.py     # frequency index -> freq.json
python3 build_deck.py     # join both      -> deck.json
```

- `parse_dtz.py` reads the two-column A4 layout by word coordinates, rejoining headwords
  that wrap, sub-entries that share a line with their example, and compound stems split
  across lines (`die Bedienungs-` + `anleitung`).
- `parse_freq.py` reads the dictionary's alphabetical index for glosses and ranks.
- `build_deck.py` joins them. German capitalisation is significant, so a lowercase
  headword is never matched to a capitalised noun (the adverb *recht* is not *das Recht*).
- `manual_glosses.json` supplies English for the ~750 everyday DTZ words that fall outside
  the dictionary's top 4,034 (*Ampel*, *Zahnpasta*, *Altenheim* …).

After changing `deck.json`, bump `CACHE` in `sw.js` so phones fetch the new version.

## Sources

- *DTZ Wortliste* — official word list for the Deutsch-Test für Zuwanderer (Goethe-Institut / telc).
- Jones & Tschirner, *A Frequency Dictionary of German*, Routledge — glosses and frequency ranks.

Both are copyrighted. The PDFs are gitignored, and `deck.json` is derived from them for
personal study use.
