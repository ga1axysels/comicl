(() => {
'use strict';

/* =========================================================
   Settings and daily prompts
   ========================================================= */
const RES = 900;              // drawing resolution of each panel (square)
const MAX_HIST = 20;          // undo steps per panel
const INK = '#1d1b18';

// Write your daily prompts here. Day 1 is LAUNCH; after the list runs out it loops.
const LAUNCH = new Date(2026, 10, 16); // months are 0-based: 10 = November
const PROMPTS = [
  { title: 'The Empty Fishbowl', scene: 'A grumpy old cat sits on a kitchen counter next to a fishbowl.', problem: 'The cat looks over and the fishbowl is suddenly empty.' },
  { title: 'The Toilet', scene: 'A sad person enters the washroom.', problem: 'There is a loud noise coming from the toilet.' },
  { title: 'The Last Slice', scene: 'Two friends sit at a table with one slice of pizza left between them.', problem: 'They both reach for it at the exact same moment.' },
  { title: 'Bus Stop Blues', scene: 'Someone waits at a bus stop as dark clouds roll in.', problem: 'It starts pouring, and they realize their umbrella is still on the bus.' },
  { title: 'Plant Parent', scene: 'Someone proudly waters a tiny sprout on the windowsill.', problem: 'The next morning, the sprout is taller than the house.' },
  { title: 'Wrong Order', scene: 'A customer at a cafe orders a small coffee.', problem: 'The barista hands them something that is definitely not coffee.' },
  { title: 'Snow Day', scene: 'A snowman stands proudly in a front yard.', problem: 'The sun comes out, and the snowman starts to sweat.' },
];

const PANEL_META = [
  { label: 'Set the scene', key: 'scene' },
  { label: 'Show the problem', key: 'problem' },
  { label: 'Cook something up.' },
  { label: 'End off the comic.' },
];

// Bubble shapes, drawn in a 100x100 box that stretches to the bubble's size.
// inset = text area as % from [left, top, right, bottom]
const SHAPES = {
  speech: { name: 'Speech', w: 38, h: 26, inset: [12, 13, 12, 27],
    d: 'M50 4C77 4 98 20 98 42C98 64 77 80 50 80C46 80 42 80 38 79L20 97L26 76C12 70 2 57 2 42C2 20 23 4 50 4Z' },
  thought: { name: 'Thought', w: 38, h: 30, inset: [18, 17, 18, 32],
    d: 'M25 20C25 8 42 4 50 12C58 2 78 6 78 18C92 18 98 32 90 42C98 54 88 68 74 64C70 76 52 78 46 68C36 78 18 74 18 62C4 62 0 46 10 40C2 30 12 18 25 20Z M20 84a5 5 0 1 0 10 0a5 5 0 1 0-10 0Z M9 94a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z' },
  shout: { name: 'Shout', w: 42, h: 34, inset: [24, 27, 24, 27],
    d: 'M50 2L60 18L80 6L76 28L98 30L82 46L98 62L76 66L82 90L60 78L50 98L40 78L18 90L24 66L2 62L18 46L2 30L24 28L20 6L40 18Z' },
  caption: { name: 'Caption box', w: 42, h: 16, inset: [6, 8, 6, 8],
    d: 'M1 1H99V99H1Z' },
  edge: { name: 'Side box (tucks into the panel edge)', w: 46, h: 15, inset: [7, 10, 7, 10], edge: true,
    d: 'M1 1H99V99H1Z' },
};

const SWATCHES = ['#1d1b18', '#ffffff', '#8a8580', '#ff5a3c', '#ff9f1c', '#ffd23f', '#3bb273', '#2ec4b6', '#3d7eff', '#8b5cf6', '#ff8fc8', '#8d5a3b'];
const BORDERS = ['#ffffff', '#1d1b18', '#f6ecd6', '#ff5a3c', '#ffd23f', '#3bb273', '#3d7eff', '#ff8fc8', '#8b5cf6', '#2ec4b6'];

/* =========================================================
   Helpers
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const pad2 = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const keyToDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = k => keyToDate(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  keys() { try { return Object.keys(localStorage); } catch (e) { return []; } },
};

function dayInfo(d = new Date()) {
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = Math.round((mid - LAUNCH) / 864e5) + 1;
  const idx = (((n - 1) % PROMPTS.length) + PROMPTS.length) % PROMPTS.length;
  return { key: dateKey(mid), n, prompt: PROMPTS[idx] };
}
const today = dayInfo();

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

// colour maths
function hsvToRgb(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
}
const rgbToHex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
const hexToRgb = hx => { const n = parseInt(hx.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
}
function inkFor(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#ffffff' : INK;
}

/* =========================================================
   Elements and state
   ========================================================= */
const homeScreen = $('#home'), drawScreen = $('#draw'), resultScreen = $('#result');
const track = $('#track'), viewport = $('#viewport'), drawTop = $('#drawTop'), mobileBar = $('#mobileBar');
const toolbar = $('#toolbar'), sheet = $('#sheet');
const mq = matchMedia('(max-width: 760px)');

let mobile = mq.matches;
let panels = [];
let cur = 0;
let pageH = 600, canvasPx = 560;
let tool = 'brush', color = INK, hsv = rgbToHsv(hexToRgb(INK)), size = 10, opacity = 1;
let bid = 1;
let draftReady, ready = false;
let comic = null; // comic shown on the result screen

/* =========================================================
   Screens
   ========================================================= */
function show(name) {
  homeScreen.hidden = name !== 'home';
  drawScreen.hidden = name !== 'draw';
  resultScreen.hidden = name !== 'result';
  closeSheet();
  if (name !== 'result') history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
}

function showHome() {
  show('home');
  homeScreen.style.opacity = '';
  const done = loadComic(today.key);
  $('#startBtn').textContent = done ? "See today's comic" : (store.get(draftKey()) ? 'Keep drawing' : 'Start');
  $('#homeRecent').hidden = !listKeys().length;
}

/* ---------- home ---------- */
function buildHome() {
  $('#tcMeta').textContent = `Comicle #${today.n} · ${fmtDate(today.key)}`;
  $('#tcTitle').textContent = today.prompt.title;
  const paths = ['M2 14Q8 2 14 14T26 14T38 14', 'M6 4Q20 12 8 24', 'M4 4C22 4 22 24 4 24', 'M4 14a8 8 0 1 0 16 0', 'M4 22L12 6L20 22', 'M2 10q6-7 12 0q6 7 12 0q6-7 12 0', 'M6 6l12 12M18 6L6 18', 'M4 20C10 2 24 2 30 20'];
  const spots = [[7, 12], [24, 7], [76, 9], [90, 24], [5, 48], [92, 54], [11, 84], [31, 92], [70, 90], [88, 80]];
  const box = $('#squiggles');
  spots.forEach(([x, y], i) => {
    const s = el('span', null, `<svg class="sq" viewBox="0 0 40 28" style="animation-delay:${(i * 0.37) % 2.6}s"><path d="${paths[i % paths.length]}"/></svg>`).firstChild;
    s.style.left = x + '%'; s.style.top = y + '%';
    box.appendChild(s);
  });
}

let starting = false;
async function startDrawing() {
  if (starting) return;
  const done = loadComic(today.key);
  if (done) { showResult(done, true); return; }
  starting = true;
  await draftReady;

  const card = $('#titleCard');
  const from = card.getBoundingClientRect();

  // Lay out the drawing screen invisibly so we know where panel 1 sits.
  drawScreen.hidden = false;
  drawScreen.style.visibility = 'hidden';
  layout();
  goTo(cur, true);
  const to = panels[cur].frame.getBoundingClientRect();

  const ghost = el('div', 'morph');
  ghost.appendChild(card.firstElementChild.cloneNode(true));
  document.body.appendChild(ghost);
  card.style.visibility = 'hidden';

  const g = 1.08, gw = from.width * g, gh = from.height * g;
  const box = (l, t, w, h, r) => ({ left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px', borderRadius: r });
  const morph = ghost.animate([
    { ...box(from.left, from.top, from.width, from.height, '14px'), easing: 'cubic-bezier(.3,.7,.4,1)' },
    { ...box(from.left - (gw - from.width) / 2, from.top - (gh - from.height) / 2, gw, gh, '14px'), offset: 0.28, easing: 'cubic-bezier(.65,0,.35,1)' },
    box(to.left, to.top, to.width, to.height, '2px'),
  ], { duration: 1100, fill: 'forwards' });
  ghost.firstElementChild.animate([{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], { duration: 1100, fill: 'forwards' });
  homeScreen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 150, fill: 'forwards' });

  await morph.finished;
  drawScreen.style.visibility = '';
  drawScreen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease' });
  homeScreen.getAnimations().forEach(a => a.cancel());
  homeScreen.hidden = true;
  card.style.visibility = '';
  await ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350 }).finished;
  ghost.remove();
  starting = false;
}

/* =========================================================
   Drawing screen: pages, layout, moving between panels
   ========================================================= */
function buildPages() {
  track.innerHTML = '';
  panels = PANEL_META.map((m, i) => {
    const page = el('div', 'page');
    page.innerHTML = `
      <div class="page-inner">
        <header class="page-head">
          <h2><span class="pn">Panel ${i + 1}:</span> ${m.label}</h2>
          ${m.key ? '<p class="desc"></p>' : ''}
        </header>
        <div class="work">
          <div class="frame">
            <canvas class="art" width="${RES}" height="${RES}"></canvas>
            <canvas class="live" width="${RES}" height="${RES}"></canvas>
            <div class="layer"></div>
          </div>
          <div class="tool-slot"></div>
        </div>
        <div class="page-foot"><button class="btn btn-primary done-btn">${i === 3 ? 'Finish ✓' : 'Done ✓'}</button></div>
      </div>`;
    if (m.key) $('.desc', page).textContent = today.prompt[m.key];
    track.appendChild(page);
    const art = $('.art', page), live = $('.live', page);
    const p = {
      i, page, art, live,
      frame: $('.frame', page), layer: $('.layer', page), slot: $('.tool-slot', page),
      actx: art.getContext('2d', { willReadFrequently: true }),
      lctx: live.getContext('2d'),
      bubbles: [], hist: [], hi: -1, dirty: true, url: null,
    };
    attachDrawing(p);
    $('.done-btn', page).addEventListener('click', onDone);
    return p;
  });
}

function layout() {
  mobile = mq.matches;
  document.body.classList.toggle('is-mobile', mobile);
  const vw = window.innerWidth, vh = window.innerHeight;
  const topH = drawTop.offsetHeight || (mobile ? 52 : 60);
  const barH = mobile ? (mobileBar.offsetHeight || 64) : 0;
  const vpH = vh - topH - barH;
  const peek = mobile ? 0 : Math.round(clamp(vpH * 0.1, 48, 84));
  pageH = vpH - peek;
  const headH = mobile ? 86 : 100, footH = mobile ? 0 : 72;
  canvasPx = mobile
    ? Math.min(vw - 24, pageH - headH - 12)
    : Math.min(pageH - headH - footH, vw - 236 - 24 - 48, 780);
  canvasPx = Math.max(220, Math.floor(canvasPx));

  const rs = document.documentElement.style;
  rs.setProperty('--page-h', pageH + 'px');
  rs.setProperty('--canvas', canvasPx + 'px');
  rs.setProperty('--head-h', headH + 'px');
  rs.setProperty('--foot-h', footH + 'px');
  rs.setProperty('--bstroke', Math.max(2, canvasPx * 0.006).toFixed(1) + 'px');
  viewport.style.height = vpH + 'px';
  setTrack(true);
  placeToolbar();
  updateSizeDot();
}

function setTrack(instant) {
  if (instant) track.style.transition = 'none';
  track.style.transform = `translate3d(0, ${-cur * pageH}px, 0)`;
  if (instant) { void track.offsetHeight; track.style.transition = ''; }
}

function placeToolbar() {
  const slot = mobile ? $('#sheetSlot') : panels[cur] && panels[cur].slot;
  if (slot && toolbar.parentElement !== slot) slot.appendChild(toolbar);
}

function goTo(i, instant = false) {
  i = clamp(i, 0, 3);
  blurBubbles();
  closeSheet();
  if (panels[cur] && i !== cur) trimHistory(panels[cur]);
  cur = i;
  setTrack(instant);
  panels.forEach(p => p.page.classList.toggle('active', p.i === cur));
  $$('#dots i').forEach((d, k) => { d.classList.toggle('on', k === cur); d.classList.toggle('past', k < cur); });
  $('#backBtn').classList.toggle('off', cur === 0);
  $('#mDone').textContent = cur === 3 ? 'Finish ✓' : 'Done ✓';
  placeToolbar();
  updateUndo();
  scheduleSave();
}

function onDone() {
  if (cur < 3) goTo(cur + 1); else finish();
}

// Desktop: mouse wheel / trackpad moves between panels (one panel per gesture).
let wheelAcc = 0, lastWheel = 0, wheelLocked = false, lockStart = 0;
function onWheel(e) {
  if (mobile || drawScreen.hidden) return;
  const tb = e.target.closest('.toolbar');
  if (tb && tb.scrollHeight > tb.clientHeight + 2) return;
  e.preventDefault();
  const now = performance.now();
  const gap = now - lastWheel; lastWheel = now;
  if (wheelLocked) {
    if (now - lockStart > 750 && gap > 180) wheelLocked = false; else return;
  }
  if (gap > 180) wheelAcc = 0;
  wheelAcc += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  if (Math.abs(wheelAcc) < 45) return;
  const dir = Math.sign(wheelAcc); wheelAcc = 0;
  const next = cur + dir;
  if (next < 0 || next > 3) return;
  goTo(next);
  wheelLocked = true; lockStart = now;
}

/* =========================================================
   Drawing
   ========================================================= */
function toCanvas(e, c) {
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * RES / r.width, y: (e.clientY - r.top) * RES / r.height };
}

