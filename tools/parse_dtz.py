# -*- coding: utf-8 -*-
"""Parse the DTZ Wortliste.

Layout: A4, two columns (split at x=297). Each column has a headword sub-column and an
example sub-column. Headwords may wrap over several rows; derived sub-entries are
right-aligned in the headword sub-column and can share a row with their example.
Headword and example baselines differ by a fraction of a point, so rows are clustered.
"""
import json, re
from xml.etree import ElementTree as ET

NS = '{http://www.w3.org/1999/xhtml}'
COL_SPLIT, HW_MAX_A, HW_MAX_B = 297.0, 145.0, 405.0
BASE_A, BASE_B = 42.38, 304.59
Y_TOP, Y_BOT, Y_CLUSTER = 90.0, 790.0, 3.0

# "sich an," / "sich vor," continue a separable reflexive verb; "sich verlaufen," starts a
# new one. Only a genuine separable prefix marks a continuation.
def WRAPS(h):
    """True when a headword breaks mid-entry. A trailing comma or slash continues a list
    of forms, and a hyphen glued to a letter is a hyphenated line break ("hat ange-").
    A standalone dash is a noun's plural marker ("der Keller, -") and ends the entry."""
    return h.endswith((',', '/')) or re.search(r'\w-$', h) is not None

SEP_PREFIX = re.compile(
    r'^sich\s+(an|ab|auf|aus|bei|durch|ein|fest|fort|frei|her|hin|los|mit|nach|um|'
    r'unter|vor|weg|weiter|wieder|zu|zurück|zusammen|\u00fcber),')

root = ET.parse('dtz_bb.xml').getroot()

raw = []                                   # (page, col, y, hx, hw_words, ex_words)
for pi, page in enumerate(root.iter(NS + 'page')):
    for ln in page.iter(NS + 'line'):
        ws = [(float(w.get('xMin')), w.text or '') for w in ln.iter(NS + 'word')]
        if not ws: continue
        y = float(ln.get('yMin'))
        if not (Y_TOP < y < Y_BOT): continue
        for col, (lo, hi, hwmax) in enumerate(((0.0, COL_SPLIT, HW_MAX_A),
                                               (COL_SPLIT, 1e9, HW_MAX_B))):
            hw = [t for x, t in ws if lo <= x < hwmax]
            ex = [t for x, t in ws if hwmax <= x < hi]
            if not hw and not ex: continue
            hx = min((x for x, t in ws if lo <= x < hwmax), default=None)
            raw.append([pi, col, y, hx, hw, ex])

# cluster consecutive lines in a column whose baselines are within Y_CLUSTER
raw.sort(key=lambda r: (r[0], r[1], r[2]))
rows = []
for pi, col, y, hx, hw, ex in raw:
    if rows and rows[-1]['page'] == pi and rows[-1]['col'] == col and abs(y - rows[-1]['y']) < Y_CLUSTER:
        r = rows[-1]
        r['hw'] += hw; r['ex'] += ex
        if hx is not None and (r['hx'] is None or hx < r['hx']): r['hx'] = hx
    else:
        rows.append({'page': pi, 'col': col, 'y': y, 'hx': hx, 'hw': list(hw), 'ex': list(ex)})

