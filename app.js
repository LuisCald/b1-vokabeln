/* B1 Vokabeln — a spaced-repetition trainer for the DTZ/B1 word list.
   Progress is stored in this browser (localStorage) and can be exported as JSON. */
(() => {
'use strict';

const KEY = 'b1v.state.v1';
const DAY = 86400000;
const DEFAULTS = { dir:'de', newPerDay:9999, sessLen:30, range:'0', showEx:true,
                   typing:'off', sv:2, cat:'', scope:'mix' };

/* Word lists. The DTZ Wortliste is alphabetical and has no subject headings, so every
   card's categories are assigned by hand in tools/word_categories.json. The first few are
   grammatical (a word joins ideas or asks a question); the rest are the DTZ's own topics.
   The German names are shown as tooltips — the exam uses them. */
const CATS = [
  ['connect','Connectors',    'Verbindungswörter'],
  ['qw',     'Question words','Fragewörter'],
  ['prep',   'Prepositions',  'Präpositionen'],
  ['time',   'Time',          'Zeit'],
  ['place',  'Place',         'Ort & Richtung'],
  ['num',    'Amounts',       'Mengen & Zahlen'],
  ['work',   'Work',          'Arbeit & Beruf'],
  ['office', 'Officialdom',   'Ämter & Behörden'],
  ['home',   'Home',          'Wohnen'],
  ['health', 'Health',        'Gesundheit & Körper'],
  ['food',   'Food',          'Essen & Einkaufen'],
  ['travel', 'Travel',        'Verkehr & Reisen'],
  ['people', 'People',        'Menschen & Familie'],
  ['money',  'Money',         'Geld & Finanzen'],
  ['school', 'School',        'Schule & Ausbildung'],
  ['comm',   'Talking',       'Sprechen & Schreiben'],
  ['free',   'Leisure',       'Freizeit & Medien'],
  ['feel',   'Feelings',      'Gefühle & Charakter'],
  ['nature', 'Nature',        'Natur & Wetter'],
];
const CATNAME = Object.fromEntries(CATS.map(c => [c[0], c[1]]));
const CATS_SHOWN = 8;

let DECK = [];
let S = load();
let sess = null;

/* ---------------- storage ---------------- */

function load(){
  try{
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const st = { p: raw.p || {}, log: raw.log || {}, set: Object.assign({}, DEFAULTS, raw.set || {}) };
    // One-off upgrade: drop the old 20-new-cards-a-day cap, which stranded people with
    // "nothing due" once they had worked through it.
    if(raw.set && !raw.set.sv){ st.set.newPerDay = 9999; st.set.sv = 2; }
    return st;
  }catch{
    return { p:{}, log:{}, set:Object.assign({}, DEFAULTS) };
  }
}
let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{ localStorage.setItem(KEY, JSON.stringify(S)); }
    catch{ toast('Could not save — storage is full or blocked.'); }
  }, 120);
}

const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function logToday(field, n = 1){
  const k = todayKey();
  const e = S.log[k] || (S.log[k] = { n:0, ok:0, new:0 });
  e[field] = (e[field] || 0) + n;
}

/* ---------------- SM-2 ---------------- */

/** Returns the next interval in days for card state `st` given grade `q`. */
function nextInterval(st, q){
  if(q < 3) return 0;
  const rep = (st ? st.rep : 0) + 1;
  // "Easy" on a word you already knew should leave the daily queue at once — the deck
  // opens with very common function words that a B1 learner does not need to drill.
  if(rep === 1) return q === 5 ? 4 : 1;
  if(rep === 2) return q === 5 ? 8 : q === 3 ? 4 : 6;
  const ef = st ? st.ef : 2.5;
  let iv = Math.round((st ? st.iv : 1) * ef);
  if(q === 3) iv = Math.max(1, Math.round(iv * 0.7));
  if(q === 5) iv = Math.round(iv * 1.15);
  return Math.max(1, iv);
}

/** True when a passing grade should leave this card's schedule alone: practising a word
    that is already learned and not yet due must not push it further away. A word you have
    never started still graduates normally, so practice can also teach. */
function keepsSchedule(st, q, practice){
  return !!practice && q >= 3 && !!st && st.rep > 0 && st.due > Date.now();
}

function grade(i, q, practice){
  const id = DECK[i].id;
  const st = S.p[id] || { ef:2.5, iv:0, rep:0, due:0, lap:0, ok:0, no:0 };
  const iv = nextInterval(st, q);

  if(q < 3){
    st.rep = 0; st.iv = 0; st.lap++; st.no++;
    st.due = Date.now();                      // stays in this session
  }else if(keepsSchedule(st, q, practice)){
    st.ok++;                                  // counts, but ef / iv / rep / due are kept
  }else{
    st.ef = Math.max(1.3, st.ef + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)));
    st.rep++; st.iv = iv; st.ok++;
    st.due = Date.now() + iv * DAY;
  }
  st.seen = Date.now();
  S.p[id] = st;
  logToday('n'); if(q >= 3) logToday('ok');
  save();
  return st;
}

