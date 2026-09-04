# -*- coding: utf-8 -*-
"""Render the whole deck as one printable page, grouped by word list.

Output is overview.html, which is both a page on the site and the source the PDF is
printed from (see the Makefile target in README). A word that belongs to several lists is
printed in each of them, because the point is to be able to read one list straight down.
"""
import json, html, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
deck = json.load(open(os.path.join(ROOT, 'deck.json'), encoding='utf-8'))

# Same lists, same order, same names as the app's home screen.
CATS = [
    ('connect', 'Connectors',     'Verbindungswörter'),
    ('qw',      'Question words', 'Fragewörter'),
    ('prep',    'Prepositions',   'Präpositionen'),
    ('time',    'Time',           'Zeit'),
    ('place',   'Place',          'Ort & Richtung'),
    ('num',     'Amounts',        'Mengen & Zahlen'),
    ('work',    'Work',           'Arbeit & Beruf'),
    ('office',  'Officialdom',    'Ämter & Behörden'),
    ('home',    'Home',           'Wohnen'),
    ('health',  'Health',         'Gesundheit & Körper'),
    ('food',    'Food',           'Essen & Einkaufen'),
    ('travel',  'Travel',         'Verkehr & Reisen'),
    ('people',  'People',         'Menschen & Familie'),
    ('money',   'Money',          'Geld & Finanzen'),
    ('school',  'School',         'Schule & Ausbildung'),
    ('comm',    'Talking',        'Sprechen & Schreiben'),
    ('free',    'Leisure',        'Freizeit & Medien'),
    ('feel',    'Feelings',       'Gefühle & Charakter'),
    ('nature',  'Nature',         'Natur & Wetter'),
]
e = html.escape

def sortkey(c):
    """Alphabetical, ignoring the article — a reference is for looking things up."""
    d = c['de'].lower()
    for a in ('der ', 'die ', 'das ', 'sich '):
        if d.startswith(a):
            d = d[len(a):]
    return (d, c['de'])

def forms(c):
    """The grammar the card carries: plural for nouns, principal parts for verbs. The
    plural is labelled, because on its own a bare "-" (plural unchanged) reads as a typo."""
    bits = []
    if c['pl']:
        bits.append('pl. ' + c['pl'])
    bits += c['forms']
    return ', '.join(bits)

def entry(c):
    out = [f'<div class="w"><div class="hd"><b>{e(c["de"])}</b>']
    f = forms(c)
    if f:
        out.append(f'<span class="f">{e(f)}</span>')
    out.append(f'<span class="en">{e(c["en"])}</span></div>')
    # One line per meaning, labelled where the meaning is not simply the gloss.
    seen = None
    for s in (c['sn'] or []):
        lab = s.get('en')
        show = lab and lab != seen
        seen = lab or seen
        # An em dash keeps the meaning from reading as the first words of the sentence.
        out.append('<div class="s">' +
                   (f'<i>{e(lab)}</i> &mdash; ' if show else '') +
                   e(s['ex']) + '</div>')
    out.append('</div>')
    return ''.join(out)

sections = []
for slug, en, de in CATS:
    ws = sorted((c for c in deck if slug in c['cat']), key=sortkey)
    sections.append((en, de, ws))
rest = sorted((c for c in deck if not c['cat']), key=sortkey)
if rest:
    sections.append(('Everything else', 'Ohne Liste', rest))

body = []
for en, de, ws in sections:
    body.append(f'<h2 id="{e(en.lower().replace(" ", "-"))}">{e(en)}'
                f'<span>{e(de)} &middot; {len(ws)} words</span></h2>')
    body.append('<div class="cols">' + ''.join(entry(c) for c in ws) + '</div>')

toc = ' '.join(f'<a href="#{e(en.lower().replace(" ", "-"))}">{e(en)} <b>{len(ws)}</b></a>'
               for en, de, ws in sections)

