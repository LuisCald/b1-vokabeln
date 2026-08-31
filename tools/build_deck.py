# -*- coding: utf-8 -*-
"""Join the DTZ Wortliste with frequency-dictionary glosses into a flashcard deck."""
import json, re, unicodedata

dtz  = json.load(open('dtz_entries.json', encoding='utf-8'))
freq = json.load(open('freq.json', encoding='utf-8'))

ART = re.compile(r'^\(?(der|die|das)\)?\s+')
MARKER = re.compile(r'^(jdn\.|jdm\.|jds\.|etw\.|etwas|sich)\s+')

NUMBER = re.compile(r'\((?:nur\s+)?(?:Pl|Sg)\.(?:\s+oder\s+Pl\.)?\)')
EXPAND = {'bio(logisch)': 'biologisch', '(he)rausfinden': 'herausfinden',
          '(he)runterladen': 'herunterladen', '(he)runterfahren': 'herunterfahren'}

def analyse(hw):
    """Split a DTZ headword into article, lemma, plural and verb forms."""
    s = hw.strip()
    number = None
    m = NUMBER.search(s)
    if m:
        number = 'plural' if 'Pl' in m.group(0) and 'oder' not in m.group(0) else 'both'
        s = NUMBER.sub(' ', s)
    s = s.strip().strip('()') if s.strip().startswith('(') and s.strip().endswith(')') else s.strip()
    article = plural = None
    forms, reflexive = [], False

    m = ART.match(s)
    if m:
        article = m.group(1); s = s[m.end():]
    parts = [p.strip() for p in s.split(',')]
    head, rest = parts[0], parts[1:]

    while True:
        m2 = MARKER.match(head)
        if not m2: break
        if m2.group(1) == 'sich': reflexive = True
        head = head[m2.end():]

    if rest:
        if article or re.match(r'^[-"]', rest[0]):
            plural = rest[0] or None
        else:
            forms = [r for r in rest if r]

    key = head.strip()
    if key in EXPAND:
        lemma = EXPAND[key]
    else:
        lemma = re.sub(r'\s*\([^)]*\)\s*$', '', key)      # trailing gloss: ICE (Inter City Express)
        lemma = re.sub(r'^\([^)]*\)\s+', '', lemma)        # leading marker: (sich etwas) aussuchen
        if '(' in lemma:
            lemma = re.sub(r'\(([^)]*)\)', '', lemma)       # optional ending: lang(e) -> lang
    lemma = lemma.strip(' .,/')
    if lemma.lower().startswith('sich '):
        reflexive = True; lemma = lemma[5:].strip()
    return {'article': article, 'lemma': lemma, 'plural': plural, 'number': number,
            'forms': forms, 'reflexive': reflexive}

def first_example(ex):
    """The DTZ gives up to ~9 numbered examples; keep the first as the card sentence."""
    if not ex: return ''
    ex = ex.strip()
    m = re.match(r'^1\.\s*(.*?)(?=\s+2\.\s|$)', ex, re.S)
    s = m.group(1) if m else ex
    s = re.sub(r'\s+\d\.\s.*$', '', s).strip()
    return re.sub(r'\s+', ' ', s)

def lookup(a):
    """Look up the gloss. German capitalisation is meaningful, so a lowercase headword
    must not match a capitalised noun (adverb `recht` is not the noun `Recht`)."""
    l = a['lemma']
    if not l: return None
    if a['article']:
        return freq.get(l[0].upper() + l[1:]) or freq.get(l)
    return freq.get(l)

cards, hit = [], 0
for e in dtz:
    a = analyse(e['hw'])
    if not a['lemma']: continue
    f = lookup(a)
    if f: hit += 1
    pos = (f or {}).get('pos')
    if pos in ('der', 'die', 'das', 'der, die') and not a['article']:
        a['article'] = pos.split(',')[0]           # article known only to the frequency list
    if a['article']: kind = 'noun'
    elif a['forms'] or pos == 'verb': kind = 'verb'
    elif pos in ('adj', 'adv', 'prep', 'pron', 'conj', 'part', 'num'): kind = pos
    else: kind = 'other'
    cards.append({
        'de': e['hw'], 'lemma': a['lemma'], 'article': a['article'],
        'plural': a['plural'], 'forms': a['forms'], 'reflexive': a['reflexive'],
        'number': a['number'],
        'kind': kind, 'en': (f or {}).get('en'), 'rank': (f or {}).get('rank'),
        'ex': first_example(e['ex']), 'sub': e['sub'],
    })

