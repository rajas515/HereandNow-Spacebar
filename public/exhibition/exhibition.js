// Exhibition world: the combined map rebuilt lean, with no iframes and one renderer.
// Frameless cutout cards sit on one paper surface, stacked down a column (Act I → Act II).
// Scrolling pans straight down; dragging pans freely, wherever it starts; zoom stays in a
// fixed range and Map zooms out to its limit. Each card's own scene module runs here
// against a shared renderer (world-gl.js), with its page markup in a shadow root.
// /exhibition/?arrange turns on arrange mode: drag cards to move them, Alt+scroll to size
// them, and copy the resulting chapters.js.
import {ACT_1, CHAPTERS} from './chapters.js';
import {MAP_PRESET} from '../shared/map-preset.js';
import {DEFAULT_LAYOUT} from '../shared/studio.js';
import {sceneBounds, screenRect, localCardOffset} from '../map/registry.js';
import {createWorldGL, loadCardDocument} from './world-gl.js';

const $ = s => document.querySelector(s);
const world = $('#world'), viewport = $('#viewport'), minimap = $('#minimap');
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
const ZOOM = {min: .55, max: 1.25};   // the only zoom range allowed; Map shows the min
const LAYOUT_KEY = 'exhibition-layout-v1';   // arrange-mode edits, kept in this browser only
const arranging = new URLSearchParams(location.search).has('arrange');
const PALETTE = {print: MAP_PRESET.print, grades: MAP_PRESET.grades};
// Bump when card code changes: the world imports card pages and scripts on demand, and a
// browser could otherwise reuse an old copy of one.
const ASSET_VERSION = '2026-11-25-cards15';
const MOUNT_WATCHDOG = 30000;   // ms before a slow card stops holding up the others
const gl = createWorldGL($('#gl'));

// ---- nodes: Act I placeholder, then chapters, in order ----
let savedLayout = {};
try { savedLayout = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); } catch {}
const nodes = [
  {...ACT_1, id: 'act-1', title: ACT_1.label, card: ACT_1.card ?? null, isAct: true},
  ...CHAPTERS.map(ch => ({...ch, id: 'ch-' + ch.n, label: `${ch.n} ${ch.title}`})),
].map(n => {
  const stack = DEFAULT_LAYOUT[n.card]?.stack || {}, saved = savedLayout[n.id] || {};
  const el = document.createElement('section');
  el.className = 'node' + (n.isAct ? ' act' : n.card ? '' : ' pending');
  el.id = n.id;
  // A section without its module yet is a placeholder card: a dashed frame with its number, title and tone.
  el.innerHTML = n.card || n.isAct ? `<div class="placeholder">${n.label}</div>`
    : `<div class="placeholder"><span class="ph-num">${n.n}</span><strong>${n.title}</strong>${n.tone ? `<span class="ph-tone">${n.tone}</span>` : ''}<em>Module in progress</em></div>`;
  world.append(el);
  return {...n, x: (saved.x ?? n.x) / 100, y: (saved.y ?? n.y) / 100, size: saved.scale ?? n.scale ?? stack.scale ?? 1, rotation: n.rotation ?? stack.rotation ?? 0,
    el, frame: null, adapter: null, loading: false, viewKey: '', qualityKey: '', transformKey: ''};
});

// ---- camera ----
// The world is measured in screen heights: every card is one screen high and ASPECT screens
// high wide (the shape of the screen the layout was arranged on), so the layout and each
// card's composition look the same on any screen, only scaled. On a narrower screen a card's
// sides run past the edges; on a wider one there is paper either side. OX centres a card.
const ASPECT = 2.06;
let W = innerWidth, H = innerHeight, U = Math.round(H * ASPECT), OX = (W - U) / 2;
world.style.setProperty('--card-w', U + 'px');
let pan = {x: 0, y: 0, z: 1}, target = {...pan}, active = 0, overview = false, dragging = false;
let raf = 0, lastTime = 0;

