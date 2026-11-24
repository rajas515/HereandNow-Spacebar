import {PIN} from './mannequin-inset.js';
// Skeletons in the closet: confess to unlock a confession.
// A speech bubble under the mannequin inset, its tail pointing up into the frame (the reference
// bubble's silhouette, mirrored and turned over), styled like the auction's Estate Sale card: flat,
// square corners, no shadow. A visitor types a confession and one from the closet is revealed in
// return; "Submit another one" asks again.
//
// No backend for now: what visitors type is not kept anywhere. The closet is SEED, revealed in a
// shuffled order that cycles (the place in the cycle is remembered in the browser).

export const SEED = [
  'Stole more than 20,000 rs worth of stuff from exib.',
  'Had sex in the computer lab while class was going on.',
  'Snuck into exib just for a 3D print, but the guards thought I was with a girl.',
  'Snuck into exib during foundation and saw a senior couple.',
  'Saw a couple go at it in the centre of the studio, on the floor, during a party.',
  'Got caught with substances at a party when we didn’t even want to party (pretty long-lasting consequences).',
];
const KEY = 'skeletons-confessions-v2';

// ---- geometry, in one coordinate space (viewBox 0 0 760 370) ----
// The bubble: a slanted body with a point on each side, a stepped notch at the lower left and the
// tail rising from its top edge.
const VIEW = {width: 760, height: 370};
const SHAPE = [[34, 96], [166, 89], [124, 12], [262, 84], [694, 74], [744, 252], [702, 338], [338, 326], [330, 354], [62, 344], [12, 214]];
// Everything inside lines up on one inner grid: text from x 78, the band's corners below.
const INNER = {left: 80, right: 640, top: 118};
// The band sits ~30–40 units inside the outline all round; its right end runs parallel to the bubble's
// lower-right edge.
const BAND = [[58, 228], [708, 236], [676, 306], [64, 298]];        // top-left, top-right, bottom-right, bottom-left
const SPLIT = .64;                                                 // field | button along the band
const PAD = 9;                                                     // dark margin around the field and button

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const along = t => [lerp(BAND[0], BAND[1], t), lerp(BAND[3], BAND[2], t)];   // [top, bottom] at t
// The button: the band's right end, inset by PAD; its right edge follows the band's slant.
const [bTop, bBottom] = along(SPLIT), [eTop, eBottom] = along(1);
const BUTTON = [[bTop[0] + PAD, bTop[1] + PAD], [eTop[0] - PAD, eTop[1] + PAD], [eBottom[0] - PAD, eBottom[1] - PAD], [bBottom[0] + PAD, bBottom[1] - PAD]];
const [fTop, fBottom] = along(0), [gTop] = along(SPLIT);
const FIELD = {x: fTop[0] + 22, y: fTop[1] + PAD, width: gTop[0] - fTop[0] - 22 - PAD * 2, height: fBottom[1] - fTop[1] - PAD * 2};