print(f"cards: {len(cards)}   with English gloss: {hit} ({hit/len(cards)*100:.1f}%)   missing: {len(cards)-hit}")
from collections import Counter
print("kinds:", Counter(c['kind'] for c in cards).most_common())
print("with example:", sum(1 for c in cards if c['ex']))
json.dump(cards, open('cards_draft.json','w'), ensure_ascii=False, indent=1)
print("\n--- samples ---")
for c in cards[:6] + [c for c in cards if c['lemma'] in ('Haus','arbeiten','ähnlich')][:3]:
    print(f"  {c['de'][:38]:<38} | {str(c['article'] or ''):<4} {c['lemma'][:18]:<18} | {c['kind']:<5} | {str(c['en'])[:28]:<28} | r={c['rank']} | {c['ex'][:38]}")
print("\n--- missing gloss (first 25) ---")
print([c['lemma'] for c in cards if not c['en']][:25])

# ---- merge hand-written glosses for DTZ words outside the top-4034 frequency list ----
import os
manual = json.load(open('manual_glosses.json', encoding='utf-8')) if os.path.exists('manual_glosses.json') else {}
FIX_ARTICLE = {'Ratschlag': 'der', 'Schinken': 'der'}   # article omitted in the source PDF

# Nouns whose meaning depends on the gender. The frequency dictionary lists only one of
# each pair, so both DTZ entries would otherwise inherit the same gloss.
GENDER_SENSE = {
    ('der', 'Leiter'): 'leader, manager',
    ('die', 'Leiter'): 'ladder',
    ('der', 'Teil'):   'part, section',
    ('das', 'Teil'):   'component, piece',
}

for c in cards:
    c['src'] = 'freq' if c['en'] else None
    if not c['en'] and c['lemma'] in manual:
        c['en'], c['src'] = manual[c['lemma']], 'manual'
    if c['lemma'] in FIX_ARTICLE and not c['article']:
        c['article'], c['kind'] = FIX_ARTICLE[c['lemma']], 'noun'
    sense = GENDER_SENSE.get((c['article'], c['lemma']))
    if sense:
        c['en'], c['src'] = sense, 'manual'

# display form: article + lemma for nouns, plain lemma otherwise
def display(c):
    if c['kind'] == 'noun' and c['article']:
        return f"{c['article']} {c['lemma']}"
    if c['reflexive']:
        return f"sich {c['lemma']}"
    return c['lemma']

# Progress in the app is keyed by a card's position, so the order must stay stable across
# rebuilds. Cards already in the published deck keep their slot; new ones sort by frequency
# and are appended after.
prev_order = {}
if os.path.exists('deck_prev.json'):
    for c in json.load(open('deck_prev.json', encoding='utf-8')):
        prev_order.setdefault(c['de'], c['i'])

def sort_key(c):
    d = display(c)
    if d in prev_order:
        return (0, prev_order[d], 0)
    return (1, c['rank'] is None, c['rank'] or 0)

seen, deck = set(), []
for c in sorted(cards, key=sort_key):
    if not c['en']:
        continue
    k = (display(c).lower(), c['en'])
    if k in seen:
        continue
    seen.add(k)
    deck.append({
        'i': len(deck),
        'de': display(c),
        'en': c['en'],
        'ex': c['ex'],
        'kind': c['kind'],
        'pl': (c['plural'] or '').replace('"', '\u00a8') or None,   # -"e  ->  -¨e
        'forms': c['forms'],
        'rank': c['rank'],
        'src': c['src'],
    })

json.dump(deck, open('deck.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f"\nFINAL DECK: {len(deck)} cards")
print("  ranked (frequency-ordered):", sum(1 for d in deck if d['rank']))
print("  unranked (DTZ-only):", sum(1 for d in deck if not d['rank']))
print("  with example sentence:", sum(1 for d in deck if d['ex']))
print("  kinds:", Counter(d['kind'] for d in deck).most_common())
print("\n  first 8 (most frequent):")
for d in deck[:8]:
    print(f"    {d['de']:<22} {d['en'][:34]:<34} {d['ex'][:44]}")
