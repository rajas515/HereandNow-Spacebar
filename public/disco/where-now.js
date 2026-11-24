// Where Are They Now: the people of the discipline, by batch.
// In the close view a stack of batch tabs sits beside the room. A batch opens to its names; a name
// slides the list aside and opens that person's card: portrait, name, batch and where they are now.
//
// The people come from assets/people.json, built from the content sheet by
// tools/build-where-are-they-now.py. A person without a portrait in assets/people/ gets one of the
// generic face drawings the disco ball's tiles carry.
//
// Placement: everything hangs off the disco ball's point on screen, in units of the view's height
// (--u is 1% of it), so the list and card keep their place beside the room through panning, the
// exhibition's wider frame and any screen size.

const url = path => new URL(path, import.meta.url).href;
const FACES = url('./assets/face-drawings-atlas.webp?v=webp1');   // 3 x 3 drawings
// Left reach of the layout from the ball, in units: the list alone, and the list beside an open card.
const REACH = {list: 66, card: 97};
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
      const names = open ? `<ul>${batch.people.map((person, i) => `<li><button type="button" class="wn-name${openPerson === person ? ' is-open' : ''}" data-person="${i}" aria-pressed="${openPerson === person}">${esc(person.name)}</button></li>`).join('')}</ul>` : '';
      return `<div class="wn-batch${open ? ' is-open' : ''}"><button type="button" class="wn-tab" data-batch="${batch.id}" aria-expanded="${open}">${batch.id}</button>${names}</div>`;
    }).join('');
  }

  function renderCard() {
    root.classList.toggle('has-card', !!openPerson);
    if (!openPerson) { card.hidden = true; card.innerHTML = ''; return; }
    const person = openPerson;
    const fields = person.fields.map(([label, text]) => `<p>${label ? `<b>${esc(label)}</b>` : ''}${esc(text)}</p>`).join('');
    card.hidden = false;
    card.innerHTML = `<div class="wn-paper"><div class="wn-copy">
        <header>${portrait(person)}<div><h2>${esc(person.name)}</h2><span class="wn-tag">${esc(openBatch)}</span></div></header>
        <div class="wn-fields">${fields}</div>
      </div></div>
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

  fetch(url('./assets/people.json?v=2')).then(response => response.json()).then(data => { batches = data.batches; renderList(); }).catch(() => {});

  let shift = 0, last = '';
  return {
    // x, y: the disco ball on the stage, in px; mix: 0 wide view .. 1 close view.
    pin(x, y, mix) {
      const width = stage.clientWidth, height = stage.clientHeight;
      const unit = Math.min(height, width * .6) / 100;
      const show = Math.max(0, Math.min(1, (mix - .8) / .2));
      // Keep the whole layout on the stage: nudge it right when the room sits too close to the left edge.
      const want = Math.max(0, (REACH[openPerson ? 'card' : 'list'] + 2) * unit - x);
      shift += (want - shift) * .2;
      if (Math.abs(want - shift) < .3) shift = want;
      const key = `${(x + shift).toFixed(1)},${y.toFixed(1)},${unit.toFixed(3)},${show.toFixed(2)}`;
      if (key === last) return;
      last = key;
      root.style.setProperty('--u', unit + 'px');
      root.style.transform = `translate(${x + shift}px,${y}px)`;
      root.style.opacity = show;
      root.classList.toggle('is-live', show > .6);
    },
  };
}