let stroke = null;
function attachDrawing(p) {
  const c = p.live;
  c.addEventListener('pointerdown', e => {
    if (e.button > 0 || p.i !== cur || stroke) return;
    e.preventDefault();
    blurBubbles();
    const pt = toCanvas(e, c);
    if (tool === 'fill') { floodFill(p, pt); pushHist(p); return; }
    c.setPointerCapture(e.pointerId);
    const ctx = tool === 'eraser' ? p.actx : p.lctx;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = size;
    if (tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = ctx.fillStyle = '#000'; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = ctx.fillStyle = color; c.style.opacity = opacity; }
    stroke = { p, ctx, id: e.pointerId, pts: [pt] };
    ctx.beginPath(); ctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2); ctx.fill();
  });
  c.addEventListener('pointermove', e => {
    if (!stroke || stroke.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(ev => addPoint(toCanvas(ev, c)));
  });
  const end = e => {
    if (!stroke || stroke.id !== e.pointerId) return;
    const { ctx, pts } = stroke;
    if (pts.length > 1) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      ctx.beginPath(); ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (tool !== 'eraser') {
      p.actx.globalAlpha = opacity;
      p.actx.drawImage(p.live, 0, 0);
      p.actx.globalAlpha = 1;
      p.lctx.clearRect(0, 0, RES, RES);
      c.style.opacity = 1;
    }
    stroke = null;
    pushHist(p);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

function addPoint(pt) {
  const { ctx, pts } = stroke;
  const last = pts[pts.length - 1];
  if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.8) return;
  pts.push(pt);
  const n = pts.length;
  ctx.beginPath();
  if (n === 2) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo((pts[0].x + pt.x) / 2, (pts[0].y + pt.y) / 2);
  } else {
    const a = pts[n - 3], b = pts[n - 2], c = pts[n - 1];
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
  }
  ctx.stroke();
}

