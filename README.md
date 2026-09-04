# B1 Vokabeln

A spaced-repetition flashcard trainer for the German **DTZ / B1** vocabulary, built to run
on a phone. Works offline, stores progress locally, no account and no backend.

**2,670 cards** — every word from the official DTZ *Alphabetische Wortliste*, each with an
English gloss, gender and plural, principal parts for verbs, an authentic example sentence,
and a corpus frequency rank used to order the deck so the most useful words come first.

## Using it

Pick how you want to answer with the switch at the top of the home screen:

- **Tap to reveal** — flip the card and grade yourself. Fast, good on a phone in a queue.
- **Type the answer** — write the translation and get a similarity score before grading.

Then pick a **word list**. *Whole deck* is the default; the chips below it narrow every
screen — study, browse and statistics — to one list:

| | |
|---|---|
| **Connectors** *(Verbindungswörter)* | `obwohl`, `sonst`, `trotzdem`, `sowie`, `jedoch`, `einerseits … andererseits` — the words that join two ideas, and what the writing and speaking parts of the exam are really marked on |
| **Question words**, **Prepositions**, **Time**, **Place**, **Amounts** | the rest of the grammatical machinery |
| **Work**, **Officialdom**, **Home**, **Health**, **Food**, **Travel**, **People**, **Money**, **School**, **Talking**, **Leisure**, **Feelings**, **Nature** | the DTZ's own subject areas |

Each chip shows how many words it holds. A list and a frequency range combine, so
*Connectors* + *Top 500* is the 48 most common linking words.

Then choose **which cards** of that list you want. This row is the answer to a list you
have already worked through: only *Scheduled* obeys the calendar, so a finished list is
never closed to you.

- **Scheduled** — ordinary spaced repetition: what is due today, plus new words mixed in.
  New cards are unlimited by default; session length (default 30) bounds a sitting. Set a
  daily new-card cap in Settings if you would rather pace the intake.
- **New** — only words you have never studied.
- **Old** — only words you have already learned, in random order, whether or not they are
  due. This is the one for a list you have finished and want to keep turning over.
- **Weak** — the words you get wrong most, worst first.
- **All** — every word in the list, in random order.

Each shows how many cards it can give you right now, so you can see at a glance that
*Scheduled* is empty but *Old* has 121 waiting. Every draw of *Old* and *All* is reshuffled,
so a second run is not the same thirty words.

**Revision cannot set you back.** Under *Old*, *Weak* and *All*, answering a learned word
correctly leaves its schedule exactly where it was — interval, ease and due date untouched,
only the tally of right answers goes up — so going through a list again never pushes its
words further away. Get one wrong and it drops back to relearning as usual, because then it
has earned that. Under *Scheduled* and *New*, words move through the schedule normally. The
grade buttons show what will actually happen: a word whose schedule is being kept shows the
time it already had left, not a new interval.

Rate every card **Again / Hard / Good / Easy**. On a keyboard: `space` reveals (and then
accepts the suggested grade), `1`–`4` grade directly.

### Typed answers

The typed answer is compared with a normalised edit distance and scored 0–100%:

- **≥ 95% — Correct**, suggests *Good*.
- **70–94% — Almost**, suggests *Hard*; the missing letters are marked in the answer
  (`Abschlu`**`s`**`s`), so a typo costs you a repeat rather than a full reset.
- **< 70% — Not quite**, suggests *Again*.

The suggestion is only a highlight — you always make the final call.

Matching is deliberately forgiving where it should be and strict where it matters:

- Umlauts may be typed either way — `Gruesse` matches `Grüße`, `abschluß` matches `Abschluss`.
- Any one sense of a multi-part gloss counts: for `to get, fetch, pick up`, both `fetch`
  and `to fetch` are full marks.
- Case and punctuation are ignored.
- **Articles are not.** Answering `Abschluss` is correct but reminds you it is *der*, and
  `die Abschluss` is scored down as a wrong gender — gender is examined at B1.

Leaving the box empty and pressing **Check** just reveals the card without scoring.

### Meanings

