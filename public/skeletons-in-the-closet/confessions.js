// Skeletons in the closet: confess to unlock a confession.
// A speech bubble under the mannequin inset, its tail pointing up into the frame (the reference
// bubble's shape, mirrored and turned over), styled like the auction's Estate Sale card: flat, no
// rounded corners, no shadow. A visitor types a confession and one from the closet is revealed in
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

// viewBox 70 100 750 370. The body spans y ≈ 187–460; the tail rises to y 112.
const SHAPE = '763,460 278,425 283,447 80,425 111,230 350,220 313,172 353,157 313,112 408,166 433,192 703,187 808,390';
const STRIP = '118,342 752,350 744,420 128,410';                 // the dark band, along the bottom edge
const BUTTON = {x: 512, y: 352, width: 226, height: 60,          // the button at the band's right end,
  clip: 'polygon(0 0,100% 2%,96% 100%,2% 97%)'};                  // its edges following the band's
const TAIL = {x: (333 - 70) / 750, y: (112 - 100) / 370};          // tail tip, as fractions of the bubble

const esc = text => text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export function createConfessions(host, stage, inset) {
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
  bubble.innerHTML = `<svg viewBox="70 100 750 370" xmlns="http://www.w3.org/2000/svg">
    <polygon class="bubble-shape" points="${SHAPE}"/>
    <polygon class="bubble-strip" points="${STRIP}"/>
    <foreignObject x="135" y="228" width="640" height="110"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-top"></div></foreignObject>
    <foreignObject x="150" y="352" width="345" height="56"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-field"></div></foreignObject>
    <foreignObject x="${BUTTON.x}" y="${BUTTON.y}" width="${BUTTON.width}" height="${BUTTON.height}"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-action"></div></foreignObject>
  </svg>`;
  stage.append(bubble);
  const top = bubble.querySelector('.bubble-top'), field = bubble.querySelector('.bubble-field'), action = bubble.querySelector('.bubble-action');
  // Typing and clicking here belong to the bubble, not to the room's pan.
  for (const type of ['pointerdown', 'pointermove', 'wheel', 'dblclick']) bubble.addEventListener(type, e => e.stopPropagation());
  const button = label => `<button type="button" style="clip-path:${BUTTON.clip}">${label}</button>`;

  function ask() {
    bubble.dataset.view = 'ask';
    top.innerHTML = '<h2>Confess to unlock a confession</h2>';
    field.innerHTML = '<form id="confess-form"><input name="secret" maxlength="280" autocomplete="off" placeholder="Tell me a secret" aria-label="Your confession" required></form>';
    action.innerHTML = button('Submit &amp; reveal');
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
    top.innerHTML = `<button class="close" type="button" aria-label="Close">×</button><p class="text${text.length > 70 ? ' long' : ''}">${esc(text)}</p>`;
    field.innerHTML = '';
    action.innerHTML = button('Submit another one');
    top.querySelector('.close').addEventListener('click', ask);
    action.querySelector('button').addEventListener('click', () => { ask(); field.querySelector('input').focus(); });
  }
  ask();

  // ---- placement: under the inset, tail into it; sized by the stage's height ----
  // The inset is raised just enough for the bubble to sit below it inside the card (the exhibition
  // clips a card to its frame, so it cannot hang outside).
  function place() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    const width = Math.min(W * .34, H * .5), height = width * 370 / 750;
    // The inset's centre, without its pan translate (CSS: left -3%, width 29%).
    const insetCentre = W * (-.03 + .29 / 2);
    const bottom = H * .02;
    bubble.style.width = width + 'px';
    bubble.style.left = Math.max(W * .01, insetCentre - width * TAIL.x) + 'px';   // whole bubble inside the card
    bubble.style.bottom = bottom + 'px';
    inset.style.bottom = bottom + height * (1 - TAIL.y) - height * .1 + 'px';   // the tail tucks under its lower edge
  }
  new ResizeObserver(place).observe(stage);
  place();
  return {
    // Follow the mannequin inset as the room pans (the same translate the inset gets).
    follow(transform) { if (bubble.style.transform !== transform) bubble.style.transform = transform; },
  };
}
