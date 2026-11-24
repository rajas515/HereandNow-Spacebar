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
import {movementSound} from './movement-sound.js?v=soft1';
import {typewriterSound} from './typewriter-sound.js?v=soft1';
import {whisperSound} from './whisper-sound.js?v=titlemix3';
import {lighterSound} from './lighter-sound.js?v=titlemix1';
import {ambientSound} from './ambient-sound.js?v=tuning3';
import {whisperLayer} from './will-whispers.js?v=3';

const $ = s => document.querySelector(s);
const world = $('#world'), viewport = $('#viewport'), minimap = $('#minimap');
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
const ZOOM = {min: .55, max: 1.25};   // the only zoom range allowed; Map shows the min
const LAYOUT_KEY = 'exhibition-layout-v1';   // arrange-mode edits, kept in this browser only
const arranging = new URLSearchParams(location.search).has('arrange');
const PALETTE = {print: MAP_PRESET.print, grades: MAP_PRESET.grades};
// Bump when card code changes: the world imports card pages and scripts on demand, and a
// browser could otherwise reuse an old copy of one.
const ASSET_VERSION = '2026-11-25-wherenow5';
const MOUNT_WATCHDOG = 30000;   // ms before a slow card stops holding up the others
const gl = createWorldGL($('#gl'));