A German word rarely has one meaning. Every card lists each sense the DTZ records with
the sentence that shows it — `halten` is *to hold*, *to stop (a train)*, *to keep to,
obey*, *to think of*, and *to keep, last (food)*, each with its own example. The first
three meanings are shown; the rest sit behind a "+n more" toggle.

**One meaning is enough when typing.** Answering `stop` for a word glossed
`stop!; just, simply` scores 100% — the matcher accepts any single sense.

Scheduling is SM-2 (the Anki algorithm). A word you miss comes back within the same
session; one you know drifts out to days, then weeks.

### The whole list on one page

The home screen and Settings both link to **[overview.html](overview.html)** — every word
with its meanings and example sentences, grouped by word list and alphabetical within each,
for reading rather than drilling. **B1-Vokabeln.pdf** is the same thing printed: 81 A4
pages, two columns, 1.2 MB. A word that belongs to several lists appears in each, so a list
reads straight down.

### Install on a phone

Open the site in Safari or Chrome and choose **Add to Home Screen**. It then launches
full-screen and works with no connection.

## Your data

Progress lives in `localStorage` in one browser. It is **not** synced between devices.
Settings → **Export progress** writes a `.json` backup (drop it in Dropbox); **Import**
loads it on another device. Clearing site data erases progress, so export now and then.

Settings → **Reset this word list** forgets your progress on the list currently selected on
the home screen and nothing else, so you can learn it again from scratch. It names the list
and counts the words before it does anything, and words outside the list keep their history.

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
- `sense_labels.json` names each sense. The DTZ numbers its senses but never labels them,
  so all 1,024 multi-sense cards (2,764 sentences) are labelled by hand.
- `word_categories.json` puts each word in its lists. The DTZ Wortliste is alphabetical and
  carries no subject headings at all, so all 2,527 assignments are made by hand. A word can
  be in several lists (`die Krankenkasse` is both *Health* and *Officialdom*); a word that
  belongs nowhere in particular (`haben`, `machen`) is in none.
- `extra_cards.json` holds 22 linking words the DTZ list happens to omit — `sowie`,
  `jedoch`, `dennoch`, `zunächst`, `meiner Meinung nach` — with example sentences written
  by hand. They are the only cards in the deck that do not come from the two sources.

`build_deck.py` keeps the card order stable across rebuilds: any word already present in
the published `deck.json` (read as `deck_prev.json`) keeps its slot, and only genuinely new
words are appended. Progress is stored against a card's position, so a reordered deck would
silently reassign someone's history to the wrong words.

Two classes of correction are applied by hand in `build_deck.py`:

- `FIX_ARTICLE` — nouns whose article the source PDF omits (*Ratschlag*, *Schinken*).
- `SENSE_FIX` — words where the frequency dictionary glosses a homograph rather than the
  DTZ entry: its `laut` is the preposition *according to*, but the DTZ entry is the
  adjective *loud*.
- `GENDER_SENSE` — nouns whose meaning turns on the gender. The frequency dictionary lists
  only one of each pair, so without this *die Leiter* (ladder) would inherit the gloss of
  *der Leiter* (leader).

Then rebuild the reading copy and the PDF:

```sh
python3 build_overview.py     # -> overview.html and B1-Vokabeln.pdf
```

It writes the page, prints it with headless Chrome, and shrinks the result with
ghostscript if that is installed — Chrome embeds a fresh font subset every few pages, which
quadruples the file. Without ghostscript the PDF is still correct, only about 4 MB; without
Chrome you get `overview.html` and can print it yourself.

`.gitignore` excludes `*.pdf` so the copyrighted sources can never be committed by
accident, with a single named exception for `B1-Vokabeln.pdf`, which we generate.

After changing `deck.json`, bump `CACHE` in `sw.js` so phones fetch the new version.

## Sources

- *DTZ Wortliste* — official word list for the Deutsch-Test für Zuwanderer (Goethe-Institut / telc).
- Jones & Tschirner, *A Frequency Dictionary of German*, Routledge — glosses and frequency ranks.

Both are copyrighted. The PDFs are gitignored, and `deck.json` is derived from them for
personal study use.
