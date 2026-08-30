/* B1 Vokabeln — a spaced-repetition trainer for the DTZ/B1 word list.
   Progress is stored in this browser (localStorage) and can be exported as JSON. */
(() => {
'use strict';

const KEY = 'b1v.state.v1';
const DAY = 86400000;
const DEFAULTS = { dir:'de', newPerDay:20, sessLen:30, range:'0', showEx:true };

let DECK = [];
let S = load();
let sess = null;

/* ---------------- storage ---------------- */

function load(){
  try{
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { p: raw.p || {}, log: raw.log || {}, set: Object.assign({}, DEFAULTS, raw.set || {}) };
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

function grade(i, q){
  const st = S.p[i] || { ef:2.5, iv:0, rep:0, due:0, lap:0, ok:0, no:0 };
  const iv = nextInterval(st, q);

  if(q < 3){
    st.rep = 0; st.iv = 0; st.lap++; st.no++;
    st.due = Date.now();                      // stays in this session
  }else{
    st.ef = Math.max(1.3, st.ef + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)));
    st.rep++; st.iv = iv; st.ok++;
    st.due = Date.now() + iv * DAY;
  }
  st.seen = Date.now();
  S.p[i] = st;
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
const pool = () => DECK.filter(inRange);

function dueList(now = Date.now()){
  return pool().filter(c => { const st = S.p[c.i]; return st && st.due <= now && st.rep > 0; });
}
function relearnList(now = Date.now()){
  return pool().filter(c => { const st = S.p[c.i]; return st && st.rep === 0 && st.seen; });
}
function newList(){
  const used = (S.log[todayKey()] || {}).new || 0;
  const left = Math.max(0, S.set.newPerDay - used);
  return pool().filter(c => !S.p[c.i]).slice(0, left);
}

/* ---------------- session ---------------- */

function startSession(mode){
  const lim = +S.set.sessLen;
  let q = [];

  if(mode === 'review'){
    q = [...relearnList(), ...dueList()];
  }else if(mode === 'hard'){
    q = pool().filter(c => { const st = S.p[c.i]; return st && st.no > 0; })
              .sort((a,b) => {
                const A = S.p[a.i], B = S.p[b.i];
                return (B.no/(B.ok+B.no)) - (A.no/(A.ok+A.no)) || B.no - A.no;
              });
  }else{
    const dues = [...relearnList(), ...dueList()];
    const news = newList();
    q = interleave(dues, news);
  }

  if(!q.length){
    toast(mode === 'hard' ? 'No mistakes recorded yet.' : 'Nothing due — try "Study" for new cards.');
    return;
  }
  sess = { q: q.slice(0, lim).map(c => c.i), done:0, seen:0, ok:0, total:0, shown:false, cur:null, isNew:new Set() };
  sess.total = sess.q.length;
  sess.q.forEach(i => { if(!S.p[i]) sess.isNew.add(i); });
  show('study');
  nextCard();
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
  const d = dueList().length + relearnList().length;
  $('#doneLine').textContent = d ? `${d} card${d===1?'':'s'} still waiting.` : 'Everything due is cleared.';
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
const esc = s => s.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

function renderCard(){
  const c = DECK[sess.cur];
  const st = S.p[c.i];
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
  if(S.set.showEx && c.ex){ ex.innerHTML = highlight(c.ex, c.de); ex.classList.remove('hidden'); }
  else ex.classList.add('hidden');

  $('#cBack').classList.add('hidden');
  $('#grades').classList.add('hidden');
  $('#btnShow').classList.remove('hidden');
  $('#tapHint').classList.remove('hidden');

  for(const q of [0,3,4,5]) $('#i'+q).textContent = fmtIv(nextInterval(st, q));

  const pct = sess.total ? (sess.done / sess.total) * 100 : 0;
  $('#sessBar').style.width = pct + '%';
  $('#sessCount').textContent = sess.q.length + 1;
}

function reveal(){
  if(sess.shown) return;
  sess.shown = true;
  $('#cBack').classList.remove('hidden');
  $('#grades').classList.remove('hidden');
  $('#btnShow').classList.add('hidden');
  $('#tapHint').classList.add('hidden');
}

function answer(q){
  if(!sess || !sess.shown) return;
  const i = sess.cur;
  const wasNew = sess.isNew.has(i) && !S.p[i];
  if(wasNew) logToday('new');
  grade(i, q);
  sess.seen++; if(q >= 3) sess.ok++;
  if(q < 3){
    sess.q.splice(Math.min(4, sess.q.length), 0, i);   // resurface soon
  }else{
    sess.done++;
  }
  nextCard();
}

/* ---------------- home ---------------- */

function renderHome(){
  const p = pool();
  const learned = p.filter(c => { const st = S.p[c.i]; return st && st.rep > 0; }).length;
  const pct = p.length ? Math.round(learned / p.length * 100) : 0;
  $('#ringPct').textContent = pct + '%';
  $('#ringFg').style.strokeDashoffset = (326.7 * (1 - pct/100)).toFixed(1);

  $('#tDue').textContent = dueList().length + relearnList().length;
  $('#tNew').textContent = newList().length;
  $('#tStreak').textContent = streak();

  let ok = 0, n = 0;
  for(const k in S.p){ ok += S.p[k].ok; n += S.p[k].ok + S.p[k].no; }
  $('#tAcc').textContent = n ? Math.round(ok/n*100) + '%' : '–';
  $('#homeFoot').textContent = `${learned} of ${p.length} words started`;
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
  if(filter === 'due')    items = items.filter(c => { const s = S.p[c.i]; return s && s.due <= Date.now(); });
  else if(filter === 'weak')   items = items.filter(c => { const s = S.p[c.i]; return s && s.no > 0; });
  else if(filter === 'unseen') items = items.filter(c => !S.p[c.i]);
  else if(filter !== 'all')    items = items.filter(c => c.kind === filter);

  if(term) items = items.filter(c =>
    c.de.toLowerCase().includes(term) || c.en.toLowerCase().includes(term));

  if(filter === 'weak'){
    items.sort((a,b) => { const A = S.p[a.i], B = S.p[b.i]; return B.no - A.no; });
  }

  const box = $('#list');
  if(!items.length){ box.innerHTML = '<p class="empty">Nothing matches.</p>'; return; }
  box.innerHTML = items.slice(0, 400).map(c => {
    const s = S.p[c.i];
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
    const s = S.p[c.i];
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
    const s = S.p[c.i];
    if(!s || s.rep === 0) continue;
    const d = Math.floor((s.due - +t0) / DAY);
    if(d >= 0 && d < 14) buckets[d]++;
    else if(d < 0) buckets[0]++;
  }
  const fmax = Math.max(1, ...buckets);
  $('#fore').innerHTML = buckets.map((n,i) =>
    `<div><i style="height:${n/fmax*100}%" title="${n}"></i><span>${i===0?'now':i}</span></div>`).join('');

  // weakest words
  const weak = p.filter(c => { const s = S.p[c.i]; return s && s.no > 0; })
                .sort((a,b) => S.p[b.i].no - S.p[a.i].no).slice(0, 25);
  $('#weak').innerHTML = weak.length
    ? weak.map(c => { const s = S.p[c.i];
        return `<div class="it"><span class="dot d1"></span><span class="de">${esc(c.de)}</span>` +
               `<span class="en">${esc(c.en)} · ${s.no}✗</span></div>`; }).join('')
    : '<p class="empty">No mistakes yet.</p>';
}

/* ---------------- settings ---------------- */

function bindSettings(){
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
  $('#btnStudy').onclick   = () => startSession('mixed');
  $('#btnReview').onclick  = () => startSession('review');
  $('#btnHard').onclick    = () => startSession('hard');
  $('#toBrowse').onclick   = () => show('browse');
  $('#toStats').onclick    = () => show('stats');
  $('#toSettings').onclick = () => show('settings');
  $('#studyBack').onclick  = () => show('home');
  $('#browseBack').onclick = () => show('home');
  $('#statsBack').onclick  = () => show('home');
  $('#setBack').onclick    = () => show('home');
  $('#doneBack').onclick   = () => show('home');
  $('#btnHome').onclick    = () => show('home');
  $('#btnAgainSession').onclick = () => startSession('mixed');

  $('#card').onclick  = reveal;
  $('#btnShow').onclick = reveal;
  $$('.g').forEach(b => b.onclick = () => answer(+b.dataset.g));

  $('#q').oninput = renderList;
  $$('#browseChips .chip').forEach(ch => ch.onclick = () => {
    $$('#browseChips .chip').forEach(x => x.classList.remove('on'));
    ch.classList.add('on'); filter = ch.dataset.f; renderList();
  });

  document.addEventListener('keydown', e => {
    if($('#study').classList.contains('hidden')) return;
    if(e.target.tagName === 'INPUT') return;
    if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); sess && !sess.shown ? reveal() : answer(4); }
    else if('1234'.includes(e.key)) answer([0,3,4,5][+e.key - 1]);
  });
}

/* ---------------- boot ---------------- */

fetch('deck.json')
  .then(r => r.json())
  .then(d => {
    DECK = d;
    bind();
    show('home');
    if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  })
  .catch(() => {
    document.body.innerHTML =
      '<p style="padding:40px;text-align:center;color:#888">Could not load deck.json.<br>' +
      'Serve this folder over HTTP (see README), not by opening the file directly.</p>';
  });

})();