CSS = """
:root{ --ink:#16181d; --dim:#6b7280; --line:#dfe3ea; --accent:#2b5cd9 }
*{box-sizing:border-box}
body{margin:0;padding:22px 20px 40px;background:#fff;color:var(--ink);
  font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-text-size-adjust:100%}
header{max-width:900px;margin:0 auto 18px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--dim);font-size:12.5px;margin:0 0 14px}
.toc{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px}
.toc a{text-decoration:none;color:var(--ink);border:1px solid var(--line);border-radius:99px;
  padding:4px 9px;font-size:11.5px}
.toc a b{color:var(--dim);font-weight:500}
h2{font-size:14.5px;margin:22px 0 8px;padding-bottom:5px;border-bottom:2px solid var(--ink);
  break-after:avoid;page-break-after:avoid}
h2 span{float:right;font-weight:400;color:var(--dim);font-size:11.5px;padding-top:3px}
.cols{columns:2;column-gap:26px}
.w{break-inside:avoid;page-break-inside:avoid;margin:0 0 7px}
.hd{text-indent:-9px;padding-left:9px}
.hd b{font-weight:700}
.f{color:var(--dim);font-size:11px;margin-left:4px}
.en{color:var(--accent);margin-left:5px}
.s{color:#3f444e;font-size:11.5px;padding-left:9px;margin-top:1px}
.s i{color:var(--ink);font-style:normal;font-weight:600}
@media (min-width:1100px){ .cols{columns:3} }
@page{ size:A4; margin:11mm 10mm 11mm 10mm }
@media print{
  /* Helvetica is one of the PDF base fonts, so nothing has to be embedded and the file
     comes out a few megabytes smaller. */
  body{padding:0;font-size:8.2pt;line-height:1.32;font-family:Helvetica,Arial,sans-serif}
  header{margin-bottom:10px}
  h1{font-size:14pt} .sub{font-size:8pt;margin-bottom:8px}
  .toc{display:none}
  h2{font-size:10pt;margin:12px 0 5px;break-before:auto}
  .cols{columns:2;column-gap:7mm}
  .f{font-size:7pt} .s{font-size:7.4pt}
  a{color:inherit;text-decoration:none}
}
"""

n_ex = sum(len(c['sn'] or []) for c in deck)
out = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>B1 Vokabeln — every word by list</title>
<style>{CSS}</style>
</head><body>
<header>
<h1>B1 Vokabeln</h1>
<p class="sub">All {len(deck)} words of the DTZ list with their meanings and example
sentences, grouped by word list and alphabetical within each. {n_ex} sentences.
A word in several lists is printed in each. &nbsp;&middot;&nbsp; Print this page to get a PDF.</p>
<nav class="toc">{toc}</nav>
</header>
{''.join(body)}
</body></html>
"""
path = os.path.join(ROOT, 'overview.html')
open(path, 'w', encoding='utf-8').write(out)
print(f'{path}  {len(out)/1024:.0f} KB')
print(f'  {len(deck)} cards, {n_ex} sentences, {len(sections)} sections')
print('  ' + '  '.join(f'{en}={len(ws)}' for en, de, ws in sections))

# ---- print it to PDF ----
# Chrome is the only thing on a stock Mac that can lay out CSS columns and print them.
import subprocess, shutil, tempfile

CHROME = next((p for p in (
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    shutil.which('google-chrome') or '', shutil.which('chromium') or '',
) if p and os.path.exists(p)), None)

pdf = os.path.join(ROOT, 'B1-Vokabeln.pdf')
if not CHROME:
    print('\nno Chrome found — overview.html is written, print it by hand for the PDF')
    raise SystemExit(0)

raw = os.path.join(tempfile.gettempdir(), 'overview-raw.pdf')
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                '--virtual-time-budget=30000', f'--print-to-pdf={raw}',
                'file://' + path], check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Chrome embeds a fresh font subset every few pages, which quadruples the file. Ghostscript
# merges them; without it the PDF is still correct, only larger.
gs = shutil.which('gs')
if gs:
    subprocess.run([gs, '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5',
                    '-dPDFSETTINGS=/prepress', '-dNOPAUSE', '-dQUIET', '-dBATCH',
                    '-dSubsetFonts=true', '-dCompressFonts=true',
                    f'-sOutputFile={pdf}', raw], check=True)
    print(f'\n{pdf}  {os.path.getsize(pdf)/1e6:.1f} MB'
          f'  (Chrome wrote {os.path.getsize(raw)/1e6:.1f} MB, ghostscript shrank it)')
else:
    shutil.copyfile(raw, pdf)
    print(f'\n{pdf}  {os.path.getsize(pdf)/1e6:.1f} MB  (install ghostscript to shrink it)')