entries, cur, prev_had_hw = [], None, False
for r in rows:
    hw_txt = " ".join(r['hw']).strip()
    ex_txt = " ".join(r['ex']).strip()
    base = BASE_A if r['col'] == 0 else BASE_B
    if hw_txt:
        if len(hw_txt) <= 2 and hw_txt.isalpha() and hw_txt.isupper():
            cur, prev_had_hw = None, False           # alphabet section header
            continue
        # A wrapped headword sits at the same indent as its first line. It is a
        # continuation if the previous line broke mid-entry (trailing , - /) or if
        # this row carries no example of its own. Prefix entries (Haupt-, irgend-)
        # legitimately have no example, so they never continue the entry above.
        # A prefix entry is a bare stem like "Haupt-" or "heraus-, raus-"; a trailing
        # hyphen on a multi-word headword is just a hyphenated line break.
        is_prefix = bool(re.fullmatch(r'[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]+-(,\s*[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]+-)*', hw_txt.strip())) or '-/' in hw_txt
        # A stem entry ("solch-", "die Bedienungs-") is short and ends in a hyphen; it
        # never runs on into the next entry. A trailing hyphen on a long, accumulated
        # headword ("... hat ange-") is just a hyphenated line break and does continue.
        stem_above = (cur is not None and cur['hw'].rstrip().endswith('-')
                      and len(cur['hw'].split()) <= 2)
        # A bare plural ending ("-en") always belongs to the headword above it, however
        # far it is indented.
        plural_tail = (cur is not None and re.match(r'^[-–"]', hw_txt)
                       and cur['hw'].rstrip().endswith(','))
        # A separable reflexive verb wraps as "sich anstrengen, strengt" / "sich an,
        # strengte sich an, hat sich angestrengt". The second row opens with "sich" but is
        # a verb-form tail, not a new entry: the row above still lacks its auxiliary.
        refl_tail = (cur is not None
                     and SEP_PREFIX.match(hw_txt)
                     and cur['hw'].startswith('sich ')
                     and not re.search(r'\b(hat|ist)\b', cur['hw']))
        # "... hat sich" is never a finished headword: the participle is on the next row.
        dangling = cur is not None and re.search(r'\bsich$', cur['hw'].rstrip()) is not None
        # A verb conjugation that wrapped: the row above ends on a 3rd-person form ("...,
        # gibt" / "..., findet") with no auxiliary yet, and this row supplies "hat/ist ...".
        # Nouns are excluded because their tail is a plural marker ("die Abbildung, -en").
        # A DTZ verb entry always ends in its auxiliary ("hat/ist" + participle), so an
        # entry that has begun listing forms (a comma) and stops at a 3rd-person form is
        # certainly unfinished; whatever lowercase row follows completes it. The wrap can
        # take three rows, so the auxiliary is not necessarily on the very next one.
        # Nouns never match: their tail is a plural marker ("die Abbildung, -en").
        verb_tail = (cur is not None
                     and hw_txt[:1].islower()
                     # a following noun entry ("der Kellner, -") is a new word, not a tail
                     and not re.match(r'^(der|die|das)\b', hw_txt)
                     and ',' in cur['hw']
                     and not re.search(r'\b(hat|ist)\b', cur['hw'])
                     and (cur['hw'].rstrip().endswith(',')
                          or re.search(r'[a-zäöüß]t$', cur['hw'].rstrip())))
        # "die Kita" + "(Kindertagesstätte), -s": a parenthetical gloss carrying the plural.
        paren_tail = cur is not None and re.match(r'^\([^)]*\),\s*-', hw_txt) is not None
        cont = plural_tail or refl_tail or dangling or verb_tail or paren_tail or (cur is not None and prev_had_hw and not is_prefix and not stem_above
                and r['hx'] is not None and cur['hx'] is not None
                and abs(r['hx'] - cur['hx']) < 5.0
                and (WRAPS(cur['hw'].rstrip()) or not ex_txt))
        if cont:
            cur['hw'] = (cur['hw'] + ' ' + hw_txt).strip()
        else:
            cur = {'hw': hw_txt, 'ex': '', 'hx': r['hx'],
                   'sub': r['hx'] > base + 2, 'page': r['page']}
            entries.append(cur)
        prev_had_hw = True
    else:
        prev_had_hw = False
    if ex_txt and cur is not None:
        cur['ex'] = (cur['ex'] + ' ' + ex_txt).strip()

# Final pass: a leftover row that is only a verb form ("hat heruntergeladen") is the
# tail of the headword above it, separated when a wrapped example broke the chain.
CONT = re.compile('^(hat|ist|war|sind|fuhr|lud|ging|blieb|kam|nahm|gab|hielt|ließ)\\b|^sich,')
fixed = []
for e in entries:
    if fixed and CONT.match(e['hw']):
        fixed[-1]['hw'] = (fixed[-1]['hw'] + ' ' + e['hw']).strip()
        if e['ex']:
            fixed[-1]['ex'] = (fixed[-1]['ex'] + ' ' + e['ex']).strip()
        continue
    fixed.append(e)
entries = fixed

STEM = re.compile(r'^(der|die|das) [A-ZÄÖÜ][\wäöüß]*-$')
joined = []
for e in entries:
    if joined and STEM.match(joined[-1]['hw'].strip()) and e['hw'][:1].islower():
        joined[-1]['hw'] = joined[-1]['hw'].strip()[:-1] + e['hw']
        joined[-1]['ex'] = (joined[-1]['ex'] + ' ' + e['ex']).strip()
        continue
    joined.append(e)
entries = joined

for i, e in enumerate(entries):              # drop the appendix
    if e['hw'].startswith('10 ANHANG'):
        entries = entries[:i]; break
for e in entries:
    e['hw'] = re.sub(r'\s+', ' ', e['hw']); e['ex'] = re.sub(r'\s+', ' ', e['ex'])
    # rejoin words split by a hyphenated line break ("hat ange- meldet")
    e['hw'] = re.sub(r'(?<=[a-zäöüß])- (?!der\b|die\b|das\b)(?=[a-zäöüß])', '', e['hw'])
    e['ex'] = re.sub(r'(?<=[a-zäöüß])- (?!der\b|die\b|das\b)(?=[a-zäöüß])', '', e['ex'])

missing = [e for e in entries if not e['ex']]
print(f"entries: {len(entries)}   sub-entries: {sum(e['sub'] for e in entries)}   no example: {len(missing)}")
for e in missing[:25]: print('   MISS:', e['hw'][:60])
json.dump(entries, open('dtz_entries.json','w'), ensure_ascii=False, indent=1)
print("\n--- spot checks ---")
for name in ('schreiben, schreibt','aufschreiben','der See','die Nordsee','sehen,','sein, ist','abnehmen','anmelden','anbieten','bauen'):
    hit = next((e for e in entries if e['hw'].startswith(name)), None)
    print(f"  {name:<21} -> {(hit['hw'][:42]+' || '+hit['ex'][:64]) if hit else 'NOT FOUND'}")
