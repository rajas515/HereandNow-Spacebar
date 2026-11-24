// Where Are They Now: the people of the discipline, by batch.
// In the close view a stack of batch tabs sits against the room's top left corner. A batch opens to
// its names; a name opens that person's card beside the list, its top level with the list's: portrait,
// name below it, and where they are now.
//
// The people come from assets/people.json, built from the content sheet by
// tools/build-where-are-they-now.py. A person without a portrait in assets/people/ gets one of the
// generic face drawings the disco ball's tiles carry.
//
// Placement: the list's top right corner and the card's top left corner meet at the room cut-out's top
// left corner, projected each frame, and everything is sized in units of the room as drawn (--u is 1%
// of the close view's). Nothing slides: the list stays put and the card is cut open from the list's edge in steps,
// the way the room's own cut planes move.

const url = path => new URL(path, import.meta.url).href;
const FACES = url('./assets/face-drawings-atlas.webp?v=webp1');   // 3 x 3 drawings
const LIST_HEIGHT = 84;   // units the list can reach with its longest batch open
const LIST_WIDTH = 19, CARD = {width: 60, height: 66};   // units; match .wn-list and .wn-card in style.css
const ROOM_SPAN = 37.4;  // units from the room's top left corner down to the ball
const esc = text => String(text).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const hash = text => [...text].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 7);

export function createWhereNow(host, stage) {
  const root = document.createElement('section');
  root.id = 'where-now';
  root.setAttribute('aria-label', 'Where are they now: people by batch');
  root.innerHTML = '<nav class="wn-list" aria-label="Batches"></nav><article class="wn-card" aria-live="polite" hidden></article>';
  stage.append(root);
  const list = root.querySelector('.wn-list'), card = root.querySelector('.wn-card');
  // Clicks, drags and scrolling here belong to the list and card, not to the room's pan or zoom.
  for (const part of [list, card]) {
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel', 'touchstart']) part.addEventListener(type, e => e.stopPropagation());
  }

  let batches = [], openBatch = null, openPerson = null;

  function portrait(person) {
    if (person.photo) return `<span class="wn-photo"><img src="${esc(url('./' + person.photo))}" alt="Portrait of ${esc(person.name)}"></span>`;
    const cell = hash(person.name) % 9;
    return `<span class="wn-photo wn-drawing" role="img" aria-label="Drawing of a face" style="background-image:url('${FACES}');background-position:${cell % 3 * 50}% ${Math.floor(cell / 3) * 50}%"></span>`;
  }

  function renderList() {
    list.innerHTML = batches.map(batch => {
      const open = batch.id === openBatch;
      const names = open ? `<ul>${batch.people.map((person, i) => `<li><button type="button" class="wn-name${openPerson === person ? ' is-open' : ''}" data-person="${i}" style="--i:${i}" aria-pressed="${openPerson === person}">${esc(person.name)}</button></li>`).join('')}</ul>` : '';
      return `<div class="wn-batch${open ? ' is-open' : ''}"><button type="button" class="wn-tab" data-batch="${batch.id}" aria-expanded="${open}">${batch.id}</button>${names}</div>`;
    }).join('');
  }

  function renderCard() {
    root.classList.toggle('has-card', !!openPerson);
    if (!openPerson) {
      if (card.hidden) return;
      // Cut shut the way it was cut open.
      card.classList.add('is-closing');
      card.addEventListener('animationend', () => { if (!openPerson) { card.hidden = true; card.innerHTML = ''; } card.classList.remove('is-closing'); }, {once: true});
      return;
    }
    const person = openPerson;
    const fields = person.fields.map(([label, text]) => `<p>${label ? `<b>${esc(label)}:</b> ` : ''}${esc(text)}</p>`).join('');
    card.classList.remove('is-closing');
    card.hidden = false;
    card.innerHTML = `<div class="wn-edge"><div class="wn-paper"><div class="wn-copy">
        ${portrait(person)}
        <h2>${esc(person.name)}</h2>
        <div class="wn-fields">${fields}</div>
      </div></div></div>
      <button type="button" class="wn-close" aria-label="Close">×</button>`;
    card.querySelector('.wn-close').addEventListener('click', () => { openPerson = null; renderList(); renderCard(); });
  }

  list.addEventListener('click', event => {
    const tab = event.target.closest('.wn-tab'), name = event.target.closest('.wn-name');
    if (tab) {
      openBatch = openBatch === tab.dataset.batch ? null : tab.dataset.batch;
      openPerson = null;
    } else if (name) {
      const person = batches.find(batch => batch.id === openBatch).people[+name.dataset.person];
      openPerson = openPerson === person ? null : person;
    } else return;
    renderList();
    renderCard();
  });

  fetch(url('./assets/people.json?v=3')).then(response => response.json()).then(data => { batches = data.batches; renderList(); }).catch(() => {});

  let last = '';
  return {
    // point, ball: the room cut-out's top left corner and the disco ball in the world; mix: 0 wide view .. 1 close view.
    pin(point, ball, camera, pass, mix) {
      const q = point.clone().project(camera), b = ball.clone().project(camera);
      const width = stage.clientWidth, height = stage.clientHeight;
      if (mix < .8) { if (last !== 'off') { last = 'off'; root.style.opacity = 0; root.classList.remove('is-live'); } return; }
      // The part of the stage the visitor can see, in stage px: the exhibition draws this card in a frame
      // that can be larger than the window and scaled.
      const rect = stage.getBoundingClientRect(), k = rect.width / width || 1;
      const seen = {left: Math.max(0, -rect.left / k), top: Math.max(0, -rect.top / k)};
      seen.right = Math.min(width, (window.innerWidth - rect.left) / k);
      seen.bottom = Math.min(height, (window.innerHeight - rect.top) / k);
      // The unit follows the room as drawn (corner to ball is ROOM_SPAN units down), so the pair keeps its
      // size against the room; it only shrinks when the list and card would not fit what is seen.
      const unit = Math.min((q.y - b.y) * .5 * pass.cardSize.y * height / ROOM_SPAN,
        (seen.right - seen.left) / (LIST_WIDTH + CARD.width + 4), (seen.bottom - seen.top) / LIST_HEIGHT);
      // Stuck to the room's corner: the pair pans with the room and is never held back at the window's edge.
      const x = (q.x * .5 * pass.cardSize.x + pass.cardCenter.x) * width, y = (1 - (q.y * .5 * pass.cardSize.y + pass.cardCenter.y)) * height;
      const show = Math.max(0, Math.min(1, (mix - .8) / .2));
      const key = `${x.toFixed(1)},${y.toFixed(1)},${unit.toFixed(3)},${show.toFixed(2)}`;
      if (key === last) return;
      last = key;
      root.style.setProperty('--u', unit + 'px');
      root.style.transform = `translate(${x}px,${y}px)`;
      root.style.opacity = show;
      root.classList.toggle('is-live', show > .6);
    },
  };
}