function floodFill(p, pt) {
  const x0 = Math.floor(pt.x), y0 = Math.floor(pt.y);
  if (x0 < 0 || y0 < 0 || x0 >= RES || y0 >= RES) return;
  const img = p.actx.getImageData(0, 0, RES, RES), d = img.data;
  // compare colours as they look on white paper
  const look = i => { const a = d[i + 3] / 255; return [d[i] * a + 255 * (1 - a), d[i + 1] * a + 255 * (1 - a), d[i + 2] * a + 255 * (1 - a)]; };
  const t = look((y0 * RES + x0) * 4);
  const [r, g, b] = hexToRgb(color), A = opacity;
  const TOL = 90;
  const seen = new Uint8Array(RES * RES);
  const match = idx => { if (seen[idx]) return false; const c = look(idx * 4); return Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) + Math.abs(c[2] - t[2]) <= TOL; };
  const paint = idx => {
    seen[idx] = 1;
    const i = idx * 4, da = d[i + 3] / 255, oa = A + da * (1 - A);
    d[i] = (r * A + d[i] * da * (1 - A)) / oa;
    d[i + 1] = (g * A + d[i + 1] * da * (1 - A)) / oa;
    d[i + 2] = (b * A + d[i + 2] * da * (1 - A)) / oa;
    d[i + 3] = oa * 255;
  };
  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop(); let x = stack.pop();
    while (x > 0 && match(y * RES + x - 1)) x--;
    let up = false, down = false;
    for (; x < RES && match(y * RES + x); x++) {
      paint(y * RES + x);
      if (y > 0) { const m = match((y - 1) * RES + x); if (m && !up) { stack.push(x, y - 1); up = true; } else if (!m) up = false; }
      if (y < RES - 1) { const m = match((y + 1) * RES + x); if (m && !down) { stack.push(x, y + 1); down = true; } else if (!m) down = false; }
    }
  }
  p.actx.putImageData(img, 0, 0);
}