// Section intro: only chapters given a `heading` in chapters.js have one (built one card at a
// time). Its anchors are fractions of the card's box: the title's corners (top-left, top-right,
// bottom-right, bottom-left) and the description's top-left, set in ?arrange.
const hasIntro = n => !!n.heading && !!n.card && !n.isAct;
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
  return {...n, titleQuad: saved.titleQuad ?? n.titleQuad, textAt: saved.textAt ?? n.textAt,
    reportsHover: !!n.enter, overScene: false,   // a card with its own enter command reports where its scene is (mapBridge.hover)
    x: (saved.x ?? n.x) / 100, y: (saved.y ?? n.y) / 100, size: saved.scale ?? n.scale ?? stack.scale ?? 1, rotation: n.rotation ?? stack.rotation ?? 0,
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
// ---- sound: scores, whispers and Act I sound cues (see the sound modules beside this file) ----
const typingSound = typewriterSound(new URL('./keyboard-typing.mp3', import.meta.url));
// Loudness matching: the recordings range from -30.8 to -16.4 dB RMS, so each gets a fixed trim
// that brings it to -22 dB RMS (the middle). Measured 2026-11-23 on the parts that play (the
// main loop's first 15 s, the regional scores whole). Re-measure if a file is replaced.
const SCORE_TRIM = {main: 2.75, actTwo: .80, skeletons: 1.84, reflections: .52, prayers: .53, eulogies: .44,
  life: .64,   // In the Life Of: -13.6 dB raw, about -18 dB after its slowing and blur
  karmic: 1.10, auction: .52};
// name: the key its live settings are saved under; label: its name in the Sound settings panel;
// sound: default effect settings (see shared/sound-tuning.js), tuned there and copied back here.
const ambient = ambientSound(
  {name: 'main', label: 'Main score', url: new URL('./ambient-music.mp3', import.meta.url), trim: SCORE_TRIM.main},               // -30.8 dB
  {name: 'act-two', label: 'Act II / Disco score', url: new URL('./act-two-score.mp3', import.meta.url), trim: SCORE_TRIM.actTwo},  // -20.1 dB
  {name: 'skeletons', label: 'Skeletons score', url: new URL('./skeletons-score.mp3', import.meta.url), trim: SCORE_TRIM.skeletons}, // -27.3 dB
  // "Empty Fields", for Closing Statement / Reflections
  {name: 'reflections', label: 'Reflections score (Empty Fields)', url: new URL('./reflections-score.mp3', import.meta.url), trim: SCORE_TRIM.reflections}, // -16.4 dB
  // "Celestial Dance" (first 150 s), for Prayers for the Next Life
  {name: 'prayers', label: 'Prayers score (Celestial Dance)', url: new URL('./prayers-score.mp3', import.meta.url), trim: SCORE_TRIM.prayers}, // -16.5 dB
  // "Cinematic Background Epic" (54 s, looped), for Eulogies
  {name: 'eulogies', label: 'Eulogies score', url: new URL('./eulogies-score.mp3', import.meta.url), trim: SCORE_TRIM.eulogies}, // -14.9 dB
  // "Emergence" (first 150 s), for In the Life Of: slowed to 80% and blurred so the piano chords smear
  {name: 'life', label: 'In the Life Of score (Emergence)', url: new URL('./life-score.mp3', import.meta.url), trim: SCORE_TRIM.life,
    sound: {rate: .8, tone: 1760, reverb: .67, dry: .44}},
  // The Estate Sale: "Luxury" music, layered with its ambience below; the main score drops out there.
  {name: 'auction', label: 'Estate Sale score (Luxury)', url: new URL('./auction-score.mp3', import.meta.url), trim: SCORE_TRIM.auction}, // -16.3 dB
  // "I Remember Clifford" (first 150 s), for Karmic Debts
  {name: 'karmic', label: 'Karmic Debts score (I Remember Clifford)', url: new URL('./karmic-score.mp3', import.meta.url), trim: SCORE_TRIM.karmic}, // -22.8 dB
);
const scoreNodes = ['disco', 'skeletons-in-the-closet', 'closing-statement', 'prayers-for-the-next-life', 'architecture', 'in-the-life-of', 'the-auction', 'karmic-debts'].map(card => nodes.find(node => node.card === card));
// Reflections and Prayers also listen to the cursor: their score's "centre of attention" sits
// partway between the screen centre and the pointer, so moving toward the card brings its music
// in; with the whole card in view at full zoom, only its score plays.
const CURSOR_PULL = {'closing-statement': .4, 'prayers-for-the-next-life': .4, architecture: .4, 'in-the-life-of': .4, 'the-auction': .4, 'karmic-debts': .4};   // architecture = Eulogies
const cursor = {x: .5, y: .5};   // pointer position as a fraction of the screen
// How far a section's sound reaches, in screen sizes from the centre of attention. The Estate Sale,
// Skeletons and Eulogies sit close together, so each zone is kept tight: full within FULL,
// fading to silence by REACH, instead of spreading over a screen and a quarter and muddling.
const SOUND_ZONE = {FULL: .15, REACH: .7};
const nearness = distance => Math.max(0, Math.min(1, (SOUND_ZONE.REACH - distance) / (SOUND_ZONE.REACH - SOUND_ZONE.FULL)));
const willNode = nodes.find(node => node.card === 'will');
const auctionNode = nodes.find(node => node.card === 'the-auction');
// The Estate Sale's room tone (a crowd and an auctioneer), layered under its score, fading with the same zone.
const auctionAmbience = whisperLayer(new URL('./auction-ambience.mp3', import.meta.url), {name: 'auction-ambience', label: 'Estate Sale ambience', level: .9, reverse: false});
const willVoices = whisperLayer(new URL('./will-voices.mp4', import.meta.url), {name: 'will-whispers', label: 'The Will whispers', level: .5});
// The reading of the note ("Dear all, We have gathered here today…"), reversed and blurred like
// The Will but kept low; it starts where the reading begins (about 5.4 s into the recording).
const noteVoices = whisperLayer(new URL('./note-voices.mp4', import.meta.url), {name: 'note-whispers', label: 'Note reading whispers (Act I)', level: .2, start: 5.4, end: 100.5});
const TITLE_APPEARS = .8 * 9 / 5.3;
const TITLE_DISSOLVES = 10.5;
const TITLE_GONE = 14.5;
let scoreStarted = false, titleDucking = 0;
let scoreFade = .35;
function mixScores(dt) {
  if (dt) {
    // Camera easing turns the remaining scroll or drag distance into movement speed.
    const travel = Math.hypot((target.x - pan.x) / W, (target.y - pan.y) / H, target.z - pan.z);
    scoreFade = .35 + Math.min(.40, travel * .65);
  }
  const zoom = Math.max(0, Math.min(1, (pan.z - ZOOM.min) / (1 - ZOOM.min)));
  const weights = scoreNodes.map(node => {
    if (inAct1 || !node) return 0;
    const rect = screenRect(node, {...pan, x: pan.x + OX}, U, H);
    const pull = CURSOR_PULL[node.card] || 0;
    const fx = .5 + (cursor.x - .5) * pull, fy = .5 + (cursor.y - .5) * pull;
    // Whole card in view at full zoom (its chapter in focus): only its score plays.
    // (Its chapter is in focus: centred on screen, give or take a little panning.)
    if (pull && zoom >= .97 && Math.hypot(rect.cx / W - .5, rect.cy / H - .5) < .12) return 1;
    const distance = Math.hypot(rect.cx / W - fx, rect.cy / H - fy);
    const near = nearness(distance);
    // Zoomed out, the score blends with the main one by proximity instead of taking over.
    return near * near * (3 - 2 * near) * (.5 + .5 * zoom) * (pull ? .9 : 1);
  });
  // The Will's reversed whispers sit on top of the music, fading with the same proximity rule.
  if (willNode && !inAct1 && !arranging) {
    const rect = screenRect(willNode, {...pan, x: pan.x + OX}, U, H);
    const fx = .5 + (cursor.x - .5) * .4, fy = .5 + (cursor.y - .5) * .4;
    const near = nearness(Math.hypot(rect.cx / W - fx, rect.cy / H - fy));
    const centred = zoom >= .97 && Math.hypot(rect.cx / W - .5, rect.cy / H - .5) < .12;
    willVoices(centred ? 1 : near * near * (3 - 2 * near) * (.5 + .5 * zoom) * .9);
  } else willVoices(0);
  if (auctionNode && !inAct1 && !arranging) {
    const rect = screenRect(auctionNode, {...pan, x: pan.x + OX}, U, H);
    const fx = .5 + (cursor.x - .5) * .4, fy = .5 + (cursor.y - .5) * .4;
    const near = nearness(Math.hypot(rect.cx / W - fx, rect.cy / H - fy));
    const centred = zoom >= .97 && Math.hypot(rect.cx / W - .5, rect.cy / H - .5) < .12;
    auctionAmbience(centred ? 1 : near * near * (3 - 2 * near) * (.5 + .5 * zoom) * .9);
  } else auctionAmbience(0);
  if (!inAct1 || arranging) noteVoices(0);
  // A chapter in focus with its own score (weight exactly 1): it plays alone, neighbours silent.
  const solo = weights.findIndex((w, i) => w === 1 && CURSOR_PULL[scoreNodes[i]?.card]);
  if (solo >= 0) weights.forEach((_, i) => { if (i !== solo) weights[i] = 0; });
  // Outside Act I the score always plays (Skip intro leaves before Act I could say it started).
  ambient(scoreStarted || (!inAct1 && !arranging), inAct1 ? titleDucking : 0, weights, scoreFade);
  // The whispers belong to the opening question only. Act I stops updating once it is off
  // screen, so silence them here (every frame) whenever the view has left Act I.
  if (!inAct1 || arranging) whispers(-1);
}
function backgroundSound(seconds, titleSeconds) {
  scoreStarted = !arranging && (!inAct1 || seconds >= 9.9);
  const dissolve = Math.max(0, Math.min(1, (titleSeconds - TITLE_DISSOLVES) / (TITLE_GONE - TITLE_DISSOLVES)));
  titleDucking = titleSeconds >= TITLE_APPEARS - .4 ? 1 - dissolve : 0;
  // The note appears once the title has gone: its reading whispers fade in over two seconds.
  const note = Math.max(0, Math.min(1, (titleSeconds - TITLE_GONE) / 2));
  noteVoices(inAct1 && !arranging ? note * note * (3 - 2 * note) : 0);
  mixScores();
}
const whispers = whisperSound(['./whispers-murmullos.mp3', './whispers-ambiance.mp3'].map(path => new URL(path, import.meta.url)));
function openingSound(seconds) { whispers(inAct1 && !arranging ? seconds : -1); }
const titleAudioTiming = {start: TITLE_APPEARS, end: TITLE_GONE, fadeOut: TITLE_GONE - TITLE_DISSOLVES};
const titlePuff = lighterSound(new URL('./title-smoking.mp3?v=2', import.meta.url), {
  ...titleAudioTiming, label: 'Title long drag', level: .52, fadeIn: .075,
});
const titleBreath = lighterSound(new URL('./title-inhale-exhale.mp3', import.meta.url), {
  ...titleAudioTiming, label: 'Title inhale and exhale', level: .30, fadeIn: .13,
});
function titleSound(seconds) {
  const time = inAct1 && !arranging ? seconds : -1;
  titlePuff(time);
  titleBreath(time);
}
// The baked hinges swing from frame 0 through frame 59 at 24 fps.
const door = lighterSound(new URL('./opening-door.mp3?v=2', import.meta.url), {start:0, end:59 / 24, label:'Door opening'});
function doorSound(seconds) { door(inAct1 && !arranging ? seconds : -1); }
function letterSound(characters, revealing) {
  typingSound(characters, inAct1 && !arranging && revealing);
}
// The opening (question, room, title and its hold) plays by itself once Act I has loaded and
// stops just into the curatorial note; from there scrolling drives everything. It plays once:
// scrolling back up stops at the start of the note.
const NOTE_LEAD = 2.68;   // seconds into the note when the opening stops ("Dear all, We have gathered here today to…")
const OPENING_SPEED = 1.25;
const AFTER_NOTE_SPEED = 5;   // the letter's reading pause and dissolve go by quickly when scrolled   // the self-playing opening runs a little faster than the scroll timeline
const act1Scroll = {get progress() { return story.progress; }, set onChange(fn) { story.onChange = fn; }, set: p => setStory(p), letterSound, openingSound, titleSound, doorSound, backgroundSound, timeline: null, visible: true};
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
function leaveAct1() { inAct1 = false; setStory(1); updateHud(); }
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
  if (!t) return leaveAct1(), focus(Math.max(1, nodes.findIndex(n => n.id === BREAKER)));   // Act I still loading: straight to Act II
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
// Scroll breaker: scrolling out of Act I lands on the first chapter (BREAKER) and holds there
// until the wheel has been still for a moment, so one fast flick can't fly past Act II.
const BREAKER = 'ch-03', HOLD_MIN = 900, HOLD_QUIET = 300;
let hold = 0, lastScroll = 0;
function scroll(dy) {   // vertical scroll in screen pixels, positive = down
  const now = performance.now(), gap = now - lastScroll; lastScroll = now;
  if (hold) { if (now - hold < HOLD_MIN || gap < HOLD_QUIET) return; hold = 0; }
  if (opening) return;   // the opening plays by itself
  if (inAct1) {
    const t = act1Scroll.timeline, afterNote = t && story.progress >= t.noteEnd / t.total;
    const length = (act1.length || 16) * H, next = Math.max(noteStart, story.progress + dy * (afterNote && dy > 0 ? AFTER_NOTE_SPEED : 1) / length);
    if (next <= 1) return setStory(next), wake();
    leaveAct1();
    const stop = nodes.findIndex(n => n.id === BREAKER);
    if (stop > 0) { focus(stop); hold = now; return; }
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
  if (inAct1) leaveAct1();
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
function dragBy(dx, dy) {
  if (!gesture && !inAct1) gesture = nodes.map(n => centreDistance(n, target));   // where everything was when the pan began
  target.x += dx; target.y += dy; bound(); wake();
  clearTimeout(settleTimer); if (!press) settleTimer = setTimeout(settle, 180);   // wheel and keys: settle once they stop
}
// ---- magnet: a pan that ends near a chapter it was heading towards glides onto it ----
// Moving away from a chapter never pulls back to it: only one that got closer can catch.
const SNAP = .42;   // card centre within this share of the card's own size from the screen centre
let gesture = null, settleTimer = 0;
function centreDistance(n, p) { const r = screenRect(n, {...p, x: p.x + OX}, U, H); return Math.hypot((r.cx - W / 2) / r.width, (r.cy - H / 2) / r.height); }
function settle() {
  const start = gesture; gesture = null;
  if (!start || inAct1 || arranging || overview || press || Math.abs(target.z - 1) > .1) return;
  let best = -1, bestD = Infinity;
  nodes.forEach((n, i) => { if (n.isAct) return; const d = centreDistance(n, target); if (d < bestD) { bestD = d; best = i; } });
  if (best < 0 || bestD < .003 || bestD > SNAP || bestD > start[best] - .004) return;
  focus(best);
}
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
  if (code === 'KeyM') return openMap();
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
        // hover(over): the pointer is over the card's scene itself (not its backdrop); Enter applies only there.
        return {state() {}, focus: () => focus(nodes.indexOf(n)), hover: over => { n.reportsHover = true; n.overScene = !!over; syncCursor(); }};
      },
    };
    const module = await import(new URL(`${n.script || 'scene.js'}?v=${ASSET_VERSION}`, base));
    await module.mount(host);
    n.el.dataset.ready = '';
    // Warm-up: draw once while off screen, so its shaders compile during loading (behind the
    // Act I opening) rather than freezing the first pan that reaches it.
    n.warmUntil = performance.now() + 900; wake();
    if (n === act1) loaded.then(playOpening);   // the opening starts as the loading screen clears
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
const discoSound = movementSound(new URL('./glitter-chime.mp3?v=2', import.meta.url));
// The cursor steers the reflections and prayers scores' blend (see mixScores), so re-mix as it
// moves; a slow tick also re-mixes once the camera has come to rest (the frame loop sleeps then).
addEventListener('pointermove', e => {
  cursor.x = e.clientX / Math.max(1, innerWidth); cursor.y = e.clientY / Math.max(1, innerHeight);
  if (!inAct1) mixScores();
}, true);
setInterval(() => { if (!inAct1 && !document.hidden) mixScores(); }, 250);
addEventListener('pointermove', e => {
  if (!arranging && !inAct1 && !document.hidden && (e.movementX || e.movementY) && nodeAt(e.target)?.adapter?.hitsDiscoBall?.(e)) discoSound.move();
  else discoSound.stop();
}, true);
viewport.addEventListener('pointerleave', discoSound.stop);
addEventListener('pointercancel', discoSound.stop, true);
addEventListener('pointerdown', e => {
  if (e.button || !viewport.contains(e.target)) return;   // shadow-DOM targets retarget to their card frame
  press = {x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, target: e.composedPath()[0], id: e.pointerId,
    node: arranging ? nodeAt(e.target) : null};
  if (arranging) { e.stopPropagation(); select(press.node); }
}, true);
addEventListener('pointermove', e => {
  if (!press) return;
  if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
    press.moved = dragging = true; document.body.classList.add('panning'); syncCursor();
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
  if (!press.moved && !arranging && overScene() && e.type === 'pointerup' && e.pointerType === 'mouse') {
    e.stopPropagation(); swallowClick = true; setTimeout(() => swallowClick = false);
    press = null; enterSection(); return;
  }
  if (press.moved || arranging) { e.stopPropagation(); swallowClick = true; setTimeout(() => swallowClick = false); }
  const moved = press.moved;
  press = null; dragging = false; viewport.classList.remove('dragging'); document.body.classList.remove('panning'); syncCursor(); wake();
  if (moved) settle();
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
  saveLayout(); drawMinimap(); updateArrange(); wake();
}
function saveLayout() {
  const layout = Object.fromEntries(nodes.map(m => [m.id, {x: num(m.x), y: num(m.y), scale: +m.size.toFixed(2), ...(hasIntro(m) ? {titleQuad: m.titleQuad, textAt: m.textAt} : {})}]));
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch {}
}
const FILE_HEADER = `// Single source of truth for the exhibition world (arranged in /exhibition/?arrange).
// x / y are world positions in % of a card's width / height (a card is one screen high and
// ASPECT screen heights wide, see exhibition.js), so the layout holds on any screen; scale sizes the card.
// card: folder under public/ with the cutout page, or null for a placeholder card (tone shows on it);
// script: its scene module if not scene.js.
// heading (title lines), blurb and enter (the card's own zoom-in command) give a chapter its
// section intro, added one card at a time; titleQuad / textAt anchor its title (four corners)
// and description on the card, set in ?arrange.
// To rearrange visually, open /exhibition/?arrange, drag and Alt+scroll the cards, then
// "Copy layout" and paste the result over this file.
`;
function chaptersFile() {   // the current arrangement as a complete chapters.js
  const quote = v => typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : Array.isArray(v) ? `[${v.map(quote).join(', ')}]`
    : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${k}: ${quote(x)}`).join(', ')}}` : v;
  const field = (k, v) => `${k}: ${quote(v)}`;
  const fields = ch => Object.entries(ch).filter(([k]) => !['x', 'y', 'scale', 'titleQuad', 'textAt'].includes(k)).map(([k, v]) => field(k, v));
  const anchors = n => hasIntro(n) && n.titleQuad ? [field('titleQuad', n.titleQuad), field('textAt', n.textAt)] : [];
  const place = n => [field('x', num(n.x)), field('y', num(n.y)), field('scale', +n.size.toFixed(2)), ...anchors(n)];
  const lines = CHAPTERS.map(ch => `  {${[...fields(ch), ...place(nodes.find(m => m.id === 'ch-' + ch.n))].join(', ')}},`);
  return [
    ...FILE_HEADER.trimEnd().split('\n'),
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
  if (info) info.textContent = selected ? `${selected.label} · x ${num(selected.x)} · y ${num(selected.y)} · scale ${selected.size.toFixed(2)} · drag the pink points to fit the title` : 'Drag a card to move it · Alt+scroll on a card to size it · click a card to place its title';
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
$('#map-open').onclick = () => openMap();
addEventListener('resize', () => {
  W = innerWidth; H = innerHeight; U = Math.round(H * ASPECT); OX = (W - U) / 2;
  world.style.setProperty('--card-w', U + 'px'); drawMinimap(); if (mapOpen) layoutMap();
  nodes.forEach(n => { n.transformKey = n.viewKey = ''; if (n.frame) sizeFrame(n); });
  bound(); wake();
});
document.addEventListener('visibilitychange', () => {
  lastTime = 0;
  nodes.forEach(n => { n.viewKey = ''; if (document.hidden) n.adapter?.viewport?.({visible: false, presence: 0}); });
  wake();
});

// ---- HUD: where you are, a minimap of the rooms, and the map view (herenowtest-style) ----
const shortTitle = n => n.isAct ? n.act.split('·').pop().trim() : n.title;
function updateHud() {
  document.body.classList.toggle('in-act1', inAct1);
  const n = nodes[active];
  $('#now-title').textContent = `${n.act}: ${n.isAct ? n.title : `${n.n} ${n.title}`}`;   // read out by screen readers only
  minimap.querySelectorAll('.room').forEach((r, i) => r.classList.toggle('active', i === active));
}
// Minimap: every card drawn to its real shape (ASPECT wide, one high) and place; the dashed
// box is the screen. Click a room to go there.
let mini = null;
const roomBox = n => ({x: n.x * ASPECT + ASPECT * (1 - n.size) / 2, y: n.y + (1 - n.size) / 2, w: n.size * ASPECT, h: n.size});
function drawMinimap() {
  const boxes = nodes.map(roomBox), pad = .4;
  const x0 = Math.min(...boxes.map(b => b.x)) - pad, y0 = Math.min(...boxes.map(b => b.y)) - pad;
  mini = {x: x0, y: y0, w: Math.max(...boxes.map(b => b.x + b.w)) + pad - x0, h: Math.max(...boxes.map(b => b.y + b.h)) + pad - y0};
  minimap.setAttribute('viewBox', `${mini.x} ${mini.y} ${mini.w} ${mini.h}`);
  minimap.innerHTML = boxes.map((b, i) => `<rect class="room" data-i="${i}" x="${b.x + .06}" y="${b.y + .03}" width="${b.w - .12}" height="${b.h - .06}" vector-effect="non-scaling-stroke"><title>${nodes[i].label}</title></rect>`).join('')
    + '<rect class="view" vector-effect="non-scaling-stroke"/>';
  updateHud();
}
minimap.addEventListener('click', e => {
  const room = e.target.closest('.room');
  if (room) return focus(+room.dataset.i);
  const p = minimap.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const u = p.matrixTransform(minimap.getScreenCTM().inverse());   // minimap units
  if (inAct1) leaveAct1();
  overview = false; target = {z: 1, x: -(u.x / ASPECT - .5) * U, y: -(u.y - .5) * H}; bound(); updateHud(); wake();
});

// Map view: an index of every section, placed as they sit in the world; the current one is
// underlined. Pick one to go there.
const mapView = $('#map-view'), mapField = mapView.querySelector('.map-field');
let mapOpen = false;
const mapItems = nodes.map((n, i) => {
  const a = document.createElement('a');
  a.className = 'map-item'; a.href = '#' + n.id;
  a.innerHTML = `<strong>${shortTitle(n)}</strong>`;
  // Each name wobbles to its own rhythm, like the boil in the riso prints.
  a.style.setProperty('--wobble-delay', `${-(i * 1.37) % 5}s`); a.style.setProperty('--wobble-time', `${4.2 + (i * .61) % 2.2}s`);
  a.onclick = e => { e.preventDefault(); closeMap(); focus(i); };
  mapField.append(a);
  return a;
});
function layoutMap() {
  const fw = mapField.clientWidth, fh = mapField.clientHeight, centres = nodes.map(n => ({x: n.x * ASPECT + ASPECT / 2, y: n.y + .5}));
  const x0 = Math.min(...centres.map(c => c.x)), x1 = Math.max(...centres.map(c => c.x)), y0 = Math.min(...centres.map(c => c.y)), y1 = Math.max(...centres.map(c => c.y));
  const itemW = mapItems[0].offsetWidth, itemH = 56;
  const pts = centres.map((c, i) => {
    const [ox, oy] = nodes[i].mapOffset || [0, 0];   // a map-only nudge from chapters.js
    return {x: ((c.x - x0) / (x1 - x0 || 1) + ox) * (fw - itemW), y: ((c.y - y0) / (y1 - y0 || 1) + oy) * (fh - itemH)};
  });
  mapItems.forEach((a, i) => {
    a.style.transform = `translate(${pts[i].x}px,${pts[i].y}px)`;
    a.classList.toggle('current', i === active);
  });
}
function openMap() {
  if (mapOpen) return closeMap();
  mapOpen = true; mapView.hidden = false; document.body.classList.add('map-open');
  layoutMap();
  requestAnimationFrame(() => mapView.classList.add('shown'));
  mapItems[active].focus({preventScroll: true});
}
function closeMap() {
  if (!mapOpen) return;
  mapOpen = false; mapView.classList.remove('shown'); document.body.classList.remove('map-open');
  setTimeout(() => { if (!mapOpen) mapView.hidden = true; }, 350);
  viewport.focus({preventScroll: true});
}
$('#map-close').onclick = closeMap;
addEventListener('keydown', e => {
  if (!mapOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMap(); }   // M toggles through key()
}, true);

// ---- section intro: a settled chapter shows its title, a line about it and Enter ----
// Enter steps into the card (its own zoom command from chapters.js `enter`, else the world
// zooms in on it) and the intro steps aside until the visitor moves on.
let sectionShown = null, introNode = null;   // introNode: the card the intro last belonged to
// The intro is part of the card: it shows whenever the card is mostly in view (and moves with
// it, since it is anchored to it), until the visitor enters or the card leaves the screen.
const sectionReady = n => hasIntro(n) && !n.entered && !inAct1 && !overview && !arranging && onScreen(cardRect(n)) > .55;
function updateSection(n) {
  if (n.entered === 'zoom' && target.z <= 1.001) n.entered = false;   // zoomed back out: offer it again
  const show = arranging ? (selected && hasIntro(selected) ? selected : null) : sectionReady(n) ? n : null;
  if (show) introNode = show;
  if (introNode) placeIntro(introNode);   // follows its card always, also while fading out
  if (show === sectionShown) return;
  if (show) {
    $('#sec-title').innerHTML = (show.heading || [show.title]).map(line => `<span>${line}</span>`).join('');
    $('#sec-text').textContent = show.blurb || '';
  }
  sectionShown = show;
  document.body.classList.toggle('show-section', !!show);
  syncCursor();
  if (show) { introKey = ''; placeIntro(show); }
}
// The title is drawn in perspective between its four anchors (a CSS projective transform
// from its own box to the quad); the description sits at its anchor. Both follow the card.
const secTitle = $('#sec-title'), secText = $('#sec-text'), handles = [...document.querySelectorAll('.intro-handle')];
const cardRect = n => screenRect(n, {...pan, x: pan.x + OX}, U, H);
const at = (r, [fx, fy]) => [r.left + fx * r.width, r.top + fy * r.height];
function quadMatrix(w, h, q) {   // maps (0,0) (w,0) (w,h) (0,h) onto q
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9, g = (sx * dy2 - dx2 * sy) / den, k = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${x0},${y0},0,1)`;
}
let introKey = '';
function placeIntro(n) {
  const r = cardRect(n), quad = n.titleQuad.map(p => at(r, p)), text = at(r, n.textAt);
  const key = JSON.stringify([quad, text, pan.z, secTitle.textContent]);
  if (key === introKey) return; introKey = key;
  secTitle.style.transform = quadMatrix(secTitle.offsetWidth || 1, secTitle.offsetHeight || 1, quad);
  secText.style.left = text[0] + 'px'; secText.style.top = text[1] + 'px'; secText.style.transform = `scale(${pan.z})`;
  [...quad, text].forEach(([x, y], i) => { handles[i].style.left = x + 'px'; handles[i].style.top = y + 'px'; });   // shown as marks, dragged in ?arrange
}
document.fonts?.ready.then(() => { introKey = ''; if (sectionShown) placeIntro(sectionShown); });
// Arrange mode: drag the handles onto the wall's corners (and where the description goes).
handles.forEach((h, i) => h.addEventListener('pointerdown', e => {
  const n = sectionShown;
  if (!n || !arranging) return;
  e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId);
  const move = ev => {
    const r = cardRect(n), p = [+((ev.clientX - r.left) / r.width).toFixed(4), +((ev.clientY - r.top) / r.height).toFixed(4)];
    if (i < 4) n.titleQuad = n.titleQuad.map((q, j) => j === i ? p : q); else n.textAt = p;
    introKey = ''; placeIntro(n); saveLayout();
  };
  h.addEventListener('pointermove', move);
  h.addEventListener('pointerup', () => h.removeEventListener('pointermove', move), {once: true});
}));
function leaveSection(n) {   // moving on resets a chapter that was entered
  if (n.entered && n.enter) n.adapter?.command?.({command: 'wide'});
  n.entered = false;
}
function enterSection() {
  const n = sectionShown;
  if (!n) return;
  if (n.distance > 2) focus(nodes.indexOf(n));
  if (n.enter && n.adapter) { n.entered = true; n.adapter.command?.({command: n.enter}); }
  else { n.entered = 'zoom'; zoomTo(ZOOM.max, W / 2, H / 2); }
  updateSection(n); wake();
}
$('#sec-enter').onclick = enterSection;
// With a mouse the Enter label is the cursor: it follows the pointer over the world, and a
// click (not a drag) anywhere there enters the chapter.
const sectionStyle = $('.hud-section').style, cursorAim = {x: -200, y: -200}, cursorAt = {x: -200, y: -200};
let cursorRaf = 0, cursorTime = 0;
function trailCursor(now) {
  const dt = cursorTime ? Math.min(.05, (now - cursorTime) / 1000) : .016; cursorTime = now;
  const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 13);
  cursorAt.x += (cursorAim.x - cursorAt.x) * k; cursorAt.y += (cursorAim.y - cursorAt.y) * k;
  sectionStyle.setProperty('--cursor-x', cursorAt.x.toFixed(1) + 'px'); sectionStyle.setProperty('--cursor-y', cursorAt.y.toFixed(1) + 'px');
  cursorRaf = Math.hypot(cursorAim.x - cursorAt.x, cursorAim.y - cursorAt.y) > .3 ? requestAnimationFrame(trailCursor) : (cursorTime = 0);
}
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const entering = !document.body.classList.contains('cursor-in') && viewport.contains(e.target);
  cursorAim.x = e.clientX; cursorAim.y = e.clientY;
  if (entering) { cursorAt.x = e.clientX; cursorAt.y = e.clientY; }   // appear under the pointer, then trail it
  document.body.classList.toggle('cursor-in', viewport.contains(e.target));
  syncCursor();
  if (!cursorRaf) cursorRaf = requestAnimationFrame(trailCursor);
}, {passive: true});
document.documentElement.addEventListener('pointerleave', () => { document.body.classList.remove('cursor-in'); syncCursor(); });
// Enter shows (and a click enters) only over the chapter's scene; its backdrop and the paper
// around it are for panning. A card that does not report hover counts as all scene.
const overScene = () => !!sectionShown && !dragging && document.body.classList.contains('cursor-in') && (!sectionShown.reportsHover || sectionShown.overScene);
let cursorFrame = null;
function syncCursor() {
  const on = overScene();
  document.body.classList.toggle('over-scene', on);
  const frame = on ? sectionShown.frame : null;
  if (frame !== cursorFrame) { cursorFrame?.classList.remove('no-cursor'); frame?.classList.add('no-cursor'); cursorFrame = frame; }
}

// ---- guides: arrows on the edge of the screen pointing to nearby chapters off screen ----
// Each points from the screen centre towards the chapter's centre, sits where that line meets
// the screen's edge, and grows stronger the closer the chapter is. Click one to go there.
const GUIDE_RANGE = 2.4, GUIDE_MARGIN = 34;   // screens away it still shows; px from the edge
const guideLayer = $('#guides');
const guides = nodes.map((n, i) => {
  if (n.isAct) return null;
  const el = document.createElement('button');
  el.className = 'guide'; el.type = 'button'; el.setAttribute('aria-label', `Go to ${n.label}`); el.title = n.title;
  el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8"/></svg>';
  el.onclick = () => focus(i);
  guideLayer.append(el);
  return el;
});
function updateGuides() {
  const off = inAct1 || overview || arranging || mapOpen;
  nodes.forEach((n, i) => {
    const el = guides[i];
    if (!el) return;
    const r = cardRect(n), dx = r.cx - W / 2, dy = r.cy - H / 2, far = Math.hypot(dx / W, dy / H);
    const show = !off && onScreen(r) < .2 && far < GUIDE_RANGE;
    el.classList.toggle('on', show);
    if (!show) return;
    const hw = W / 2 - GUIDE_MARGIN, hh = H / 2 - GUIDE_MARGIN, k = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
    el.style.transform = `translate(${W / 2 + dx * k}px,${H / 2 + dy * k}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
    el.style.setProperty('--near', Math.max(.35, 1 - far / GUIDE_RANGE).toFixed(2));
  });
}

// ---- loading screen: fills while the first card (Act I, or the chapter linked to) loads ----
// Downloads give no single progress figure, so the bar creeps towards 90% while waiting and
// completes when the card is ready; then the screen fades and `loaded` resolves.
const loader = $('#loader'), loaderFill = loader?.querySelector('.loader-fill');
let loaderShown = 0;
const loaded = new Promise(resolve => {
  if (!loader) return resolve();
  let first = null; const started = performance.now();
  const step = now => {
    first ||= nodes[active];   // decided on the first frame, after the page has jumped to a linked chapter
    const ready = first.el.dataset.ready !== undefined || !first.card || now - started > MOUNT_WATCHDOG;
    const aim = ready ? 1 : .9 * (1 - Math.exp(-(now - started) / 4000));
    loaderShown = ready ? 1 : Math.max(loaderShown, aim);
    loaderFill.style.width = (loaderShown * 100).toFixed(1) + '%';
    loader.setAttribute('aria-valuenow', Math.round(loaderShown * 100));
    if (!ready) return requestAnimationFrame(step);
    setTimeout(() => { loader.classList.add('done'); setTimeout(resolve, 250); setTimeout(() => loader.remove(), 700); }, 300);
  };
  requestAnimationFrame(step);
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
  mixScores(dt);
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
  if (!overview && !inAct1 && nearest !== active) { leaveSection(nodes[active]); active = nearest; updateHud(); }
  updateSection(nodes[active]);
  updateGuides();
  if (mini) {
    const v = minimap.querySelector('.view');
    v.setAttribute('x', (-pan.x - OX) / pan.z / U * ASPECT); v.setAttribute('y', -pan.y / pan.z / H);
    v.setAttribute('width', W / U / pan.z * ASPECT); v.setAttribute('height', 1 / pan.z);
  }
  if (moving || gl.dirty) gl.composite();
  world.classList.add('placed');
  document.body.dataset.state = `${nodes[active].id} ${inAct1 ? 'act1:' + story.progress.toFixed(3) : overview ? 'overview' : 'free'} ${Math.round(pan.x)},${Math.round(pan.y)},${pan.z.toFixed(2)} cards:${nodes.filter(n => n.el.dataset.ready !== undefined).length}`;   // for checks
  if (moving) wake();
}

drawMinimap();
const start = nodes.findIndex(n => '#' + n.id === location.hash);
focus(start > 0 ? start : 0, true);