// Act I is the opening: while in it, scrolling plays its sequence (0 → 1) instead of moving
// the camera. Past its end (empty paper) scrolling carries on straight down into Act II;
// scrolling back up to Act I's resting place plays it in reverse.
const act1 = nodes[0].card ? nodes[0] : null;
const story = {progress: 0, onChange: null};
// The opening (question, room, title and its hold) plays by itself once Act I has loaded and
// stops just into the curatorial note; from there scrolling drives everything. It plays once:
// scrolling back up stops at the start of the note.
const NOTE_LEAD = 2.68;   // seconds into the note when the opening stops ("Dear all, We have gathered here today to…")
const OPENING_SPEED = 1.25;
const AFTER_NOTE_SPEED = 5;   // the letter's reading pause and dissolve go by quickly when scrolled   // the self-playing opening runs a little faster than the scroll timeline
const act1Scroll = {get progress() { return story.progress; }, set onChange(fn) { story.onChange = fn; }, set: p => setStory(p), timeline: null, visible: true};
let opening = null, noteStart = 0;   // opening: {seconds} while it plays
let inAct1 = !!act1 && !arranging;
const act1Pose = () => ({z: 1, x: -act1.x * U, y: -act1.y * H});
function setStory(p) {
  const next = Math.max(0, Math.min(1, p));
  if (next !== story.progress) { story.progress = next; story.onChange?.(); }
  // "Scroll down" while the opening waits at the note, until the visitor scrolls on.
  document.body.classList.toggle('skippable', inAct1 && (!!opening || !act1Scroll.timeline || story.progress < noteStart));
  document.body.classList.toggle('waiting-at-note', inAct1 && !opening && noteStart > 0 && story.progress <= noteStart + .001);
}
function enterAct1(progress) {
  inAct1 = true; overview = false; active = 0;
  target = act1Pose(); setStory(progress);
  updateHud(); wake();
}
function leaveAct1() { inAct1 = false; setStory(1); updateHud(); showPanHint(); }
// The first time a visitor reaches Act II: show that the space can be panned, until they pan.
let panHint = 'pending', panHintTimer = 0;
function showPanHint() {
  if (panHint !== 'pending' || arranging) return;
  panHint = 'showing';
  setTimeout(() => { if (panHint === 'showing') document.body.classList.add('show-pan-hint'); }, 700);
  panHintTimer = setTimeout(hidePanHint, 7000);
}
function hidePanHint() {
  if (panHint !== 'showing') return;
  panHint = 'done'; clearTimeout(panHintTimer);
  document.body.classList.remove('show-pan-hint');
}
function playOpening() {
  const t = act1Scroll.timeline;
  if (!t || !inAct1 || story.progress > 0) { noteStart = t ? (t.opening + NOTE_LEAD) / t.total : 0; return; }
  noteStart = (t.opening + NOTE_LEAD) / t.total;
  if (reducedMotion) return setStory(noteStart);
  opening = {seconds: 0}; wake();
}
// Dev phase: "Skip intro" (or Esc) jumps the opening straight to the curatorial note.
// Remove the button in index.html and this block to drop it for launch.
const skipButton = document.getElementById('skip-intro');
function skipOpening() {
  if (!inAct1 || story.progress >= noteStart && noteStart > 0) return;
  const t = act1Scroll.timeline;
  if (!t) return leaveAct1(), dragBy(0, -H * .5);   // Act I still loading: go straight to Act II
  opening = null; setStory(noteStart); wake();
}
skipButton?.addEventListener('click', e => { e.stopPropagation(); skipOpening(); });
skipButton?.addEventListener('pointerdown', e => e.stopPropagation());
addEventListener('keydown', e => { if (e.key === 'Escape') skipOpening(); });
function stepOpening(dt) {   // called each frame while the opening plays; pauses with the tab
  const t = act1Scroll.timeline;
  opening.seconds += dt * OPENING_SPEED;
  setStory(Math.min(noteStart, opening.seconds / t.total));
  if (story.progress >= noteStart) { opening = null; setStory(noteStart); }
}
function scroll(dy) {   // vertical scroll in screen pixels, positive = down
  if (opening) return;   // the opening plays by itself
  if (inAct1) {
    const t = act1Scroll.timeline, afterNote = t && story.progress >= t.noteEnd / t.total;
    const length = (act1.length || 16) * H, next = Math.max(noteStart, story.progress + dy * (afterNote && dy > 0 ? AFTER_NOTE_SPEED : 1) / length);
    if (next <= 1) return setStory(next), wake();
    leaveAct1();
    return dragBy(0, -(next - 1) * length);
  }
  if (act1 && dy < 0 && target.y - dy >= act1Pose().y) return enterAct1(1 + (act1Pose().y - (target.y - dy)) / ((act1.length || 16) * H));
  dragBy(0, -dy);
}