/* ---------- undo / redo ---------- */
function snap(p) { return { img: p.actx.getImageData(0, 0, RES, RES), b: JSON.stringify(p.bubbles) }; }
function pushHist(p, silent) {
  p.hist = p.hist.slice(0, p.hi + 1);
  p.hist.push(snap(p));
  if (p.hist.length > MAX_HIST) p.hist.shift();
  p.hi = p.hist.length - 1;
  if (!silent) { p.dirty = true; scheduleSave(); }
  updateUndo();
}
function restore(p, s) {
  p.actx.putImageData(s.img, 0, 0);
  p.bubbles = JSON.parse(s.b);
  renderBubbles(p);
  p.dirty = true; scheduleSave(); updateUndo();
}
function undo() { const p = panels[cur]; blurBubbles(); if (p.hi > 0) restore(p, p.hist[--p.hi]); }
function redo() { const p = panels[cur]; blurBubbles(); if (p.hi < p.hist.length - 1) restore(p, p.hist[++p.hi]); }
function trimHistory(p) { // keep memory low for panels you're not on
  if (p.hist.length > 6) { const from = Math.max(0, p.hi - 5); p.hist = p.hist.slice(from, p.hi + 1); p.hi = p.hist.length - 1; }
}
function updateUndo() {
  const p = panels[cur]; if (!p) return;
  const u = p.hi <= 0, r = p.hi >= p.hist.length - 1;
  $('#undoBtn').disabled = $('#mUndo').disabled = u;
  $('#redoBtn').disabled = $('#mRedo').disabled = r;
}
function clearPanel() {
  const p = panels[cur];
  p.actx.clearRect(0, 0, RES, RES);
  p.bubbles = []; renderBubbles(p); pushHist(p);
}

/* =========================================================
   Speech bubbles
   ========================================================= */
const PLAIN = (() => { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; })();

// Text size (as % of the panel) grows and shrinks with the box.
function bubbleFont(b) {
  const s = SHAPES[b.type];
  return clamp(4.2 * Math.sqrt((b.w / s.w) * (b.h / s.h)), 1.6, 16);
}
const FLIPPABLE = { speech: 1, thought: 1, shout: 1 };

function placeBubble(n, b) {
  n.style.left = b.x + '%'; n.style.top = b.y + '%';
  n.style.width = b.w + '%'; n.style.height = b.h + '%';
  const s = SHAPES[b.type];
  const shape = n.querySelector(':scope > svg');
  if (shape) shape.style.transform = b.flip ? 'scaleX(-1)' : '';
  const t = n.querySelector('.btext');
  if (t) {
    const [il, it, ir, ib] = s.inset;
    Object.assign(t.style, {
      left: (b.flip ? ir : il) + '%', right: (b.flip ? il : ir) + '%', top: it + '%', bottom: ib + '%',
      fontSize: `calc(var(--canvas) * ${(bubbleFont(b) / 100).toFixed(4)})`,
    });
  }
}

function snapEdge(b) {
  const dl = b.x, dr = 100 - (b.x + b.w), dt = b.y, db = 100 - (b.y + b.h);
  const m = Math.min(dl, dr, dt, db), o = 1.6;
  if (m === dl) b.x = -o; else if (m === dr) b.x = 100 - b.w + o;
  else if (m === dt) b.y = -o; else b.y = 100 - b.h + o;
  b.x = clamp(b.x, -o, 100 - b.w + o); b.y = clamp(b.y, -o, 100 - b.h + o);
}

function addBubble(p, type, cx, cy) {
  const s = SHAPES[type];
  const b = { id: bid++, type, w: s.w, h: s.h, text: '' };
  b.x = clamp(cx - s.w / 2, 0, 100 - s.w);
  b.y = clamp(cy - s.h / 2, 0, 100 - s.h);
  if (s.edge) snapEdge(b);
  p.bubbles.push(b);
  renderBubbles(p);
  pushHist(p);
  const n = p.layer.querySelector(`[data-id="${b.id}"]`);
  selectBubble(p, b.id);
  focusText($('.btext', n));
}

function renderBubbles(p) {
  p.layer.innerHTML = '';
  p.bubbles.forEach(b => p.layer.appendChild(bubbleEl(p, b)));
}

