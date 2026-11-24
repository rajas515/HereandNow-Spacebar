// Live sound settings for the background tracks (scores and whisper layers, not interaction
// sounds). Each track gets the same effect chain and a row of sliders in a "Sound settings"
// panel under the volume control. Changes apply at once and are kept in this browser; "Copy
// settings" puts them on the clipboard so they can be written into the code as new defaults.
//
// Chain per track: input → low cut (high-pass) → distortion → tone (low-pass) → dry ─┬→ output
//                                                                └→ reverb → wet ─┘
// Speed/pitch is the playback rate of the track's player (set by the track's own code).

const STORE_KEY = 'sound-tuning-v1';
export const PARAMS = {
  volume: {label: 'Volume', min: 0, max: 3, step: .01, unit: '×'},
  rate:   {label: 'Speed / pitch', min: .5, max: 1.5, step: .01, unit: '×'},
  tone:   {label: 'Tone (high cut)', min: 300, max: 20000, step: 1, unit: 'Hz', log: true},
  lowCut: {label: 'Low cut', min: 20, max: 1000, step: 1, unit: 'Hz', log: true},
  reverb: {label: 'Reverb', min: 0, max: 1, step: .01, unit: ''},
  dry:    {label: 'Dry (direct)', min: 0, max: 1, step: .01, unit: ''},
  drive:  {label: 'Distortion', min: 0, max: 1, step: .01, unit: ''},
};
export const FLAT = {volume: 1, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0};