/* ---------------- deck selection ---------------- */

function inRange(c){
  const r = S.set.range;
  if(r === '0') return true;
  if(r === 'dtz') return !c.rank;
  return !!c.rank && c.rank <= +r;
}
const inCat = c => !S.set.cat || (c.cat && c.cat.indexOf(S.set.cat) >= 0);
/** A word counts as learned once it has been answered right at least once — the same
    measure the progress ring uses, so the ring reaching 100% is what unlocks Practice. */
const isLearned = c => { const st = S.p[c.id]; return !!st && st.rep > 0; };
/** Every screen works on this: the chosen word list, narrowed by the frequency range. */
const pool = () => DECK.filter(c => inCat(c) && inRange(c));

function dueList(now = Date.now()){
  return pool().filter(c => { const st = S.p[c.id]; return st && st.due <= now && st.rep > 0; });
}
function relearnList(now = Date.now()){
  return pool().filter(c => { const st = S.p[c.id]; return st && st.rep === 0 && st.seen; });
}
function newList(){
  const used = (S.log[todayKey()] || {}).new || 0;
  const left = Math.max(0, S.set.newPerDay - used);
  return pool().filter(c => !S.p[c.id]).slice(0, left);
}

/* ---------------- session ---------------- */

/* ---------------- which cards ---------------- */

/* Having picked a word list, you pick which of its cards to see. Scheduled is ordinary
   spaced repetition; the other four ignore the calendar, which is the point — a list you
   have finished has nothing due for weeks, and you should still be able to open it. */
const SCOPES = [
  ['mix',  'Scheduled', 'due today, plus new words'],
  ['new',  'New',       'words you have never studied'],
  ['old',  'Old',       'words you have already learned, in random order'],
  ['weak', 'Weak',      'the ones you get wrong most'],
  ['all',  'All',       'every word in the list, in random order'],
];
const SCOPENAME = Object.fromEntries(SCOPES.map(s => [s[0], s[1]]));

/** The cards a scope offers, in the order it wants them. */
function queueFor(scope){
  const p = pool();
  if(scope === 'new')  return p.filter(c => !S.p[c.id]);
  if(scope === 'old')  return shuffle(p.filter(isLearned));
  if(scope === 'all')  return shuffle(p);
  if(scope === 'weak') return p.filter(c => { const st = S.p[c.id]; return st && st.no > 0; })
    .sort((a, b) => {
      const A = S.p[a.id], B = S.p[b.id];
      return (B.no/(B.ok+B.no)) - (A.no/(A.ok+A.no)) || B.no - A.no;
    });
  return interleave([...relearnList(), ...dueList()], newList());
}

/** Old, Weak and All are revision, not new scheduling: answering right must not push a
    word further away. Only Scheduled and New move the calendar forward. */
const ignoresSchedule = scope => scope === 'old' || scope === 'all' || scope === 'weak';

function startSession(scope){
  S.set.scope = scope = scope || S.set.scope || 'mix';
  const q = queueFor(scope);

  if(!q.length){
    const where = S.set.cat ? ` in ${CATNAME[S.set.cat]}` : '';
    const learned = pool().filter(isLearned).length;
    if(scope === 'new')
      toast(`No new words left${where} — every one has been started.`);
    else if(scope === 'weak')
      toast(`No mistakes recorded${where} yet — nothing to drill.`);
    else if(scope === 'old')
      toast(`Nothing learned${where} yet. Study some new words first.`);
    else if(scope === 'all')
      toast(`${S.set.cat ? CATNAME[S.set.cat] : 'The deck'} has no words in the current range.`);
    else
      toast(learned ? `Nothing due${where} — pick Old or All above to go through it anyway.`
                    : `Nothing due${where} right now.`);
    return;
  }
  sess = { scope, q: q.slice(0, +S.set.sessLen).map(c => c.i), done:0, seen:0, ok:0, total:0,
           shown:false, cur:null, isNew:new Set() };
  sess.total = sess.q.length;
  sess.q.forEach(i => { if(!S.p[DECK[i].id]) sess.isNew.add(i); });
  save();
  show('study');
  nextCard();
}