function focusText(t) {
  if (!t) return;
  t.focus();
  const r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

function selectBubble(p, id) {
  $$('.bubble', p.layer).forEach(n => n.classList.toggle('sel', +n.dataset.id === id));
}
function blurBubbles() {
  const a = document.activeElement;
  if (a && a.classList.contains('btext')) a.blur();
  $$('.bubble.sel').forEach(n => n.classList.remove('sel'));
}

function bubbleEl(p, b) {
  const s = SHAPES[b.type];
  const n = el('div', 'bubble');
  n.dataset.id = b.id;
  n.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${s.d}"/></svg>
    <div class="btext" spellcheck="false" data-ph="Type…"></div>
    <button class="b-del" aria-label="Delete bubble">×</button>
    ${FLIPPABLE[b.type] ? '<button class="b-flip" aria-label="Flip bubble" title="Flip"><svg viewBox="0 0 24 24"><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/></svg></button>' : ''}
    ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => `<span class="rz rz-${d}" data-dir="${d}" aria-hidden="true"></span>`).join('')}`;
  const t = $('.btext', n);
  t.contentEditable = PLAIN ? 'plaintext-only' : 'true';
  t.textContent = b.text;
  placeBubble(n, b);

  let before = b.text;
  t.addEventListener('focus', () => { before = b.text; selectBubble(p, b.id); });
  t.addEventListener('input', () => { b.text = t.innerText.replace(/\n$/, ''); p.dirty = true; scheduleSave(); });
  t.addEventListener('blur', () => { if (b.text !== before) pushHist(p); });

  const flipBtn = $('.b-flip', n);
  if (flipBtn) flipBtn.addEventListener('click', e => {
    e.stopPropagation();
    b.flip = !b.flip; placeBubble(n, b); pushHist(p);
  });

  $('.b-del', n).addEventListener('click', e => {
    e.stopPropagation();
    p.bubbles = p.bubbles.filter(x => x !== b);
    n.remove(); pushHist(p);
  });

  n.addEventListener('pointerdown', e => {
    if (p.i !== cur || e.target.closest('.b-del, .b-flip')) return;
    const editing = document.activeElement === t;
    let mode = 'tap', dir = '';
    const rz = e.target.closest('.rz');
    if (rz) { mode = 'size'; dir = rz.dataset.dir; }
    else if (editing && e.target.closest('.btext')) mode = 'textdrag'; // a click places the cursor, a drag moves the bubble
    e.stopPropagation();
    if (mode !== 'textdrag') { e.preventDefault(); if (!editing) blurBubbles(); }
    selectBubble(p, b.id);
    const rect = p.frame.getBoundingClientRect();
    const st = { x: e.clientX, y: e.clientY, bx: b.x, by: b.y, bw: b.w, bh: b.h };
    let moved = false;
    if (mode !== 'textdrag') n.setPointerCapture(e.pointerId);
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - st.x, ev.clientY - st.y) < (mode === 'textdrag' ? 6 : 4)) return;
      if (!moved && mode === 'textdrag') {
        try { n.setPointerCapture(ev.pointerId); } catch (err) {}
        t.blur(); getSelection().removeAllRanges(); selectBubble(p, b.id);
      }
      moved = true;
      const dx = (ev.clientX - st.x) / rect.width * 100, dy = (ev.clientY - st.y) / rect.height * 100;
      if (mode === 'size') {
        // sides stretch one way, corners stretch both
        if (dir.includes('e')) b.w = clamp(st.bw + dx, 8, 130);
        if (dir.includes('w')) { const w = clamp(st.bw - dx, 8, 130); b.x = st.bx + st.bw - w; b.w = w; }
        if (dir.includes('s')) b.h = clamp(st.bh + dy, 6, 130);
        if (dir.includes('n')) { const h = clamp(st.bh - dy, 6, 130); b.y = st.by + st.bh - h; b.h = h; }
      }
      else { b.x = clamp(st.bx + dx, -b.w + 8, 92); b.y = clamp(st.by + dy, -b.h + 8, 92); }
      placeBubble(n, b);
    };
    const up = () => {
      n.removeEventListener('pointermove', mv);
      n.removeEventListener('pointerup', up);
      n.removeEventListener('pointercancel', up);
      if (moved) {
        if (s.edge) { n.classList.add('snap'); snapEdge(b); placeBubble(n, b); setTimeout(() => n.classList.remove('snap'), 220); }
        pushHist(p);
      } else if (mode === 'tap') focusText(t);
    };
    n.addEventListener('pointermove', mv);
    n.addEventListener('pointerup', up);
    n.addEventListener('pointercancel', up);
  });
  return n;
}

// Toolbar bubble buttons: drag onto the panel, or tap to drop one in the middle.
function buildBubbleButtons() {
  const row = $('#bubbleBtns');
  Object.entries(SHAPES).forEach(([type, s]) => {
    const btn = el('button', 'bub-btn', `<svg viewBox="0 0 100 100" preserveAspectRatio="${type === 'caption' || type === 'edge' ? 'none' : 'xMidYMid meet'}"><path d="${type === 'edge' ? 'M1 30H99M1 70H99M99 30V70' : s.d}"/></svg>`);
    if (type === 'caption') btn.querySelector('svg').setAttribute('style', 'height:55%;margin-top:22%');
    if (type === 'edge') { btn.querySelector('svg').innerHTML = '<path d="M0 28H96V72H0Z" style="fill:#fff"/><path d="M0 28H96V72H0" />'; }
    btn.title = s.name; btn.setAttribute('aria-label', 'Add ' + s.name);
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      let ghost = null;
      btn.setPointerCapture(e.pointerId);
      const mv = ev => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
          ghost = el('div', 'ghost', `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${s.d}"/></svg>`);
          ghost.style.width = canvasPx * s.w / 100 + 'px';
          ghost.style.height = canvasPx * s.h / 100 + 'px';
          document.body.appendChild(ghost);
          if (mobile) closeSheet();
        }
        if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
      };
      const up = ev => {
        btn.removeEventListener('pointermove', mv);
        btn.removeEventListener('pointerup', up);
        btn.removeEventListener('pointercancel', up);
        const p = panels[cur];
        if (ghost) {
          ghost.remove();
          if (ev.type === 'pointercancel') return;
          const r = p.frame.getBoundingClientRect();
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
            addBubble(p, type, (ev.clientX - r.left) / r.width * 100, (ev.clientY - r.top) / r.height * 100);
          }
        } else if (ev.type === 'pointerup') {
          if (mobile) closeSheet();
          addBubble(p, type, 50, 40);
        }
      };
      btn.addEventListener('pointermove', mv);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    });
    row.appendChild(btn);
  });
}

/* =========================================================
   Toolbar: tools, colour, size, transparency
   ========================================================= */
function setTool(t) {
  tool = t;
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  document.body.classList.toggle('tool-fill', t === 'fill');
}

const svBox = $('#svBox'), svKnob = $('#svKnob'), hueInput = $('#hue');
function drawSV() {
  const x = svBox.getContext('2d'), w = svBox.width, h = svBox.height;
  x.fillStyle = rgbToHex(hsvToRgb(hsv.h, 1, 1)); x.fillRect(0, 0, w, h);
  let g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function setColor(hex, fromPicker) {
  color = hex;
  if (!fromPicker) { hsv = rgbToHsv(hexToRgb(hex)); hueInput.value = Math.round(hsv.h); drawSV(); }
  svKnob.style.left = hsv.s * 100 + '%'; svKnob.style.top = (1 - hsv.v) * 100 + '%';
  $$('.sw').forEach(s => s.classList.toggle('on', s.dataset.c === hex));
  $$('.cur-color').forEach(s => { s.style.background = hex; });
  if (tool === 'eraser') setTool('brush');
  updateSizeDot();
}
function pickerColor() { return rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v)); }
function updateSizeDot() {
  const d = clamp(size * canvasPx / RES, 2, 36);
  const dot = $('#sizeDot');
  dot.style.width = dot.style.height = d + 'px';
  dot.style.background = color; dot.style.opacity = opacity;
  dot.style.boxShadow = color.toLowerCase() === '#ffffff' ? '0 0 0 1px ' + INK : 'none';
}