function box(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  const clip = `polygon(${points.map(([px, py]) => `${((px - x) / width * 100).toFixed(2)}% ${((py - y) / height * 100).toFixed(2)}%`).join(',')})`;
  return {x, y, width, height, clip};
}
const B = box(BUTTON);
const pts = list => list.map(p => p.join(',')).join(' ');
const esc = text => text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export function createConfessions(host, stage) {
  let state = {order: null, at: 0};
  try { state = {...state, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; } catch {}
  if (!Array.isArray(state.order) || state.order.length !== SEED.length) {
    state.order = SEED.map((text, i) => i).sort(() => Math.random() - .5);
    state.at = 0;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  const bubble = document.createElement('section');
  bubble.id = 'confession';
  bubble.setAttribute('aria-label', 'Confess to unlock a confession');
  bubble.innerHTML = `<svg viewBox="0 0 ${VIEW.width} ${VIEW.height}" xmlns="http://www.w3.org/2000/svg">
    <polygon class="bubble-shape" points="${pts(SHAPE)}"/>
    <polygon class="bubble-band" points="${pts(BAND)}"/>
    <foreignObject class="copy-area" x="${INNER.left}" y="${INNER.top}" width="${INNER.right - INNER.left}" height="${BAND[0][1] - INNER.top - 8}"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-copy"></div></foreignObject>
    <foreignObject x="${FIELD.x}" y="${FIELD.y}" width="${FIELD.width}" height="${FIELD.height}"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-field"></div></foreignObject>
    <foreignObject x="${B.x}" y="${B.y}" width="${B.width}" height="${B.height}"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-action"></div></foreignObject>
    <foreignObject x="${INNER.right + 8}" y="${INNER.top - 10}" width="40" height="40"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-close"></div></foreignObject>
  </svg>`;
  stage.append(bubble);
  const copyArea = bubble.querySelector('.copy-area');
  const copy = bubble.querySelector('.bubble-copy'), field = bubble.querySelector('.bubble-field');
  const action = bubble.querySelector('.bubble-action'), close = bubble.querySelector('.bubble-close');
  // Typing and clicking here belong to the bubble, not to the room's pan.
  for (const type of ['pointerdown', 'pointermove', 'wheel', 'dblclick']) bubble.addEventListener(type, e => e.stopPropagation());
  const button = label => `<button type="button" style="clip-path:${B.clip}">${label}</button>`;

  function ask() {
    bubble.dataset.view = 'ask';
    copyArea.setAttribute('height', BAND[0][1] - INNER.top - 8);
    copy.innerHTML = '<h2>Confess to unlock a confession</h2>';
    field.innerHTML = '<form><input name="secret" maxlength="280" autocomplete="off" placeholder="Tell me a secret" aria-label="Your confession" required></form>';
    action.innerHTML = button('Submit &amp; reveal');
    close.innerHTML = '';
    const form = field.querySelector('form');
    const submit = event => {
      event.preventDefault();
      if (!form.secret.value.trim()) { form.secret.focus(); return; }
      reveal();
    };
    form.addEventListener('submit', submit);
    action.querySelector('button').addEventListener('click', submit);
  }
  function reveal() {
    const text = SEED[state.order[state.at % SEED.length]];
    state.at = (state.at + 1) % SEED.length;
    save();
    bubble.dataset.view = 'reveal';
    copyArea.setAttribute('height', B.y - INNER.top - 8);   // no band in the reveal: the text gets its room
    copy.innerHTML = `<p class="${text.length > 70 ? 'long' : ''}">${esc(text)}</p>`;
    field.innerHTML = '';
    action.innerHTML = button('Submit another one');
    close.innerHTML = '<button type="button" aria-label="Close">×</button>';
    close.querySelector('button').addEventListener('click', ask);
    action.querySelector('button').addEventListener('click', () => { ask(); field.querySelector('input').focus(); });
  }
  ask();

  // ---- placement: pinned with the inset to the room corner (mannequin-inset.js, PIN) ----
  // The bubble sits under the inset, its tail tucked into the inset's lower edge; both are placed in
  // stage-height units from the corner's projected point each frame.
  Object.assign(bubble.style, {left: '0', top: '0'});
  let last = '';
  return {
    // x, y: the room-corner marker on the stage; h: stage height; s: the Adjust panel's Position values.
    pin(x, y, h, s = {}) {
      const bx = s.bubbleX ?? PIN.bubble.x, by = s.bubbleY ?? PIN.bubble.y, size = s.bubbleSize ?? 1;
      const key = `${x.toFixed(1)},${y.toFixed(1)},${h},${bx},${by},${size}`;
      if (key === last) return;
      last = key;
      bubble.style.width = PIN.bubble.width * size * h + 'px';
      bubble.style.transform = `translate(${x + bx * h}px,${y + by * h}px)`;
    },
  };
}
