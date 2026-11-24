// Skeletons in the closet: confess to unlock a confession.
// A speech bubble from the mannequin in the inset (the shape of the reference bubble, flipped so
// its tail points down at the figure), styled like the auction's Estate Sale card. A visitor types
// a confession; it joins the closet and an earlier one, not their own, is revealed in return.
//
// The closet is seeded with SEED below. A visitor's own confessions are kept in their browser
// (localStorage), like the auction's bids: there is no shared server, so a confession reaches other
// visitors only once it is added to SEED.

export const SEED = [
  'Stole more than 20,000 rs worth of stuff from exib.',
  'Had sex in the computer lab while class was going on.',
  'Snuck into exib just for a 3D print, but the guards thought I was with a girl.',
  'Snuck into exib during foundation and saw a senior couple.',
  'Saw a couple go at it in the centre of the studio, on the floor, during a party.',
  'Got caught with substances at a party when we didn’t even want to party (pretty long-lasting consequences).',
];
const KEY = 'skeletons-confessions-v1';

// The reference bubble (863 × 514 px), mirrored left to right.
const SHAPE = '763,110 278,145 283,123 80,145 111,340 350,350 313,398 353,413 313,458 408,404 433,378 703,383 808,180';
const STRIP = '748,256 111,272 123,328 703,345';

const esc = text => text.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

export function createConfessions(host, stage) {
  let state = {mine: [], seen: []};
  try { state = {...state, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const pool = () => SEED.concat(state.mine);

  const bubble = document.createElement('section');
  bubble.id = 'confession';
  bubble.setAttribute('aria-label', 'Confess to unlock a confession');
  bubble.innerHTML = `<svg viewBox="70 100 750 370" xmlns="http://www.w3.org/2000/svg" aria-hidden="false">
    <polygon class="bubble-shape" points="${SHAPE}"/>
    <polygon class="bubble-strip" points="${STRIP}"/>
    <foreignObject x="140" y="150" width="610" height="104"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-top"></div></foreignObject>
    <foreignObject x="150" y="270" width="570" height="64"><div xmlns="http://www.w3.org/1999/xhtml" class="bubble-strip-content"></div></foreignObject>
  </svg>`;
  stage.append(bubble);
  const top = bubble.querySelector('.bubble-top'), strip = bubble.querySelector('.bubble-strip-content');
  // Typing and clicking here belong to the bubble, not to the room's pan.
  for (const type of ['pointerdown', 'pointermove', 'wheel', 'dblclick']) bubble.addEventListener(type, e => e.stopPropagation());

  function ask(note = '') {
    bubble.dataset.view = 'ask';
    top.innerHTML = `<h2>Confess to unlock a confession</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}`;
    strip.innerHTML = `<form class="confess"><input name="secret" maxlength="280" autocomplete="off" placeholder="Tell me a secret" aria-label="Your confession" required><button type="submit">Submit &amp; reveal</button></form>`;
    const form = strip.querySelector('form'), input = form.secret;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = input.value.trim().replace(/\s+/g, ' ');
      if (!text) { input.focus(); return; }
      state.mine.push(text);
      const yours = pool().length;   // its number in the closet
      save();
      reveal(yours);
    });
  }
  function reveal(yours) {
    // One that is not theirs and not yet shown here; start over once all have been seen.
    const all = pool(), theirs = new Set(state.mine);
    let choices = all.map((text, i) => i).filter(i => !theirs.has(all[i]) && !state.seen.includes(i));
    if (!choices.length) { state.seen = []; choices = all.map((text, i) => i).filter(i => !theirs.has(all[i])); }
    const index = choices[Math.floor(Math.random() * choices.length)];
    state.seen.push(index);
    save();
    const text = all[index];
    bubble.dataset.view = 'reveal';
    top.innerHTML = `<button class="close" type="button" aria-label="Close">×</button>
      <p class="label">Confession ${index + 1}</p><p class="text${text.length > 70 ? ' long' : ''}">${esc(text)}</p>`;
    strip.innerHTML = `<span class="who">— Anonymous</span><span class="kept">yours is no. ${yours}</span><button type="button" class="again">Submit another one</button>`;
    const back = () => ask();
    top.querySelector('.close').addEventListener('click', back);
    strip.querySelector('.again').addEventListener('click', () => { ask(); strip.querySelector('input').focus(); });
  }
  ask();
  // Sized by the stage's height, so it keeps its size beside the inset on the card's own page and
  // in the wider exhibition frame alike.
  const size = () => { if (stage.clientHeight) bubble.style.width = Math.min(stage.clientWidth * .34, stage.clientHeight * .5) + 'px'; };
  new ResizeObserver(size).observe(stage);
  size();
  return {
    // Follow the mannequin inset as the room pans (the same translate the inset gets).
    follow(transform) { if (bubble.style.transform !== transform) bubble.style.transform = transform; },
  };
}