function bound() {
  if (inAct1) return Object.assign(target, act1Pose());
  const b = sceneBounds(nodes, U, H);
  target.z = Math.max(ZOOM.min, Math.min(ZOOM.max, target.z));
  target.x = Math.max(W * .15 - OX - b.right * U * target.z, Math.min(W * .85 - OX - b.left * U * target.z, target.x));
  target.y = Math.max(H * .15 - b.bottom * H * target.z, Math.min(H * .85 - b.top * H * target.z, target.y));
  if (act1 && target.z === 1) target.y = Math.min(target.y, act1Pose().y);   // above Act I is Act I itself
}
function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(animate); }
gl.onDirty = wake;
function focus(i, instant = false) {   // centre a chapter at zoom 1
  active = Math.max(0, Math.min(nodes.length - 1, i));
  if (act1 && active === 0 && !arranging) { enterAct1(story.progress); if (instant) pan = {...target}; return; }
  if (inAct1) leaveAct1(); else showPanHint();
  overview = false;
  target = {z: 1, x: -nodes[active].x * U, y: -nodes[active].y * H};
  bound();
  if (instant) pan = {...target};
  updateHud(); wake();
}
function zoomTo(z, cx = W / 2, cy = H / 2) {   // zoom about a screen point, inside the allowed range
  if (inAct1) return;
  const old = target.z;
  target.z = Math.max(ZOOM.min, Math.min(ZOOM.max, z));
  const k = target.z / old;
  target.x = cx - OX + (target.x - cx + OX) * k; target.y = cy + (target.y - cy) * k;
  overview = target.z <= ZOOM.min + .001;
  bound(); updateHud(); wake();
}
const showOverview = () => zoomTo(ZOOM.min);
function dragBy(dx, dy) { if (press?.moved) hidePanHint(); target.x += dx; target.y += dy; bound(); wake(); }
function wheel(dx, dy, ctrl, shift, cx, cy) {
  if (ctrl) zoomTo(target.z * Math.exp(-dy * .002), cx, cy);
  else if (shift) { if (!inAct1) dragBy(-dy, 0); }
  else { if (!inAct1) dragBy(-dx, 0); scroll(dy); }   // scroll pans straight down; trackpads may also pan sideways
}
const WORLD_KEYS = /^(Arrow|Page|Digit)|^(Space|Home|KeyM)$/;
function key(code, shift = false) {
  const steps = {ArrowDown: -90, ArrowUp: 90, Space: H * (shift ? .8 : -.8)};
  if (code in steps) return scroll(-steps[code] * (shift && code !== 'Space' ? 3 : 1));
  if (code === 'ArrowRight' || code === 'PageDown') return focus(active + 1);
  if (code === 'ArrowLeft' || code === 'PageUp') return focus(active - 1);
  if (code === 'KeyM') return overview ? zoomTo(1) : showOverview();
  if (code === 'Home') return focus(active);
  if (/^Digit\d$/.test(code)) return focus(Math.max(0, nodes.findIndex(n => n.n === '0' + code.slice(-1))));   // chapter by number, else Act I
}