function buildToolbar() {
  $$('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#mUndo').addEventListener('click', undo);
  $('#mRedo').addEventListener('click', redo);
  $('#clearBtn').addEventListener('click', () => { clearPanel(); toast('Panel cleared. Undo brings it back.'); });

  const sw = $('#swatches');
  SWATCHES.forEach(c => {
    const b = el('button', 'sw'); b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', 'Colour ' + c);
    b.addEventListener('click', () => setColor(c));
    sw.appendChild(b);
  });

  const pick = e => {
    const r = svBox.getBoundingClientRect();
    hsv.s = clamp((e.clientX - r.left) / r.width, 0, 1);
    hsv.v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
    setColor(pickerColor(), true);
  };
  const picker = $('#picker');
  picker.addEventListener('pointerdown', e => { e.preventDefault(); picker.setPointerCapture(e.pointerId); pick(e); picker.onpointermove = pick; });
  picker.addEventListener('pointerup', () => { picker.onpointermove = null; });
  hueInput.addEventListener('input', () => { hsv.h = +hueInput.value; if (hsv.s === 0) hsv.s = 1; if (hsv.v < 0.2) hsv.v = 0.9; drawSV(); setColor(pickerColor(), true); });

  $('#size').addEventListener('input', e => { size = +e.target.value; updateSizeDot(); });
  $('#opacity').addEventListener('input', e => { opacity = +e.target.value / 100; $('#opVal').textContent = e.target.value + '%'; updateSizeDot(); });

  drawSV(); setColor(INK);
}

/* ---------- phone add-ons sheet ---------- */
function openSheet() {
  sheet.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.classList.remove('open');
  setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 300);
}

/* =========================================================
   Saving your progress (this device)
   ========================================================= */
const draftKey = () => 'comicle:draft:' + today.key;
const isBlank = p => {
  if (p.bubbles.length) return false;
  const d = p.actx.getImageData(0, 0, RES, RES).data;
  for (let i = 3; i < d.length; i += 16) if (d[i]) return false;
  return true;
};

async function loadDraft() {
  // drop old days' drafts
  store.keys().forEach(k => { if (k.startsWith('comicle:draft:') && k !== draftKey()) store.del(k); });
  const d = store.get(draftKey());
  if (d && Array.isArray(d.panels)) {
    await Promise.all(panels.map(async (p, i) => {
      const s = d.panels[i]; if (!s) return;
      p.bubbles = Array.isArray(s.bubbles) ? s.bubbles : [];
      p.bubbles.forEach(b => { bid = Math.max(bid, (b.id | 0) + 1); });
      renderBubbles(p);
      if (s.img) {
        try { const im = await loadImg(s.img); p.actx.drawImage(im, 0, 0, RES, RES); p.url = s.img; p.dirty = false; } catch (e) {}
      }
    }));
    cur = clamp(d.cur | 0, 0, 3);
  }
  panels.forEach(p => pushHist(p, true));
  ready = true;
}

let saveT;
function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(saveDraft, 500); }
function saveDraft() {
  if (!ready || loadComic(today.key)) return;
  const data = {
    cur,
    panels: panels.map(p => {
      if (p.dirty) { p.url = isBlank(p) ? null : p.art.toDataURL('image/png'); p.dirty = false; }
      return { img: p.url, bubbles: p.bubbles };
    }),
  };
  store.set(draftKey(), data);
}

/* finished comics */
const listKeys = () => store.get('comicle:list') || [];
const loadComic = k => store.get('comicle:comic:' + k);
function saveComic(c) {
  const list = listKeys().filter(k => k !== c.key);
  list.unshift(c.key);
  while (!store.set('comicle:comic:' + c.key, c)) {
    const old = list.length > 1 ? list.pop() : null;
    if (!old) { toast('Storage is full, so this comic could not be saved.'); return; }
    store.del('comicle:comic:' + old);
  }
  store.set('comicle:list', list);
}
let comicSaveT;
function saveComicSoon() { clearTimeout(comicSaveT); comicSaveT = setTimeout(() => comic && saveComic(comic), 300); }

/* =========================================================
   Finish: build the strip and dispense it
   ========================================================= */
function wrapLines(x, text, maxW) {
  const out = [];
  String(text).split('\n').forEach(par => {
    let line = '';
    par.split(/(\s+)/).forEach(word => {
      const test = line + word;
      if (x.measureText(test).width <= maxW || !line.trim()) {
        if (x.measureText(test).width > maxW) { // a single long word: break by letters
          for (const ch of word) { if (x.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; } line += ch; }
        } else line = test;
      } else { out.push(line.trimEnd()); line = word.trimStart(); }
    });
    out.push(line.trimEnd());
  });
  return out;
}

function drawBubble(x, b, S) {
  const s = SHAPES[b.type];
  const bx = b.x / 100 * S, by = b.y / 100 * S, bw = b.w / 100 * S, bh = b.h / 100 * S;
  const path = new Path2D();
  path.addPath(new Path2D(s.d), b.flip
    ? new DOMMatrix([-bw / 100, 0, 0, bh / 100, bx + bw, by])
    : new DOMMatrix([bw / 100, 0, 0, bh / 100, bx, by]));
  x.fillStyle = '#fff'; x.fill(path);
  x.lineWidth = Math.max(2, S * 0.006); x.strokeStyle = INK; x.lineJoin = 'round'; x.stroke(path);
  if (!b.text) return;
  const fs = S * bubbleFont(b) / 100, lh = fs * 1.15;
  x.font = `${fs}px "Garamondt", Georgia, serif`;
  x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
  const il = b.flip ? s.inset[2] : s.inset[0], ir = b.flip ? s.inset[0] : s.inset[2];
  const L = bx + bw * il / 100, T = by + bh * s.inset[1] / 100;
  const R = bx + bw - bw * ir / 100, B = by + bh - bh * s.inset[3] / 100;
  const lines = wrapLines(x, b.text, R - L);
  let y = (T + B) / 2 - (lines.length * lh) / 2 + lh / 2;
  x.save(); x.beginPath(); x.rect(L, T, R - L, B - T); x.clip();
  lines.forEach(l => { x.fillText(l, (L + R) / 2, y); y += lh; });
  x.restore();
}

function composite(p, S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  x.drawImage(p.art, 0, 0, S, S);
  x.save(); x.beginPath(); x.rect(0, 0, S, S); x.clip();
  p.bubbles.forEach(b => drawBubble(x, b, S));
  x.restore();
  return c;
}

