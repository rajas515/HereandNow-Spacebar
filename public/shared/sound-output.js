// One overall volume for every sound on the site. Each sound keeps its own level (so the
// balance between them stays as tuned) and connects here instead of to context.destination.
// The volume multiplies everything together; a limiter after it catches peaks so louder never
// clips. Visitors set it with the small volume control this module adds to the page (top right);
// their choice is remembered in this browser.
export const MASTER = 2;      // the default, the middle of the slider (≈ +6 dB over each sound's own level)
export const MAX_VOLUME = 4;  // the slider's top (≈ +6 dB more than the default)
const VOLUME_KEY = 'site-volume-v1';

let volume = MASTER, muted = false;
try {
  const saved = JSON.parse(localStorage.getItem(VOLUME_KEY));
  if (saved && Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(MAX_VOLUME, saved.volume));
  if (saved) muted = !!saved.muted;
} catch {}
const level = () => muted ? 0 : volume;

const outputs = new Map();   // context -> gain node
export function soundOutput(context) {
  let node = outputs.get(context);
  if (node) return node;
  node = context.createGain();
  node.gain.value = level();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = .003;
  limiter.release.value = .12;
  node.connect(limiter).connect(context.destination);
  outputs.set(context, node);
  addControl();
  return node;
}

function apply() {
  for (const [context, node] of outputs) node.gain.setTargetAtTime(level(), context.currentTime, .03);
  try { localStorage.setItem(VOLUME_KEY, JSON.stringify({volume, muted})); } catch {}
  render?.();
}

// ---- the control: a speaker button (mute) and a slider, in the site's "Enable sound" style ----
let render = null;
function addControl() {
  if (render || typeof document === 'undefined' || !document.body) return;
  if (window.top !== window) return;   // a card framed inside /map/: no control per frame (it still follows the saved volume)
  const box = document.createElement('div');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Volume');
  // Exhibition: top right, under its header. Standalone card pages keep their right side for the
  // Tune panel, so there it sits bottom left, above the page caption.
  const where = document.getElementById('viewport') ? 'right:22px;top:84px' : 'left:22px;bottom:84px';
  box.style.cssText = 'position:fixed;' + where + ';z-index:21;display:flex;align-items:center;gap:8px;'
    + 'padding:6px 12px 6px 8px;background:#1a1d4aeb;border:1px solid #7b83d8;border-radius:16px;color:#ff9ccf;'
    + 'font:11px Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase';
  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText = 'display:grid;place-items:center;width:24px;height:24px;padding:0;background:none;border:0;color:inherit;cursor:pointer';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = 0; slider.max = MAX_VOLUME; slider.step = .1;
  slider.setAttribute('aria-label', 'Volume');
  slider.style.cssText = 'width:96px;accent-color:#ff9ccf;cursor:pointer';
  const label = document.createElement('span');
  label.style.cssText = 'min-width:44px;text-align:right';
  box.append(button, slider, label);
  // Keep pointer and key events on the control from reaching the page (no panning or scrolling).
  for (const type of ['pointerdown', 'wheel', 'keydown', 'click']) box.addEventListener(type, e => e.stopPropagation());
  slider.addEventListener('input', () => { volume = +slider.value; muted = false; apply(); });
  button.addEventListener('click', () => { muted = !muted; apply(); });
  render = () => {
    const v = level();
    slider.value = volume;
    label.textContent = muted ? 'Muted' : v === 0 ? 'Off' : v < MASTER - .05 ? 'Low' : v > MASTER + .05 ? 'Loud' : 'Medium';
    button.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    const waves = v === 0 ? '<path d="M15 9l5 6M20 9l-5 6"/>'
      : '<path d="M15.5 9.5a4 4 0 0 1 0 5"/>' + (v > MASTER * .6 ? '<path d="M18 7a7.5 7.5 0 0 1 0 10"/>' : '');
    button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h3l5-4v12l-5-4H4z" fill="currentColor"/>${waves}</svg>`;
  };
  render();
  document.body.append(box);
}
// Any page that has sound imports this module, so the control appears with the page, before
// the first sound plays.
// (Tests import the sound modules in Node, where there is no page.)
if (typeof document !== 'undefined') {
  if (document.body) addControl(); else addEventListener('DOMContentLoaded', addControl, {once: true});
}