// ---- cards: the card's page markup in a shadow root, its scene module on the shared renderer ----
function frameHeight() { return Math.min(H, U / 1.42); }
function sizeFrame(n) {   // same box the iframe had: full width, landscape height, centred
  const h = n.fullscreen ? H : frameHeight(), style = n.frame.style;
  style.height = h + 'px'; style.top = (H - h) / 2 + 'px';
  style.setProperty('--card-vh', h / 100 + 'px'); style.setProperty('--card-vw', U / 100 + 'px');
}
async function mount(n) {
  n.loading = true;
  n.frame = Object.assign(document.createElement('div'), {className: 'frame'});
  n.el.append(n.frame); sizeFrame(n);
  try {
    const {shadow, documentElement, base} = await loadCardDocument(n.frame, n.card, ASSET_VERSION);
    // Cards size themselves from #stage: report its layout size, not its zoomed screen size.
    shadow.querySelectorAll('#stage, #viewport').forEach(el => { el.getBoundingClientRect = function () { const r = Element.prototype.getBoundingClientRect.call(this); return {x: r.x, y: r.y, left: r.left, top: r.top, width: this.offsetWidth, height: this.offsetHeight, right: r.left + this.offsetWidth, bottom: r.top + this.offsetHeight}; }; });
    const host = {
      world: true, embedded: true, root: shadow, documentElement,
      get innerWidth() { return n.frame.offsetWidth; }, get innerHeight() { return n.frame.offsetHeight; },
      body: shadow.querySelector('.card-body'),
      $: sel => shadow.querySelector(sel), $$: sel => shadow.querySelectorAll(sel),
      createRenderer: options => gl.createSurface(options.canvas, options).renderer,
      createGL: canvas => gl.createRawSurface(canvas).gl,
      scroll: n === act1 ? act1Scroll : undefined,
      installMapBridge(adapter) {
        n.adapter = adapter; n.viewKey = n.qualityKey = '';
        adapter.palette?.(PALETTE);
        adapter.command?.({command: 'motion', paused: reducedMotion});
        wake();
        return {state() {}, focus: () => focus(nodes.indexOf(n))};
      },
    };
    const module = await import(new URL(`${n.script || 'scene.js'}?v=${ASSET_VERSION}`, base));
    await module.mount(host);
    n.el.dataset.ready = '';
    // Warm-up: draw once while off screen, so its shaders compile during loading (behind the
    // Act I opening) rather than freezing the first pan that reaches it.
    n.warmUntil = performance.now() + 900; wake();
    if (n === act1) playOpening();
  } catch (error) {
    console.error(`Card ${n.card} could not load`, error);
    n.el.querySelector('.placeholder').textContent = `${n.label} — could not load. Reload the page to try again.`;
  }
  wake();
}
// One card at a time: several heavy cards starting together slow each other down.
// The nearest unloaded card goes first; the rest follow in chapter order in the background.
let mounting = null;
function load(candidates) {
  if (mounting || !candidates.length) return;
  const next = candidates.sort((a, b) => a.d - b.d)[0].n;
  const slow = new Promise(resolve => setTimeout(() => {
    if (next.el.dataset.ready === undefined) console.warn(`Card ${next.card} is slow to load; loading the others meanwhile`);
    resolve();
  }, MOUNT_WATCHDOG));
  mounting = Promise.race([mount(next), slow]).finally(() => { mounting = null; wake(); });
}
const quality = () => overview
  ? {...MAP_PRESET.quality, fps: Math.min(24, MAP_PRESET.quality.fps), pixelRatio: Math.max(.45, MAP_PRESET.quality.pixelRatio * .65), detailFps: 12}
  : MAP_PRESET.quality;