async function finish() {
  blurBubbles();
  try { await document.fonts.ready; } catch (e) {}
  const c = {
    key: today.key, n: today.n,
    promptTitle: today.prompt.title, title: today.prompt.title,
    by: store.get('comicle:name') || '',
    border: '#ffffff', layout: 'vertical',
    panels: panels.map(p => composite(p, 720).toDataURL('image/jpeg', 0.88)),
    created: Date.now(),
  };
  saveComic(c);
  store.del(draftKey());
  await drawScreen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
  drawScreen.getAnimations().forEach(a => a.cancel());
  showResult(c, true);
}

function applyStrip(c) {
  const strip = $('#strip');
  strip.style.setProperty('--border', c.border);
  strip.style.setProperty('--strip-ink', inkFor(c.border));
  $('#dispenser').classList.toggle('grid', c.layout === 'grid');
  $$('.bsw').forEach(b => b.classList.toggle('on', b.dataset.c === c.border));
  $$('.shape-btn').forEach(b => b.classList.toggle('on', b.dataset.layout === c.layout));
  fitStrip();
}

// Size the panels so the whole strip (plus the buttons under it) fits on screen.
function fitStrip() {
  if (resultScreen.hidden || !comic) return;
  const disp = $('#dispenser'), panelsEl = $('#stripPanels');
  const grid = comic.layout === 'grid', cols = grid ? 2 : 1, rows = grid ? 2 : 4, GAP = 12;
  const panelsH = panelsEl.offsetHeight;
  const chrome = disp.offsetHeight - panelsH;                 // slot, title, name line, padding
  const top = disp.getBoundingClientRect().top + window.scrollY;
  const stacked = window.innerWidth <= 760;
  const actions = stacked ? $('#resSide').offsetHeight + 24 : 24;
  const availH = window.innerHeight - top - chrome - actions;
  const availW = Math.min(window.innerWidth, 1100) - 32 - 44 - 36 - (stacked ? 0 : 230 + (!$('#customPanel').hidden ? 266 : 0));
  let ps = Math.min((availH - GAP * (rows - 1)) / rows, (availW - GAP * (cols - 1)) / cols, grid ? 380 : 440);
  ps = Math.max(80, Math.floor(ps));
  disp.style.setProperty('--ps', ps + 'px');
  disp.style.setProperty('--cols', cols);
  disp.style.setProperty('--sw', Math.max(ps * cols + GAP * (cols - 1) + 36, 230) + 'px');
}

async function showResult(c, dispense) {
  comic = c;
  show('result');
  history.replaceState(null, '', '#/comic/' + c.key);
  $('#resMeta').textContent = `Comicle #${c.n} · ${fmtDate(c.key)}`;
  $('#stripTitle').value = c.title;
  $('#byInput').value = c.by || '';
  $('#customPanel').hidden = true;
  const sp = $('#stripPanels'); sp.innerHTML = '';
  c.panels.forEach((src, k) => {
    const b = el('button', 'sp', `<img alt="Panel ${k + 1}" src="${src}">`);
    b.setAttribute('aria-label', `View panel ${k + 1} bigger`);
    b.addEventListener('click', () => openLightbox(src, k));
    sp.appendChild(b);
  });
  renderRecent();
  applyStrip(c);

  const strip = $('#strip'), after = $('#resAfter');
  const side = $('#resSide');
  strip.classList.remove('anim', 'out');
  after.classList.remove('show'); side.classList.remove('show');
  if (dispense) {
    await Promise.all($$('img', sp).map(i => i.decode ? i.decode().catch(() => {}) : null));
    void strip.offsetHeight;
    await nextFrame();
    strip.classList.add('anim', 'out');
    setTimeout(() => { after.classList.add('show'); side.classList.add('show'); }, 1900);
  } else {
    strip.classList.add('out');
    after.classList.add('show'); side.classList.add('show');
  }
}

function openLightbox(src, k) {
  const lb = $('#lightbox');
  $('#lightboxImg').src = src; $('#lightboxImg').alt = `Panel ${k + 1}`;
  lb.hidden = false;
}

