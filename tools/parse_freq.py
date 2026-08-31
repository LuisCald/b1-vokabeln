# -*- coding: utf-8 -*-
"""Parse the alphabetical index of the Routledge Frequency Dictionary of German.
Format: headword, part of speech, English equivalent, rank frequency."""
import json, re
from xml.etree import ElementTree as ET

NS = '{http://www.w3.org/1999/xhtml}'
COL_SPLIT = 245.0
Y_HEADER = 78.0        # anything above this is a running header, not an entry
POS = r'der, die|der|die|das|verb|adj|adv|prep|conj|num|part|pron|no art|interj|art'
ENTRY = re.compile(rf'^(?P<hw>.+?)\s+(?P<pos>{POS})\s+(?P<gloss>.+?)\s+(?P<rank>\d{{1,4}})$')

root = ET.parse('randal_idx.xml').getroot()
lines = []
for page in root.iter(NS + 'page'):
    rows = []
    for ln in page.iter(NS + 'line'):
        x, y = float(ln.get('xMin')), float(ln.get('yMin'))
        txt = " ".join((w.text or '') for w in ln.iter(NS + 'word')).strip()
        if not txt: continue
        # Running page numbers sit alone at y=66.9 in the outer margin. On odd pages that
        # is the right margin, so they sort first in column 2 and would otherwise be glued
        # onto the last entry of column 1 ("Hochzeit die wedding 2832" + "157").
        if y < Y_HEADER: continue
        col = 0 if x < COL_SPLIT else 1
        rows.append((col, y, x, txt))
    rows.sort(key=lambda r: (r[0], r[1]))
    base = {0: 70.0, 1: 258.0}
    for col, y, x, txt in rows:
        if x < base[col] or not lines:
            lines.append(txt)                    # new entry
        else:
            lines[-1] += ' ' + txt               # wrapped continuation

freq, skipped = {}, []
for ln in lines:
    ln = re.sub(r'\s+', ' ', ln).replace('ﬁ', 'fi').replace('ﬂ', 'fl').strip()
    if not ln or re.fullmatch(r'[A-Za-z]{2}|\d+', ln):
        continue                                  # letter dividers ("Aa"), page numbers
    m = ENTRY.match(ln)
    if not m:
        skipped.append(ln); continue
    hw = m['hw'].strip()
    rec = {'pos': m['pos'], 'en': m['gloss'].strip(), 'rank': int(m['rank'])}
    for variant in [v.strip() for v in hw.split(',')]:   # "Abbildung, Abb."
        if variant and variant not in freq:
            freq[variant] = rec
    freq[hw] = rec

print(f"index lines: {len(lines)}   parsed: {len(freq)} keys   skipped: {len(skipped)}")
for s in skipped[:12]: print('   SKIP:', s[:80])
json.dump(freq, open('freq.json','w'), ensure_ascii=False, indent=1)
for w in ('Abend','ähnlich','abholen','arbeiten','Haus','gehen','schön'):
    print(f"  {w:<10} -> {freq.get(w)}")