// The tuned settings, made in the panel and copied back here (2026-11-24). They override each
// track's own code defaults; a visitor's own changes in the panel still go on top.
const TUNED = {
  'main': {volume: .73, rate: .98, tone: 20000, lowCut: 37, reverb: .16, dry: .82, drive: 0},
  'act-two': {volume: 1, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'skeletons': {volume: .69, rate: 1.19, tone: 2290, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'reflections': {volume: 1, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'prayers': {volume: 1, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'eulogies': {volume: .28, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'life': {volume: 1, rate: .8, tone: 1760, lowCut: 20, reverb: .67, dry: .44, drive: 0},
  'auction': {volume: .08, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'karmic': {volume: 1, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'auction-ambience': {volume: 1, rate: 1, tone: 20000, lowCut: 20, reverb: 0, dry: 1, drive: 0},
  'will-whispers': {volume: .52, rate: 1.25, tone: 1500, lowCut: 200, reverb: .97, dry: .45, drive: .16},
  'note-whispers': {volume: 2.41, rate: .92, tone: 1500, lowCut: 200, reverb: .8, dry: .54, drive: 0},
};

let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch {}
const tracks = new Map();   // name -> {label, defaults, values, listeners, level}
function persist() {
  const out = {};
  for (const [name, t] of tracks) {
    const changed = Object.fromEntries(Object.entries(t.values).filter(([k, v]) => v !== t.defaults[k]));
    if (Object.keys(changed).length) out[name] = changed;
  }
  saved = out;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(out)); } catch {}
}

// Register a track; returns its live values and a way to hear about changes.
export function tunableTrack(name, label, defaults) {
  const base = {...FLAT, ...defaults, ...(TUNED[name] || {})};
  const values = {...base, ...(saved[name] || {})};
  const track = {label, defaults: base, values, listeners: new Set(), level: 0};
  tracks.set(name, track);
  queuePanel();
  return {
    values,
    onChange(fn) { track.listeners.add(fn); },
    // How present the track is right now (0 = silent, 1 = full), for the panel's Now playing list.
    playing(level) { track.level = level; },
  };
}
function set(name, key, value) {
  const t = tracks.get(name);
  t.values[key] = value;
  persist();
  for (const fn of t.listeners) fn(t.values);
}
function reset(name) {
  const t = tracks.get(name);
  Object.assign(t.values, t.defaults);
  persist();
  for (const fn of t.listeners) fn(t.values);
}

// The effect chain. set(values) can be called any time; it glides to the new settings.
let impulseCache = new WeakMap();
function impulse(context) {
  let buffer = impulseCache.get(context);
  if (buffer) return buffer;
  const length = Math.floor(context.sampleRate * 3);
  buffer = context.createBuffer(2, length, context.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8) * Math.min(1, i / (context.sampleRate * .04));
  }
  impulseCache.set(context, buffer);
  return buffer;
}
export function effectChain(context, output, values) {
  const lowCut = context.createBiquadFilter(), tone = context.createBiquadFilter(), toneB = context.createBiquadFilter();
  lowCut.type = 'highpass'; lowCut.Q.value = .4;
  tone.type = toneB.type = 'lowpass'; tone.Q.value = toneB.Q.value = .4;   // two stages: a gentle but deep roll-off
  const dry = context.createGain(), wet = context.createGain();
  // Distortion: a soft-clipping wave shaper, with make-up gain so turning it up adds grit, not volume.
  const shaper = context.createWaveShaper(), makeup = context.createGain();
  shaper.oversample = '2x';
  let reverb = null, drive = -1;
  function shape(amount) {
    if (amount === drive) return;
    drive = amount;
    if (amount <= 0) { shaper.curve = null; makeup.gain.value = 1; return; }
    const k = amount * 40, n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    shaper.curve = curve;
    makeup.gain.value = 1 / (1 + amount * 1.6);
  }
  lowCut.connect(shaper).connect(makeup).connect(tone).connect(toneB);
  toneB.connect(dry).connect(output);
  function apply(v, glide = .08) {
    const now = context.currentTime;
    lowCut.frequency.setTargetAtTime(v.lowCut, now, glide);
    tone.frequency.setTargetAtTime(v.tone, now, glide);
    toneB.frequency.setTargetAtTime(v.tone, now, glide);
    dry.gain.setTargetAtTime(v.dry, now, glide);
    wet.gain.setTargetAtTime(v.reverb, now, glide);
    shape(v.drive || 0);
    if (v.reverb > 0 && !reverb) {   // build the reverb only when a track uses it
      reverb = context.createConvolver();
      reverb.buffer = impulse(context);
      toneB.connect(reverb).connect(wet).connect(output);
    }
  }
  wet.gain.value = 0;
  lowCut.frequency.value = values.lowCut; tone.frequency.value = toneB.frequency.value = values.tone; dry.gain.value = values.dry;
  apply(values, .01);
  return {input: lowCut, set: apply};
}

// ---- the panel ----
let panelQueued = false;
function queuePanel() {
  if (panelQueued || typeof document === 'undefined' || window.top !== window) return;
  if (!new URLSearchParams(location.search).has('sound')) return;   // a tuning tool: open the page with ?sound to use it
  panelQueued = true;
  const go = () => setTimeout(buildPanel, 0);
  if (document.body) go(); else addEventListener('DOMContentLoaded', go, {once: true});
}
const pink = '#ff9ccf', line = '#7b83d8', ink = '#1a1d4aeb';
function fmt(p, v) { return p.unit === 'Hz' ? (v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz') : p.unit === '×' ? v.toFixed(2) + '×' : v.toFixed(2); }
function toSlider(p, v) { return p.log ? Math.log(v / p.min) / Math.log(p.max / p.min) * 1000 : v; }
function fromSlider(p, s) { return p.log ? Math.round(p.min * Math.pow(p.max / p.min, s / 1000)) : +s; }
function buildPanel() {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'Sound settings';
  toggle.setAttribute('aria-expanded', 'false');
  const top = document.getElementById('viewport') ? 66 : null;
  toggle.style.cssText = `position:fixed;${top ? `right:22px;top:${top}px` : 'left:22px;bottom:128px'};z-index:21;background:${ink};color:#fff;border:1.5px solid #fff;border-radius:0;padding:9px 14px;cursor:pointer;font:800 11px Mulish,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;`;
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Sound settings');
  panel.hidden = true;
  panel.style.cssText = `position:fixed;${top ? `right:22px;top:${top + 40}px` : 'left:22px;bottom:170px'};z-index:21;width:min(340px,calc(100vw - 44px));max-height:calc(100vh - ${top ? top + 62 : 200}px);overflow:auto;padding:12px 14px;background:${ink};border:1px solid ${line};border-radius:0;color:#e5dce9;font:12px Arial,sans-serif`;
  for (const type of ['pointerdown', 'wheel', 'keydown', 'click']) { panel.addEventListener(type, e => e.stopPropagation()); toggle.addEventListener(type, e => e.stopPropagation()); }
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) render(); });

  function render() {
    panel.textContent = '';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
    const title = document.createElement('strong');
    title.textContent = 'Background tracks';
    title.style.cssText = `flex:1;color:${pink};font:15px Georgia,serif`;
    const copy = button('Copy settings', () => {
      const all = Object.fromEntries([...tracks].map(([n, t]) => [n, t.values]));
      navigator.clipboard?.writeText(JSON.stringify(all, null, 2)).then(() => { copy.textContent = 'Copied'; setTimeout(() => copy.textContent = 'Copy settings', 1400); }).catch(() => {});
    });
    const resetAll = button('Reset all', () => { for (const n of tracks.keys()) reset(n); render(); });
    head.append(title, copy, resetAll);
    panel.append(head);
    // Now playing: the tracks you can hear for what is on screen, loudest first, each with a
    // level bar and a button that opens its sliders below. Refreshed while the panel is open.
    const now = document.createElement('div');
    now.style.cssText = `margin:0 0 8px;padding:8px 10px;border:1px solid ${line}88;border-radius:0`;
    const nowTitle = document.createElement('div');
    nowTitle.textContent = 'Now playing';
    nowTitle.style.cssText = `color:${pink};font:11px Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px`;
    const nowList = document.createElement('div');
    now.append(nowTitle, nowList);
    panel.append(now);
    const boxes = new Map();
    for (const [name, t] of tracks) {
      const box = document.createElement('details');
      box.style.cssText = `border-top:1px solid ${line}55;padding:6px 0`;
      const sum = document.createElement('summary');
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:7px;height:7px;border-radius:0;margin:0 7px 1px 2px;background:${pink};opacity:.15`;
      sum.append(dot, t.label);
      sum.style.cssText = 'cursor:pointer;padding:4px 0;color:#ffe0ef';
      box.append(sum);
      boxes.set(name, {box, dot});
      for (const [key, p] of Object.entries(PARAMS)) {
        const row = document.createElement('label');
        row.style.cssText = 'display:grid;grid-template-columns:96px 1fr 64px;gap:8px;align-items:center;margin:4px 0';
        const name_ = document.createElement('span'); name_.textContent = p.label;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = p.log ? 0 : p.min; input.max = p.log ? 1000 : p.max; input.step = p.log ? 1 : p.step;
        input.value = toSlider(p, t.values[key]);
        input.style.cssText = `width:100%;accent-color:${pink}`;
        const out = document.createElement('output'); out.textContent = fmt(p, t.values[key]); out.style.cssText = 'text-align:right;font-variant-numeric:tabular-nums';
        input.addEventListener('input', () => { const v = fromSlider(p, input.value); out.textContent = fmt(p, v); set(name, key, v); });
        row.append(name_, input, out);
        box.append(row);
      }
      box.append(button('Reset this track', () => { reset(name); render(); }));
      panel.append(box);
    }
    let shown = '';
    function refresh() {
      const playing = [...tracks].filter(([, t]) => t.level > .02).sort((a, b) => b[1].level - a[1].level);
      for (const [name, t] of tracks) boxes.get(name).dot.style.opacity = t.level > .02 ? String(.35 + .65 * Math.min(1, t.level)) : '.15';
      const key = playing.map(([n, t]) => n + Math.round(t.level * 20)).join();
      if (key === shown) return;   // rebuild only when the list or a level step changes
      shown = key;
      nowList.textContent = '';
      if (!playing.length) { nowList.textContent = 'Nothing yet: click the page to start the sound.'; nowList.style.color = '#b9b3d6'; return; }
      nowList.style.color = '';
      for (const [name, t] of playing) {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1fr 70px auto;gap:8px;align-items:center;margin:3px 0';
        const label = document.createElement('span'); label.textContent = t.label;
        const bar = document.createElement('span');
        bar.style.cssText = `height:6px;border-radius:0;background:linear-gradient(90deg,${pink} ${Math.round(Math.min(1, t.level) * 100)}%,${line}44 0)`;
        const adjust = button('Adjust', () => { const b = boxes.get(name).box; b.open = true; b.scrollIntoView({block: 'nearest', behavior: 'smooth'}); });
        row.append(label, bar, adjust);
        nowList.append(row);
      }
    }
    refresh();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (panel.hidden) clearInterval(refreshTimer); else refresh(); }, 400);
  }
  let refreshTimer = 0;
  function button(text, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.style.cssText = `background:none;color:${pink};border:1px solid ${line};border-radius:0;padding:4px 9px;cursor:pointer;font:11px Arial,sans-serif`;
    b.addEventListener('click', onClick);
    return b;
  }
  document.body.append(toggle, panel);
}