/* ---------- customize ---------- */
function buildCustomize() {
  const box = $('#borderSwatches');
  BORDERS.forEach(c => {
    const b = el('button', 'bsw'); b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', 'Border colour ' + c);
    b.addEventListener('click', () => { comic.border = c; applyStrip(comic); saveComicSoon(); });
    box.appendChild(b);
  });
  $$('.shape-btn').forEach(b => b.addEventListener('click', () => {
    if (comic.layout === b.dataset.layout) return;
    comic.layout = b.dataset.layout;
    const strip = $('#strip');
    strip.classList.remove('swap'); void strip.offsetWidth; strip.classList.add('swap');
    setTimeout(() => applyStrip(comic), 180);
    saveComicSoon();
  }));
  $('#customizeBtn').addEventListener('click', () => {
    const cp = $('#customPanel');
    cp.hidden = !cp.hidden;
    fitStrip();
    if (!cp.hidden) cp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#customDone').addEventListener('click', () => { $('#customPanel').hidden = true; fitStrip(); });

  const title = $('#stripTitle');
  title.addEventListener('input', () => { comic.title = title.value; saveComicSoon(); });
  const revert = () => { if (!title.value.trim()) { comic.title = comic.promptTitle; title.value = comic.title; saveComicSoon(); } };
  title.addEventListener('blur', revert);
  title.addEventListener('keydown', e => { if (e.key === 'Enter') title.blur(); });

  const by = $('#byInput');
  by.addEventListener('input', () => { comic.by = by.value; store.set('comicle:name', by.value); saveComicSoon(); });
  by.addEventListener('keydown', e => { if (e.key === 'Enter') by.blur(); });
}

/* ---------- recent comics ---------- */
function renderRecent() {
  const grid = $('#recentGrid');
  grid.innerHTML = '';
  const note = $('.recent-note') || el('p', 'recent-note');
  note.textContent = 'Comics made on this device. Everyone else\'s comics will show up here once sharing is set up.';
  grid.before(note);
  listKeys().map(loadComic).filter(Boolean).forEach(c => {
    const card = el('button', 'rc' + (comic && c.key === comic.key ? ' current' : ''));
    card.innerHTML = `<div class="rc-strip">${c.panels.map((s, k) => `<img alt="" src="${s}">`).join('')}</div>
      <div class="rc-title"></div><div class="rc-meta"></div>`;
    $('.rc-strip', card).style.background = c.border;
    $('.rc-title', card).textContent = c.title;
    $('.rc-meta', card).textContent = `#${c.n} · ${fmtDate(c.key)}${c.by ? ' · by ' + c.by : ''}`;
    card.addEventListener('click', () => showResult(c, true));
    grid.appendChild(card);
  });
}

/* ---------- sharing ---------- */
async function stripCanvas(c) {
  try { await document.fonts.ready; } catch (e) {}
  const imgs = await Promise.all(c.panels.map(loadImg));
  const grid = c.layout === 'grid';
  const PAD = 40, GAP = 22, TITLE = 100, BY = 84;
  const PS = grid ? 520 : 640, rows = grid ? 2 : 4;
  const W = PAD * 2 + (grid ? PS * 2 + GAP : PS);
  const H = PAD + TITLE + rows * PS + (rows - 1) * GAP + BY + 12;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const ink = inkFor(c.border);
  x.fillStyle = c.border; x.fillRect(0, 0, W, H);

  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = 60; x.font = `${fs}px "Garamondt", Georgia, serif`;
  while (x.measureText(c.title).width > W - PAD * 2 && fs > 28) { fs -= 2; x.font = `${fs}px "Garamondt", Georgia, serif`; }
  x.fillText(c.title, W / 2, PAD + TITLE / 2 - 10);

  imgs.forEach((im, k) => {
    const col = grid ? k % 2 : 0, row = grid ? k >> 1 : k;
    const px = PAD + col * (PS + GAP), py = PAD + TITLE + row * (PS + GAP);
    x.drawImage(im, px, py, PS, PS);
    x.lineWidth = 6; x.strokeStyle = INK; x.strokeRect(px + 3, py + 3, PS - 6, PS - 6);
  });

  const yb = PAD + TITLE + rows * PS + (rows - 1) * GAP + BY / 2 + 4;
  x.fillStyle = ink; x.textAlign = 'left'; x.font = '38px "Garamondt", Georgia, serif';
  x.fillText('by ' + (c.by || 'anonymous'), PAD, yb);
  x.textAlign = 'right'; x.globalAlpha = 0.6; x.font = '28px "Garamondt", Georgia, serif';
  x.fillText(`comicle #${c.n}`, W - PAD, yb);
  x.globalAlpha = 1;
  return cv;
}
const toBlob = cv => new Promise(r => cv.toBlob(r, 'image/png'));
const shareUrl = c => location.href.split('#')[0] + '#/comic/' + c.key;

async function download(c) {
  const blob = await toBlob(await stripCanvas(c));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `comicle-${c.n}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

async function shareImage(c, fallback) {
  const blob = await toBlob(await stripCanvas(c));
  const file = new File([blob], `comicle-${c.n}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: c.title, text: `My Comicle #${c.n}: ${c.title}` }); } catch (e) {}
    return;
  }
  fallback();
}

async function onShare(kind) {
  const c = comic; if (!c) return;
  if (kind === 'download') { await download(c); toast('Comic saved as an image.'); }
  if (kind === 'link') {
    try { await navigator.clipboard.writeText(shareUrl(c)); toast('Link copied.'); }
    catch (e) { prompt('Copy this link:', shareUrl(c)); }
  }
  if (kind === 'instagram') {
    await shareImage(c, async () => { await download(c); toast('Image saved. Post it from Instagram.'); });
  }
  if (kind === 'messages') {
    await shareImage(c, () => {
      const body = encodeURIComponent(`I finished today's Comicle: "${c.title}" ${shareUrl(c)}`);
      location.href = `sms:&body=${body}`;
    });
  }
}

/* =========================================================
   Routing and start-up
   ========================================================= */
function route() {
  const m = location.hash.match(/^#\/comic\/(\d{4}-\d{2}-\d{2})$/);
  if (m) {
    const c = loadComic(m[1]);
    if (c) { showResult(c, true); return; }
    toast("That comic isn't saved on this device.");
  }
  showHome();
}

function goHome() {
  blurBubbles(); saveDraft();
  showHome();
  homeScreen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
}

function init() {
  buildHome();
  buildPages();
  buildBubbleButtons();
  buildToolbar();
  buildCustomize();
  layout();
  goTo(0, true);
  draftReady = loadDraft().then(() => goTo(cur, true));

  $('#startBtn').addEventListener('click', startDrawing);
  $('#titleCard').addEventListener('click', startDrawing);
  $('#homeRecent').addEventListener('click', () => { const c = loadComic(listKeys()[0]); if (c) showResult(c, true); });
  $('#backBtn').addEventListener('click', () => goTo(cur - 1));
  $('#mDone').addEventListener('click', onDone);
  $('#addonsBtn').addEventListener('click', openSheet);
  $('#sheetScrim').addEventListener('click', closeSheet);
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#drawLogo').addEventListener('click', goHome);
  $('#resLogo').addEventListener('click', goHome);
  $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
  $$('[data-share]').forEach(b => b.addEventListener('click', () => onShare(b.dataset.share)));
  drawScreen.addEventListener('wheel', onWheel, { passive: false });

  window.addEventListener('resize', () => { if (!stroke) layout(); fitStrip(); });
  mq.addEventListener('change', layout);
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', saveDraft);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#lightbox').hidden = true; closeSheet(); blurBubbles(); return; }
    if (drawScreen.hidden) return;
    const typing = e.target.closest('input, textarea, [contenteditable]');
    if (typing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const p = panels[cur], sel = $('.bubble.sel', p.layer);
      if (sel) { e.preventDefault(); p.bubbles = p.bubbles.filter(b => b.id !== +sel.dataset.id); sel.remove(); pushHist(p); }
    }
  });

  route();
}

init();
})();