/** Fisher-Yates. Returns a new array; the deck itself is never reordered. */
function shuffle(a){
  const out = a.slice();
  for(let i = out.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Spread new cards evenly through the due cards rather than front-loading them. */
function interleave(a, b){
  if(!b.length) return a;
  if(!a.length) return b;
  const out = [], step = a.length / (b.length + 1);
  let bi = 0, next = step;
  for(let i = 0; i < a.length; i++){
    out.push(a[i]);
    while(bi < b.length && i + 1 >= next){ out.push(b[bi++]); next += step; }
  }
  while(bi < b.length) out.push(b[bi++]);
  return out;
}

function nextCard(){
  if(!sess.q.length){ endSession(); return; }
  sess.cur = sess.q.shift();
  sess.shown = false;
  renderCard();
}

function endSession(){
  $('#dSeen').textContent = sess.seen;
  $('#dOk').textContent = sess.ok;
  $('#dAcc').textContent = sess.seen ? Math.round(sess.ok / sess.seen * 100) + '%' : '0%';
  if(ignoresSchedule(sess.scope)){
    const name = S.set.cat ? CATNAME[S.set.cat] : 'the deck';
    const left = queueFor(sess.scope).length - sess.seen;
    $('#doneLine').textContent = left > 0
      ? `${left} more ${SCOPENAME[sess.scope].toLowerCase()} in ${name} — press Study again for the next ${Math.min(left, +S.set.sessLen)}.`
      : `That is all of ${name}.`;
  }else{
    const d = dueList().length + relearnList().length;
    $('#doneLine').textContent = d ? `${d} card${d===1?'':'s'} still waiting.` : 'Everything due is cleared.';
  }
  show('done');
}

/* ---------------- rendering ---------------- */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const KINDNAME = { noun:'noun', verb:'verb', adj:'adjective', adv:'adverb',
                   prep:'preposition', conj:'conjunction', pron:'pronoun',
                   part:'particle', other:'' };

function askGerman(i){
  const d = S.set.dir;
  if(d === 'de') return true;
  if(d === 'en') return false;
  return (i * 2654435761 % 2) === 0;             // stable per-card pseudo-random
}

function fmtIv(days){
  if(days <= 0) return '<1 m';
  if(days === 1) return '1 d';
  if(days < 30) return days + ' d';
  if(days < 365) return (days/30).toFixed(days < 60 ? 1 : 0).replace('.0','') + ' mo';
  return (days/365).toFixed(1).replace('.0','') + ' y';
}

function highlight(sentence, de){
  const bare = de.replace(/^(der|die|das|sich)\s+/,'').split(/[\s,/]/)[0];
  const stem = bare.slice(0, Math.max(4, Math.min(bare.length, bare.length - 2)));
  if(stem.length < 3) return esc(sentence);
  const rx = new RegExp('(' + stem.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\w*)', 'gi');
  return esc(sentence).replace(rx, '<b>$1</b>');
}
const esc = s => String(s).replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

const SENSES_SHOWN = 3;

/** Render a word's meanings, each with the sentence that shows it. Consecutive senses
    sharing a label are one meaning illustrated twice, so they are grouped. Only the
    first few are shown; the rest sit behind a "+n more" toggle so the card stays short. */
function renderSenses(sn, de){
  const groups = [];
  for(const s of sn){
    const last = groups[groups.length - 1];
    if(last && last.en === s.en) last.ex.push(s.ex);
    else groups.push({ en:s.en, ex:[s.ex] });
  }
  const hidden = Math.max(0, groups.length - SENSES_SHOWN);
  const body = groups.map((g, i) =>
    `<div class="sense${i >= SENSES_SHOWN ? ' extra' : ''}">` +
      (g.en ? `<div class="sense-en">${esc(g.en)}</div>` : '') +
      g.ex.map(x => `<div class="sense-ex">${highlight(x, de)}</div>`).join('') +
    `</div>`).join('');
  return body + (hidden
    ? `<button type="button" class="more">+${hidden} more meaning${hidden > 1 ? 's' : ''}</button>`
    : '');
}

/* ---------------- typed answers ---------------- */

/** Fold a string to a comparable form: umlauts spelled out (so "Gruesse" matches
    "Grüße"), no case, no punctuation. */
function normAns(s){
  return s.toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9 ]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function levenshtein(a, b){
  if(a === b) return 0;
  if(!a.length) return b.length;
  if(!b.length) return a.length;
  let prev = Array.from({length:b.length+1}, (_,j) => j);
  for(let i = 1; i <= a.length; i++){
    const cur = [i];
    for(let j = 1; j <= b.length; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
const similarity = (a, b) =>
  (!a.length && !b.length) ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length);

/** Accepted spellings, each keeping the form we would show the learner.
    A gloss like "to get, fetch, pick up" accepts any one of its senses. */
function enAlts(en){
  const seen = new Set(), out = [];
  const add = disp => {
    const d = disp.trim(), n = normAns(d);
    if(n && !seen.has(n)){ seen.add(n); out.push({ n, d }); }
  };
  const clean = en.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  add(clean);
  for(const raw of clean.split(/[,;]/)){
    const p = raw.trim();
    if(!p) continue;
    add(p);
    add(p.replace(/^to\s+/i, ''));
    add(p.replace(/^(a|an|the)\s+/i, ''));
  }
  return out;
}

/** German side: with and without the article, slash variants ("gern/gerne"),
    and reflexives without "sich". */
function deAlts(de){
  const seen = new Set(), out = [];
  const add = disp => {
    const d = String(disp).trim(), n = normAns(d);
    if(n && !seen.has(n)){ seen.add(n); out.push({ n, d }); }
  };
  add(de);
  const m = de.match(/^(der|die|das)\s+(.+)$/i);
  const base = m ? m[2] : de;
  if(m) add(base);
  base.split('/').forEach(add);
  de.split('/').forEach(add);
  if(/^sich\s+/i.test(base)) add(base.replace(/^sich\s+/i, ''));
  return out;
}

/** Mark, inside `right`, the characters the typed answer did not account for. */
function diffMark(typed, right){
  const a = normAns(typed), b = normAns(right);
  if(!a) return esc(right);
  // longest-common-subsequence membership on the normalised forms
  const n = a.length, m2 = b.length;
  const dp = Array.from({length:n+1}, () => new Uint16Array(m2+1));
  for(let i = 1; i <= n; i++)
    for(let j = 1; j <= m2; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const keep = new Set();
  let i = n, j = m2;
  while(i > 0 && j > 0){
    if(a[i-1] === b[j-1]){ keep.add(j-1); i--; j--; }
    else if(dp[i-1][j] >= dp[i][j-1]) i--;
    else j--;
  }
  // map positions in the normalised string back onto the original
  let k = -1, html = '';
  for(const ch of right){
    const isChar = normAns(ch).length > 0;
    if(isChar) k++;
    const missing = isChar && !keep.has(k);
    html += missing ? '<mark>' + esc(ch) + '</mark>' : esc(ch);
  }
  return html.replace(/<\/mark><mark>/g, '');    // merge adjacent runs
}

/** Compare what was typed against the card, returning a score and a suggested grade. */
function scoreTyped(typed, card, answerIsGerman){
  const alts = answerIsGerman ? deAlts(card.de) : enAlts(card.en);
  const base = normAns(typed);
  // On the English side "to fetch" and "fetch" are the same answer. On the German side
  // the article is deliberately NOT stripped, so a wrong gender still costs marks.
  const forms = new Set([base]);
  if(!answerIsGerman){
    forms.add(base.replace(/^to /, ''));
    forms.add(base.replace(/^(a|an|the) /, ''));
  }
  let best = 0, bestAlt = alts[0] || { d: answerIsGerman ? card.de : card.en };
  for(const alt of alts){
    for(const f of forms){
      const s = similarity(f, alt.n);
      if(s > best){ best = s; bestAlt = alt; }
    }
  }

  let note = '';
  if(answerIsGerman){
    const m = card.de.match(/^(der|die|das)\s+/i);
    if(m){
      const typedArt = (typed.trim().match(/^(der|die|das)\b/i) || [])[1];
      if(!typedArt) note = 'Remember the article: ' + m[1];
      else if(typedArt.toLowerCase() !== m[1].toLowerCase()) note = 'Wrong gender — it is ' + m[1];
    }
  }
  const pct = Math.round(best * 100);
  const verdict = best >= 0.95 ? 'ok' : best >= 0.7 ? 'warn' : 'bad';
  const suggest = best >= 0.95 ? 4 : best >= 0.7 ? 3 : 0;
  return { pct, verdict, suggest, note, best, alt: bestAlt.d };
}

function renderCard(){
  const c = DECK[sess.cur];
  const st = S.p[c.id];
  const deFront = askGerman(c.i);

  $('#cKind').textContent = (sess.isNew.has(c.i) ? 'new · ' : '') +
                            (KINDNAME[c.kind] || '') + (deFront ? '' : ' · say it in German');
  $('#cFront').textContent = deFront ? c.de : c.en;
  $('#cAnswer').textContent = deFront ? c.en : c.de;

  const bits = [];
  if(c.pl) bits.push('pl. ' + c.pl);
  if(c.forms && c.forms.length) bits.push(c.forms.join(', '));
  if(c.rank) bits.push('#' + c.rank + ' most frequent');
  $('#cMeta').textContent = bits.join('  ·  ');

  const ex = $('#cEx');
  const senses = (c.sn && c.sn.length) ? c.sn
               : (c.ex || []).map(s => ({ en:null, ex:s }));
  if(S.set.showEx && senses.length){
    ex.innerHTML = renderSenses(senses, c.de);
    ex.classList.remove('hidden', 'open');
    const more = ex.querySelector('.more');
    if(more) more.onclick = e => { e.stopPropagation(); ex.classList.add('open'); more.remove(); };
  }else{
    ex.classList.add('hidden');
  }

  $('#cBack').classList.add('hidden');
  $('#grades').classList.add('hidden');
  $('#btnShow').classList.remove('hidden');
  $('#tapHint').classList.remove('hidden');

  const typing = S.set.typing === 'on';
  const fb = $('#typeFb');
  fb.classList.add('hidden'); fb.className = 'type-fb hidden';
  $$('.g').forEach(b => b.classList.remove('sug'));
  $('#typeWrap').classList.toggle('hidden', !typing);
  $('#btnShow').textContent = typing ? 'Check' : 'Show answer';
  $('#tapHint').textContent = typing ? 'type, then press enter' : 'tap to reveal';
  if(typing){
    const inp = $('#typeIn');
    inp.value = '';
    inp.disabled = false;
    inp.lang = deFront ? 'en' : 'de';
    inp.placeholder = deFront ? 'type it in English' : 'type it in German';
    setTimeout(() => inp.focus({ preventScroll:true }), 30);
  }

  const practice = ignoresSchedule(sess.scope);
  for(const q of [0,3,4,5])
    $('#i'+q).textContent = keepsSchedule(st, q, practice)
      ? fmtIv(Math.round((st.due - Date.now()) / DAY))   // unchanged: still due when it was
      : fmtIv(nextInterval(st, q));

  const pct = sess.total ? (sess.done / sess.total) * 100 : 0;
  $('#sessBar').style.width = pct + '%';
  $('#sessCount').textContent = sess.q.length + 1;
}

function reveal(){
  if(!sess || sess.shown) return;
  sess.shown = true;
  sess.suggest = null;
  if(S.set.typing === 'on') checkTyped();
  $('#cBack').classList.remove('hidden');
  $('#grades').classList.remove('hidden');
  $('#btnShow').classList.add('hidden');
  $('#tapHint').classList.add('hidden');
}

/** Score the typed answer and show the result above the revealed card. */
function checkTyped(){
  const inp = $('#typeIn'), fb = $('#typeFb');
  const typed = inp.value.trim();
  inp.disabled = true;
  inp.blur();
  if(!typed){ fb.classList.add('hidden'); return; }   // empty = "just show me"

  const c = DECK[sess.cur];
  const answerIsGerman = !askGerman(c.i);
  const r = scoreTyped(typed, c, answerIsGerman);
  const full = answerIsGerman ? c.de : c.en;
  const label = r.verdict === 'ok' ? 'Correct' : r.verdict === 'warn' ? 'Almost' : 'Not quite';
  const icon  = r.verdict === 'ok' ? '&#10003;' : r.verdict === 'warn' ? '&#8776;' : '&#10007;';

  let html = `<div class="verdict">${icon} ${label} <span class="pct">${r.pct}%</span></div>`;
  if(r.pct < 100){
    html += `<div class="yours">you wrote <s>${esc(typed)}</s></div>`;
    // Marking every letter of a completely wrong guess is noise; only diff near misses.
    html += `<div class="yours">answer ${r.pct >= 40 ? diffMark(typed, r.alt) : esc(r.alt)}</div>`;
    if(normAns(r.alt) !== normAns(full))
      html += `<div class="yours">full sense: ${esc(full)}</div>`;
  }
  if(r.note) html += `<div class="note">${esc(r.note)}</div>`;

  fb.innerHTML = html;
  fb.className = 'type-fb ' + r.verdict;
  sess.suggest = r.suggest;
  const btn = document.querySelector(`.g[data-g="${r.suggest}"]`);
  if(btn) btn.classList.add('sug');
}

function answer(q){
  if(!sess || !sess.shown) return;
  const i = sess.cur;
  const wasNew = sess.isNew.has(i) && !S.p[DECK[i].id];
  if(wasNew) logToday('new');
  grade(i, q, ignoresSchedule(sess.scope));
  sess.seen++; if(q >= 3) sess.ok++;
  if(q < 3){
    sess.q.splice(Math.min(4, sess.q.length), 0, i);   // resurface soon
  }else{
    sess.done++;
  }
  nextCard();
}

/* ---------------- home ---------------- */

function syncMode(){
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === S.set.typing));
}

/** The word-list chips. Counts are live, so a chip also says how big that list is.
    Only the first few are shown until "Show all" is pressed — nineteen chips would push
    the Study button off a phone screen. */
function renderCats(){
  const box = $('#cats');
  const n = {}, done = {};
  let all = 0, allDone = 0;
  for(const c of DECK){
    if(!inRange(c)) continue;
    const learned = isLearned(c);
    all++; if(learned) allDone++;
    for(const k of (c.cat || [])){
      n[k] = (n[k] || 0) + 1;
      if(learned) done[k] = (done[k] || 0) + 1;
    }
  }
  // A tick means the list is finished, so Practice is open on it.
  const chip = (slug, label, de, count, fin, i) =>
    `<button type="button" data-c="${slug}" title="${esc(de)}"` +
    `${i >= CATS_SHOWN ? ' class="hide"' : ''}>${esc(label)} ` +
    `<i>${count > 0 && fin === count ? '&#10003;' : count}</i></button>`;
  box.innerHTML = chip('', 'Whole deck', 'Ganze Liste', all, allDone, -1) +
                  CATS.map(([s2, l, d], i) => chip(s2, l, d, n[s2] || 0, done[s2] || 0, i)).join('');
  const cur = S.set.cat;
  [...box.children].forEach(b => {
    b.classList.toggle('on', b.dataset.c === cur);
    if(b.dataset.c === cur) b.classList.remove('hide');   // never hide the active list
    b.onclick = () => { S.set.cat = b.dataset.c; save(); renderHome(); };
  });
  const hidden = box.querySelectorAll('button.hide').length;
  $('#catsAll').textContent = box.classList.contains('open') || !hidden
    ? 'Show fewer' : `Show all (${CATS.length + 1})`;
  $('#catsAll').classList.toggle('hidden', !hidden && !box.classList.contains('open'));
}

/** Forget the progress on the list you are looking at, so it can be learned again from
    scratch. Scoped to the current pool, which is what the home screen is showing. */
function resetList(){
  const p = pool();
  const name = S.set.cat ? CATNAME[S.set.cat] : 'the whole deck';
  const has = p.filter(c => S.p[c.id]);
  if(!has.length){ toast(`Nothing to reset — ${name} is untouched.`); return; }
  if(!confirm(`Forget your progress on ${has.length} word${has.length === 1 ? '' : 's'} in ` +
              `${name}? They go back to being new. Everything else is kept.`)) return;
  for(const c of has) delete S.p[c.id];
  save(); bindSettings(); renderHome();
  toast(`${name} reset — ${has.length} words are new again.`);
}

/** The five card scopes, each showing how many cards it would give you right now. */
function renderScopes(){
  const box = $('#scopes');
  const cur = S.set.scope || 'mix';
  box.innerHTML = SCOPES.map(([slug, label, hint]) => {
    const n = queueFor(slug).length;
    return `<button type="button" data-s="${slug}" title="${esc(hint)}"` +
           ` class="${slug === cur ? 'on' : n ? '' : 'none'}">` +
           `${esc(label)}<em>${n}</em></button>`;
  }).join('');
  [...box.children].forEach(b => {
    b.onclick = () => { S.set.scope = b.dataset.s; save(); renderHome(); };
  });
  $('#btnStudy').textContent = cur === 'mix' ? 'Study'
    : `Study ${SCOPENAME[cur].toLowerCase()}${S.set.cat ? ' · ' + CATNAME[S.set.cat] : ''}`;
}

function renderHome(){
  syncMode();
  renderCats();
  renderScopes();
  const p = pool();
  const learned = p.filter(c => { const st = S.p[c.id]; return st && st.rep > 0; }).length;
  const pct = p.length ? Math.round(learned / p.length * 100) : 0;
  $('#ringPct').textContent = pct + '%';
  $('#ringFg').style.strokeDashoffset = (326.7 * (1 - pct/100)).toFixed(1);

  $('#tDue').textContent = dueList().length + relearnList().length;
  $('#tNew').textContent = newList().length;
  $('#tStreak').textContent = streak();

  let ok = 0, n = 0;
  for(const k in S.p){ ok += S.p[k].ok; n += S.p[k].ok + S.p[k].no; }
  $('#tAcc').textContent = n ? Math.round(ok/n*100) + '%' : '–';
  $('#homeFoot').textContent =
    `${learned} of ${p.length} words started` + (S.set.cat ? ` in ${CATNAME[S.set.cat]}` : '');
}

function streak(){
  let n = 0;
  for(let d = new Date(); ; d = new Date(d - DAY)){
    const e = S.log[todayKey(d)];
    if(e && e.n > 0) n++;
    else if(n > 0 || todayKey(d) !== todayKey()) break;
  }
  return n;
}

/* ---------------- browse ---------------- */

let filter = 'all';
function renderList(){
  const term = $('#q').value.trim().toLowerCase();
  let items = pool();
  if(filter === 'due')    items = items.filter(c => { const s = S.p[c.id]; return s && s.due <= Date.now(); });
  else if(filter === 'weak')   items = items.filter(c => { const s = S.p[c.id]; return s && s.no > 0; });
  else if(filter === 'unseen') items = items.filter(c => !S.p[c.id]);
  else if(filter !== 'all')    items = items.filter(c => c.kind === filter);

  if(term) items = items.filter(c =>
    c.de.toLowerCase().includes(term) || c.en.toLowerCase().includes(term));

  if(filter === 'weak'){
    items.sort((a,b) => { const A = S.p[a.id], B = S.p[b.id]; return B.no - A.no; });
  }

  const box = $('#list');
  if(!items.length){ box.innerHTML = '<p class="empty">Nothing matches.</p>'; return; }
  box.innerHTML = items.slice(0, 400).map(c => {
    const s = S.p[c.id];
    let d = 0;
    if(s) d = s.rep === 0 ? 1 : s.iv < 7 ? 2 : s.iv < 21 ? 3 : 4;
    const extra = s ? ` · ${s.ok}✓ ${s.no}✗` : '';
    return `<div class="it"><span class="dot d${d}"></span><span class="de">${esc(c.de)}</span>` +
           `<span class="en">${esc(c.en)}${extra}</span></div>`;
  }).join('') + (items.length > 400 ? `<p class="empty">…and ${items.length-400} more. Refine your search.</p>` : '');
}

/* ---------------- stats ---------------- */

function renderStats(){
  // 12-week heatmap
  const cells = [];
  const end = new Date(); end.setHours(0,0,0,0);
  const start = new Date(end - 83*DAY);
  start.setDate(start.getDate() - ((start.getDay()+6) % 7));   // back to Monday
  let max = 1;
  for(const k in S.log) max = Math.max(max, S.log[k].n);
  for(let d = new Date(start); d <= end; d = new Date(+d + DAY)){
    const e = S.log[todayKey(d)];
    const n = e ? e.n : 0;
    const lvl = !n ? 0 : n >= max*0.75 ? 4 : n >= max*0.5 ? 3 : n >= max*0.25 ? 2 : 1;
    cells.push(`<i class="h${lvl}" title="${todayKey(d)}: ${n}"></i>`);
  }
  $('#heat').innerHTML = cells.join('');

  // maturity bar
  const p = pool();
  let unseen = 0, learn = 0, young = 0, mature = 0;
  for(const c of p){
    const s = S.p[c.id];
    if(!s) unseen++;
    else if(s.rep === 0) learn++;
    else if(s.iv < 21) young++;
    else mature++;
  }
  const T = p.length || 1;
  const seg = [['#cf3f3f',learn,'learning'],['#3b6cf6',young,'young'],['#17924f',mature,'mature'],['var(--line)',unseen,'unseen']];
  $('#mat').innerHTML = seg.map(([col,n]) => `<i style="width:${n/T*100}%;background:${col}"></i>`).join('');
  $('#matKey').innerHTML = seg.map(([col,n,l]) => `<span><u style="background:${col}"></u>${l} ${n}</span>`).join('');

  // 14-day forecast
  const buckets = new Array(14).fill(0);
  const t0 = new Date(); t0.setHours(0,0,0,0);
  for(const c of p){
    const s = S.p[c.id];
    if(!s || s.rep === 0) continue;
    const d = Math.floor((s.due - +t0) / DAY);
    if(d >= 0 && d < 14) buckets[d]++;
    else if(d < 0) buckets[0]++;
  }
  const fmax = Math.max(1, ...buckets);
  $('#fore').innerHTML = buckets.map((n,i) =>
    `<div><i style="height:${n/fmax*100}%" title="${n}"></i><span>${i===0?'now':i}</span></div>`).join('');

  // weakest words
  const weak = p.filter(c => { const s = S.p[c.id]; return s && s.no > 0; })
                .sort((a,b) => S.p[b.id].no - S.p[a.id].no).slice(0, 25);
  $('#weak').innerHTML = weak.length
    ? weak.map(c => { const s = S.p[c.id];
        return `<div class="it"><span class="dot d1"></span><span class="de">${esc(c.de)}</span>` +
               `<span class="en">${esc(c.en)} · ${s.no}✗</span></div>`; }).join('')
    : '<p class="empty">No mistakes yet.</p>';
}

/* ---------------- settings ---------------- */

function bindSettings(){
  $('#sRange').options[0].textContent = `Whole deck (${DECK.length})`;
  const map = { sDir:'dir', sNew:'newPerDay', sLen:'sessLen', sRange:'range' };
  for(const [id, key] of Object.entries(map)){
    const el = document.getElementById(id);
    el.value = String(S.set[key]);
    el.onchange = () => {
      S.set[key] = (key === 'dir' || key === 'range') ? el.value : +el.value;
      save(); renderHome();
    };
  }
  const ex = $('#sEx');
  ex.checked = !!S.set.showEx;
  ex.onchange = () => { S.set.showEx = ex.checked; save(); };

  $('#btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify(S)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `b1-vokabeln-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded.');
  };
  $('#btnImport').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{
        const d = JSON.parse(r.result);
        if(!d || typeof d !== 'object' || !d.p) throw 0;
        S = { p:d.p||{}, log:d.log||{}, set:Object.assign({}, DEFAULTS, d.set||{}) };
        save(); bindSettings(); renderHome();
        toast(`Imported ${Object.keys(S.p).length} words.`);
      }catch{ toast('That file is not a valid backup.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  const rl = $('#btnResetList');
  rl.textContent = `Reset ${S.set.cat ? CATNAME[S.set.cat] : 'the whole deck'}`;
  rl.onclick = resetList;
  $('#btnReset').onclick = () => {
    if(!confirm('Delete all progress on this device? Export a backup first if you want to keep it.')) return;
    S = { p:{}, log:{}, set:Object.assign({}, DEFAULTS) };
    save(); bindSettings(); renderHome(); toast('Progress cleared.');
  };
  const n = Object.keys(S.p).length;
  $('#setFoot').textContent = n ? `${n} words have progress stored.` : 'No progress stored yet.';
}

/* ---------------- navigation ---------------- */

function show(id){
  $$('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
  if(id === 'home')     renderHome();
  if(id === 'browse')   renderList();
  if(id === 'stats')    renderStats();
  if(id === 'settings') bindSettings();
  window.scrollTo(0,0);
}

let toastT;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add('hidden'), 2400);
}

function bind(){
  $('#btnStudy').onclick   = () => startSession(S.set.scope);
  $('#toBrowse').onclick   = () => show('browse');
  $('#toStats').onclick    = () => show('stats');
  $('#toSettings').onclick = () => show('settings');
  $('#studyBack').onclick  = () => show('home');
  $('#browseBack').onclick = () => show('home');
  $('#statsBack').onclick  = () => show('home');
  $('#setBack').onclick    = () => show('home');
  $('#doneBack').onclick   = () => show('home');
  $('#btnHome').onclick    = () => show('home');
  $('#btnAgainSession').onclick = () => startSession(S.set.scope);

  $('#card').onclick = () => {
    if(S.set.typing === 'on' && sess && !sess.shown){ $('#typeIn').focus(); return; }
    reveal();
  };
  $('#btnShow').onclick = reveal;
  $('#typeWrap').onsubmit = e => { e.preventDefault(); reveal(); };
  $$('.g').forEach(b => b.onclick = () => answer(+b.dataset.g));

  $$('#modeSeg button').forEach(b => b.onclick = () => {
    S.set.typing = b.dataset.m; save(); syncMode();
  });
  $('#catsAll').onclick = () => { $('#cats').classList.toggle('open'); renderCats(); };

  $('#q').oninput = renderList;
  $$('#browseChips .chip').forEach(ch => ch.onclick = () => {
    $$('#browseChips .chip').forEach(x => x.classList.remove('on'));
    ch.classList.add('on'); filter = ch.dataset.f; renderList();
  });

  document.addEventListener('keydown', e => {
    if($('#study').classList.contains('hidden')) return;
    if(e.target.tagName === 'INPUT') return;      // the answer box handles its own keys
    if(e.key === ' ' || e.key === 'Enter'){
      e.preventDefault();
      if(sess && !sess.shown) reveal();
      else answer(sess && sess.suggest !== null && sess.suggest !== undefined ? sess.suggest : 4);
    }
    else if('1234'.includes(e.key)) answer([0,3,4,5][+e.key - 1]);
  });
}

/** Progress used to be keyed by a card's position in the deck. Rebuilding the deck can
    add or drop words, which would silently reassign that history to the wrong cards, so
    it is now keyed by a stable id. Each card carries its previous position for this
    one-off remap; anything that no longer exists is dropped. */
function migrateProgress(){
  if(S.pv === 3) return;
  const numeric = Object.keys(S.p).filter(k => /^\d+$/.test(k));
  if(numeric.length){
    const byPrev = new Map();
    for(const c of DECK) if(c.pi !== null && c.pi !== undefined) byPrev.set(c.pi, c.id);
    const moved = {};
    let kept = 0;
    for(const k of numeric){
      const id = byPrev.get(+k);
      if(id){ moved[id] = S.p[k]; kept++; }
    }
    for(const k in S.p) if(!/^\d+$/.test(k)) moved[k] = S.p[k];
    S.p = moved;
    console.info(`B1: migrated ${kept}/${numeric.length} words to stable keys`);
  }
  S.pv = 3;
  save();
}

/* ---------------- boot ---------------- */

fetch('deck.json')
  .then(r => r.json())
  .then(d => {
    DECK = d;
    migrateProgress();
    bind();
    save();                       // persist the settings upgrade above, if it ran
    show('home');
    if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  })
  .catch(() => {
    document.body.innerHTML =
      '<p style="padding:40px;text-align:center;color:#888">Could not load deck.json.<br>' +
      'Serve this folder over HTTP (see README), not by opening the file directly.</p>';
  });

})();