// ---- input: a drag pans the world wherever it starts; clicks and hover reach the card ----
// In arrange mode a drag that starts on a card moves the card, and cards get no input.
let press = null, swallowClick = false;
const nodeAt = target => nodes.find(n => n.el === target?.closest?.('.node'));
addEventListener('pointerdown', e => {
  if (e.button || !viewport.contains(e.target)) return;   // shadow-DOM targets retarget to their card frame
  press = {x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, target: e.composedPath()[0], id: e.pointerId,
    node: arranging ? nodeAt(e.target) : null};
  if (arranging) { e.stopPropagation(); select(press.node); }
}, true);
addEventListener('pointermove', e => {
  if (!press) return;
  if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
    press.moved = dragging = true;
    viewport.classList.add('dragging');
    // Whatever the card started on pointerdown (its own drag, a press) is cancelled.
    if (!arranging) press.target.dispatchEvent(new PointerEvent('pointercancel', {bubbles: true, composed: true, pointerId: press.id}));
  }
  if (press.moved || arranging) e.stopPropagation();
  if (!press.moved) return;
  const dx = e.clientX - press.lastX, dy = e.clientY - press.lastY;
  if (press.node) moveNode(press.node, dx / (U * pan.z), dy / (H * pan.z), 0);
  else { if (!inAct1) dragBy(dx, 0); scroll(-dy); }
  press.lastX = e.clientX; press.lastY = e.clientY;
}, true);
function endPress(e) {
  if (!press) return;
  if (press.moved || arranging) { e.stopPropagation(); swallowClick = true; setTimeout(() => swallowClick = false); }
  press = null; dragging = false; viewport.classList.remove('dragging'); wake();
}
addEventListener('pointerup', endPress, true);
addEventListener('pointercancel', e => { if (e.isTrusted) endPress(e); }, true);
addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
addEventListener('wheel', e => {
  if (!viewport.contains(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  const u = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
  const node = arranging && e.altKey && nodeAt(e.target);
  if (node) { select(node); return moveNode(node, 0, 0, -e.deltaY * u * .0008); }   // Alt+scroll sizes a card
  wheel(e.deltaX * u, e.deltaY * u, e.ctrlKey, e.shiftKey, e.clientX, e.clientY);
}, {passive: false, capture: true});
// The browser's own drag-and-drop (an image or selected text inside a card) would take over
// a pan that starts on a card and show the no-drop cursor; the world pans instead.
for (const type of ['dragstart', 'selectstart']) addEventListener(type, e => {
  const field = e.composedPath()[0]?.closest?.('input,textarea,[contenteditable]');   // typing in a card still works
  if (viewport.contains(e.target) && !field) e.preventDefault();
}, true);
addEventListener('keydown', e => {
  const t = e.composedPath()[0];
  if (t instanceof Element && t.closest('input,select,textarea,button,a')) return;
  if (WORLD_KEYS.test(e.code)) { e.preventDefault(); e.stopPropagation(); key(e.code, e.shiftKey); }
}, true);

// ---- arrange mode: move and size cards, keep them in this browser, copy a chapters.js ----
let selected = null;
const num = v => +(v * 100).toFixed(1);
function select(node) {
  selected = node || null;
  nodes.forEach(n => n.el.classList.toggle('selected', n === selected));
  updateArrange();
}
function moveNode(n, dx, dy, dScale) {
  n.x += dx; n.y += dy; n.size = Math.max(.3, Math.min(2, n.size * Math.exp(dScale)));
  n.transformKey = n.viewKey = '';
  const layout = Object.fromEntries(nodes.map(m => [m.id, {x: num(m.x), y: num(m.y), scale: +m.size.toFixed(2)}]));
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
  drawMinimap(); updateArrange(); wake();
}
function chaptersFile() {   // the current arrangement as a complete chapters.js
  const field = (k, v) => `${k}: ${typeof v === 'string' ? JSON.stringify(v).replace(/^"|"$/g, "'") : v}`;
  const fields = ch => Object.entries(ch).filter(([k]) => !['x', 'y', 'scale'].includes(k)).map(([k, v]) => field(k, v));
  const place = n => [field('x', num(n.x)), field('y', num(n.y)), field('scale', +n.size.toFixed(2))];
  const lines = CHAPTERS.map(ch => `  {${[...fields(ch), ...place(nodes.find(m => m.id === 'ch-' + ch.n))].join(', ')}},`);
  return [
    '// Single source of truth for the exhibition world (arranged in /exhibition/?arrange).',
    '// x / y are world positions in % of a card width / height (one screen high, ASPECT in exhibition.js wide); scale sizes the card.',
    '// card: folder under public/ with the cutout page, or null for a placeholder;',
    '// script: its scene module if not scene.js.',
    '',
    `export const ACT_1 = {${[...fields(ACT_1), ...place(nodes[0])].join(', ')}};`,
    '',
    'export const CHAPTERS = [',
    ...lines,
    '];',
    '',
  ].join('\n');
}
function updateArrange() {
  const info = $('#arrange-info');
  if (info) info.textContent = selected ? `${selected.label} · x ${num(selected.x)} · y ${num(selected.y)} · scale ${selected.size.toFixed(2)}` : 'Drag a card to move it · Alt+scroll on a card to size it';
}
if (arranging) {
  document.body.classList.add('arranging');
  const panel = document.createElement('div');
  panel.className = 'hud hud-arrange';
  panel.innerHTML = '<span id="arrange-info"></span><button id="copy-layout">Copy layout</button><button id="reset-layout">Reset</button>';
  document.body.append(panel);
  $('#copy-layout').onclick = async () => {
    try { await navigator.clipboard.writeText(chaptersFile()); $('#copy-layout').textContent = 'Copied: paste over chapters.js'; }
    catch { prompt('Copy this over chapters.js', chaptersFile()); }
  };
  $('#reset-layout').onclick = () => { try { localStorage.removeItem(LAYOUT_KEY); } catch {} location.reload(); };
  updateArrange();
}
$('#prev').onclick = () => focus(active - 1);
$('#next').onclick = () => focus(active + 1);
$('#overview').onclick = () => overview ? zoomTo(1) : showOverview();
addEventListener('resize', () => {
  W = innerWidth; H = innerHeight; U = Math.round(H * ASPECT); OX = (W - U) / 2;
  world.style.setProperty('--card-w', U + 'px'); drawMinimap();
  nodes.forEach(n => { n.transformKey = n.viewKey = ''; if (n.frame) sizeFrame(n); });
  bound(); wake();
});
document.addEventListener('visibilitychange', () => {
  lastTime = 0;
  nodes.forEach(n => { n.viewKey = ''; if (document.hidden) n.adapter?.viewport?.({visible: false, presence: 0}); });
  wake();
});

// ---- HUD: where you are, and a minimap of the rooms ----
function updateHud() {
  document.body.classList.toggle('in-act1', inAct1);
  const n = nodes[active];
  $('#now-act').textContent = n.act;
  $('#now-title').textContent = n.isAct ? n.title : `${n.n} ${n.title}`;
  $('#overview').setAttribute('aria-pressed', String(overview));
  minimap.querySelectorAll('.room').forEach((r, i) => r.classList.toggle('active', i === active));
}
let mini = null;
function drawMinimap() {
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), pad = .3;
  mini = {x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 1 + pad * 2, h: Math.max(...ys) - Math.min(...ys) + 1 + pad * 2};
  minimap.setAttribute('viewBox', `${mini.x} ${mini.y} ${mini.w} ${mini.h}`);
  const ratio = Math.min(1, U / 1.42 / H);
  minimap.innerHTML = nodes.map((n, i) => `<rect class="room" data-i="${i}" x="${n.x + .5 - n.size * .4}" y="${n.y + .5 - n.size * ratio * .4}" width="${n.size * .8}" height="${n.size * ratio * .8}" rx=".04" vector-effect="non-scaling-stroke"><title>${n.label}</title></rect>`).join('')
    + '<rect class="view" vector-effect="non-scaling-stroke"/>';
  updateHud();
}
minimap.addEventListener('click', e => {
  const room = e.target.closest('.room');
  if (room) return focus(+room.dataset.i);
  const p = minimap.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const u = p.matrixTransform(minimap.getScreenCTM().inverse());   // world units
  if (inAct1) leaveAct1();
  overview = false; target = {z: 1, x: -(u.x - .5) * U, y: -(u.y - .5) * H}; bound(); updateHud(); wake();
});

// How present a card is (cards fold their insets away as this drops): the visible share of
// the card, or of the screen when the card is larger than it, so a centred card is fully
// present at any scale.
function onScreen(r) {
  const visible = Math.max(0, Math.min(W, r.right) - Math.max(0, r.left)) * Math.max(0, Math.min(H, r.bottom) - Math.max(0, r.top));
  return Math.min(1, visible / Math.max(1, Math.min(r.width * r.height, W * H)));
}
// ---- frame loop: eases the camera, places nodes, tells cards what they need, composites ----
function animate(now) {
  raf = 0;
  if (document.hidden) return;
  const dt = lastTime ? Math.min(.05, (now - lastTime) / 1000) : .016; lastTime = now;
  const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * (dragging ? 18 : 7));
  let moving = !!opening;
  if (opening) stepOpening(dt);
  for (const k of ['x', 'y', 'z']) {
    const d = target[k] - pan[k];
    if (Math.abs(d) > (k === 'z' ? .0001 : .1)) { pan[k] += d * ease; moving = true; } else pan[k] = target[k];
  }
  world.style.transform = `translate3d(${pan.x + OX}px,${pan.y}px,0) scale(${pan.z})`;
  const q = quality(), qKey = JSON.stringify(q), waiting = [];
  let nearest = active, best = Infinity;
  for (const [i, n] of nodes.entries()) {
    const t = `translate3d(${n.x * U}px,${n.y * H}px,0) rotate(${n.rotation}deg) scale(${n.size})`;
    if (n.transformKey !== t) { n.el.style.transform = t; n.transformKey = t; }
    const r = screenRect(n, {...pan, x: pan.x + OX}, U, H);
    n.distance = Math.hypot(r.cx - W / 2, r.cy - H / 2);
    if (n.distance < best) { best = n.distance; nearest = i; }
    if (n === act1) {   // Act I has no adapter: tell it directly whether it is on screen
      const shown = r.right > 0 && r.left < W && r.bottom > 0 && r.top < H;
      if (shown !== act1Scroll.visible) { act1Scroll.visible = shown; if (shown) story.onChange?.(); }
    }
    if (!n.card) continue;
    const near = r.right > -W * .3 && r.left < W * 1.3 && r.bottom > -H * .3 && r.top < H * 1.3;
    if (!n.loading) { waiting.push({n, d: near ? n.distance : 1e7 + i}); continue; }   // near first, then chapter order
    if (!n.adapter) continue;
    if (n.qualityKey !== qKey) { n.adapter.layout?.({layout: DEFAULT_LAYOUT, quality: q}); n.qualityKey = qKey; }
    const warming = n.warmUntil > now, local = localCardOffset(n, pan, U, H) /* relative to the screen centre: OX cancels */, visible = warming || (r.right > 0 && r.left < W && r.bottom > 0 && r.top < H);
    if (warming) moving = true;   // keep frames coming until the warm-up ends
    const state = {localPanX: +local.x.toFixed(2), localPanY: +local.y.toFixed(2),
      offsetX: Math.round((r.cx - OX - U * pan.z / 2) / pan.z), offsetY: Math.round((r.cy - H * pan.z / 2) / pan.z),
      presence: +onScreen(r).toFixed(2), visible, dragging, overview, scale: +pan.z.toFixed(2)};
    const key = JSON.stringify(state);
    if (n.viewKey !== key) { n.adapter.viewport?.(state); n.viewKey = key; }
  }
  load(waiting);
  if (!overview && !inAct1 && nearest !== active) { active = nearest; updateHud(); }
  if (mini) {
    const v = minimap.querySelector('.view');
    v.setAttribute('x', (-pan.x - OX) / pan.z / U); v.setAttribute('y', -pan.y / pan.z / H);
    v.setAttribute('width', W / U / pan.z); v.setAttribute('height', 1 / pan.z);
  }
  if (moving || gl.dirty) gl.composite();
  world.classList.add('placed');
  document.body.dataset.state = `${nodes[active].id} ${inAct1 ? 'act1:' + story.progress.toFixed(3) : overview ? 'overview' : 'free'} ${Math.round(pan.x)},${Math.round(pan.y)},${pan.z.toFixed(2)} cards:${nodes.filter(n => n.el.dataset.ready !== undefined).length}`;   // for checks
  if (moving) wake();
}

drawMinimap();
const start = nodes.findIndex(n => '#' + n.id === location.hash);
focus(start > 0 ? start : 0, true);
