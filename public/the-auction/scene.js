// The Estate Sale (chapter 07), ported from the "New Auction 3D Composition" transfer
// (Auction Composition.html). Seven objects from the studio, pre-printed in riso ink
// (assets/item-*.webp, from the transfer's Composition PNGs), float in a CSS 3D composition.
// Objects rest see-through; hovering brings one to full colour (a pixel-exact hit mask per object, from the transfer); clicking it
// brings it forward with its outline and opens the Estate Sale card (the inline SVG in
// index.html) with the current bids and a bid form. Bids are kept in the visitor's browser.
//
// Changes from the transfer: it is a card (mount(host)) and listens and measures only inside its
// own frame, so it runs standalone, in /map/ and inside the exhibition world. The editing tools
// (effects panel, card placement panel and card dragging) and the original source images they
// needed are left out; the saved card placement is the default (composition.json).

import {soundOutput} from '../shared/sound-output.js';

const assetUrl = path => new URL(path, import.meta.url).href;

// ---- sounds: a keystroke as the bidder's name is typed, a gavel over the gavel icons and on
// "bid now!". Browsers only allow sound after a click or key press on the page.
function auctionSounds() {
  let context, loading;
  const clips = {};
  function load() {
    context ||= new AudioContext();
    loading ||= Promise.all([['typing', 'assets/keyboard-typing.mp3'], ['gavel', 'assets/gavel.mp3'], ['cut', 'assets/bush-cut.mp3']].map(([name, path]) =>
      fetch(assetUrl(path)).then(r => { if (!r.ok) throw Error(name + ' sound unavailable'); return r.arrayBuffer(); })
        .then(data => context.decodeAudioData(data)).then(buffer => { clips[name] = buffer; })))
      .then(() => {
        // The typing recording: find its loudest key attack to use as a single keystroke.
        const b = clips.typing, samples = b.getChannelData(0), w = Math.max(1, Math.floor(b.sampleRate * .06));
        let peak = 0;
        for (let i = 0; i < samples.length - w; i += w) {
          let e = 0;
          for (let j = i; j < i + w; j++) e += samples[j] * samples[j];
          if (e > peak) { peak = e; clips.keyAt = Math.max(0, i / b.sampleRate - .012); }
        }
      })
      .catch(error => { loading = null; console.error('Auction sounds:', error); });
    return context.resume().catch(() => {});
  }
  load();
  let lastKey = -1, gavelVoice = null, cutVoice = null;
  function voice(buffer, offset, duration, level, fadeIn = .004, rate = 1) {
    const now = context.currentTime, source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    duration /= rate;   // (offset and duration are in the recording's own seconds)
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + fadeIn);
    gain.gain.setValueAtTime(level, now + Math.max(fadeIn, duration - .08));
    gain.gain.linearRampToValueAtTime(0, now + duration);
    source.connect(gain).connect(soundOutput(context));
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(now, offset, duration * rate);
    return {source, gain};
  }
  const ready = () => context.state === 'running' && clips.typing && clips.gavel && clips.cut;
  return {
    load,
    // Clicking an object (it lights up to full colour): the bush-cut snip, slowed to 65%
    // (lower and longer). A new click replaces the last snip instead of stacking.
    // (Its level and fade-in are the last two settings but one in the call below.)
    cut() {
      if (!ready()) { load().then(() => ready() && this.cut()); return; }
      if (cutVoice) {
        const g = cutVoice.gain.gain, now = context.currentTime;
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + .03);
        cutVoice.source.stop(now + .04);
      }
      // Kept very soft (about a fifth of the first version) and eased in over 0.15 s, so it
      // arrives as a hush rather than a snap.
      cutVoice = voice(clips.cut, 0, clips.cut.duration, .12, .15, .65);
    },
    key() {   // one keystroke per typed character, spaced so fast typing doesn't buzz
      if (!ready()) { load(); return; }
      if (context.currentTime - lastKey < .04) return;
      lastKey = context.currentTime;
      voice(clips.typing, clips.keyAt || 0, .095, .3, .008);
    },
    // The gavel recording strikes twice (0.9 s and 1.4 s in): one strike on hover, both on a bid.
    gavel(bid = false) {
      if (!ready()) { load().then(() => ready() && this.gavel(bid)); return; }
      if (gavelVoice) {   // a new strike replaces the last one instead of stacking
        const g = gavelVoice.gain.gain, now = context.currentTime;
        g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + .03);
        gavelVoice.source.stop(now + .04);
      }
      gavelVoice = bid ? voice(clips.gavel, .88, 2.1, .55) : voice(clips.gavel, .88, .5, .35);
    },
  };
}
const PERSPECTIVE = 1050;            // #auction-stage perspective, px
const BID_KEY = 'auction-local-bids-v1';

export async function mount(host) {
const stage = host.$('#stage');
const frame = host.$('#frame');
const auctionStage = host.$('#auction-stage');
const world = host.$('#world');
const frontWorld = host.$('#front-world');
const foreground = host.$('#focus-item');
const status = host.$('#status');
const root = host.root.elementsFromPoint ? host.root : document;   // shadow root in the exhibition

try {
  const scene = await (await fetch(assetUrl('assets/composition.json'))).json();
  const placement = scene.cardPlacement;
  foreground.style.setProperty('--card-scale', placement.scale);
  foreground.style.setProperty('--card-x', placement.x + 'cqw');
  foreground.style.setProperty('--card-y', placement.y + 'cqh');

  // ---- bids: the three on the card, newest of this browser's first ----
  let localBids = {};
  try { localBids = JSON.parse(localStorage.getItem(BID_KEY)) || {}; } catch {}
  const field = name => foreground.querySelector(`[data-card-field="${name}"]`);
  const bidForm = host.$('#bid-form');
  const bidStatus = host.$('#bid-status');
  const templateBids = [1, 2, 3].map(i => ({name: field('bidder' + i).textContent, amount: Number(field('bidAmount' + i).textContent)}));
  let active = null;
  function displayBids() {
    if (!active) return;
    const bids = (localBids[active.item.asset] || []).concat(templateBids).slice(0, 3);
    bids.forEach(({name, amount}, i) => {
      field('bidder' + (i + 1)).textContent = name;
      field('bidAmount' + (i + 1)).textContent = amount;
    });
  }
  const sounds = auctionSounds();
  host.$('#bidder-name').addEventListener('input', () => sounds.key());
  // "bid now!": the gavel comes down (on the click, so it sounds even when the name is missing).
  bidForm.querySelector('button[type="submit"]').addEventListener('click', () => sounds.gavel(true));
  // The gavel icons beside the current bids: a strike as the pointer arrives on one.
  const gavels = [...foreground.querySelectorAll('g[transform] > image, g[transform] > use')];
  let onGavel = null;
  stage.addEventListener('pointermove', event => {
    if (!active || foreground.hidden) { onGavel = null; return; }
    const hit = gavels.find(g => { const r = g.getBoundingClientRect(); return r.width && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom; }) || null;
    if (hit && hit !== onGavel) sounds.gavel();
    onGavel = hit;
  });
  stage.addEventListener('pointerleave', () => { onGavel = null; });
  bidForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!active) return;
    const name = host.$('#bidder-name').value.trim();
    if (!name) { bidStatus.textContent = 'Enter your name to bid.'; return; }
    const key = active.item.asset, bids = localBids[key] || [];
    const amount = Math.max(...bids.concat(templateBids).map(bid => bid.amount)) + 1;
    localBids[key] = [{name, amount}, ...bids].slice(0, 3);
    try { localStorage.setItem(BID_KEY, JSON.stringify(localBids)); } catch {}
    displayBids();
    bidStatus.textContent = 'Bid ' + amount + ' saved locally.';
    bidForm.reset();
  });
  function showForeground() {
    foreground.hidden = !active;
    bidForm.reset();
    bidStatus.textContent = '';
    displayBids();
  }

  // ---- the composition: one CSS 3D plane per object ----
  const images = await Promise.all(scene.items.map(async item => {
    const img = new Image();
    img.src = assetUrl(item.image);
    await img.decode();
    return img;
  }));
  world.style.transform = `scale(${scene.camera.zoom}) rotateX(${scene.camera.x}deg) rotateY(${scene.camera.y}deg)`;
  frontWorld.style.transform = world.style.transform;
  const entries = new Map();
  const planes = scene.items.map((item, index) => {
    const image = images[index], ratio = item.aspect;
    const width = 225 * Math.min(ratio, 1), height = 225 * Math.min(1 / ratio, 1);
    const plane = document.createElement('div');
    plane.className = 'plane';
    plane.setAttribute('role', 'button');
    plane.setAttribute('aria-label', item.name);
    plane.style.width = width + 'px';
    plane.style.height = height + 'px';
    plane.style.transform = `translate3d(${item.x - width / 2}px,${item.y - height / 2}px,${item.z}px) rotateX(${item.rx}deg) rotateY(${item.ry}deg) rotateZ(${item.rz}deg) scale(${item.scale})`;
    const outline = new Image();
    outline.src = item.outline;
    outline.alt = '';
    outline.className = 'outline';
    const px = 10 * width / image.naturalWidth, py = 10 * height / image.naturalHeight;
    Object.assign(outline.style, {left: -px + 'px', top: -py + 'px', width: width + 2 * px + 'px', height: height + 2 * py + 'px'});
    image.alt = '';
    image.className = 'art';
    image.draggable = outline.draggable = false;
    plane.append(image, outline);
    entries.set(plane, {plane, item, index, image});
    world.append(plane);
    return plane;
  });

  // ---- fit the composition to the card (unscaled units, whatever zoom the exhibition applies) ----
  const unscaled = auctionStage.getBoundingClientRect().width / auctionStage.offsetWidth || 1;
  const centre = auctionStage.getBoundingClientRect();
  const bounds = planes.map(p => p.getBoundingClientRect());
  const left = (Math.min(...bounds.map(b => b.left)) - centre.left) / unscaled - 600;
  const right = (Math.max(...bounds.map(b => b.right)) - centre.left) / unscaled - 600;
  const top = (Math.min(...bounds.map(b => b.top)) - centre.top) / unscaled - 400;
  const bottom = (Math.max(...bounds.map(b => b.bottom)) - centre.top) / unscaled - 400;
  const midX = (left + right) / 2, midY = (top + bottom) / 2;
  const referenceFit = .92 * Math.min(1906 / (right - left), 905 / (bottom - top));   // the transfer's reference screen
  function fit() {
    const width = stage.offsetWidth, height = stage.offsetHeight;
    if (!width || !height) return;
    const scale = .92 * Math.min(width / (right - left), height / (bottom - top));
    frame.style.transform = `scale(${scale}) translate(${-midX}px,${-midY}px)`;
    foreground.style.setProperty('--card-scene-width', 477 * scale / referenceFit + 'px');
  }
  fit();
  new ResizeObserver(fit).observe(stage);

  // ---- hover and click: the transfer's pixel-exact picking, measured in the card's own frame ----
  const worldMatrix = new DOMMatrix(getComputedStyle(world).transform);
  const targets = new Map(planes.map((plane, index) => {
    const [width, height, encoded] = scene.items[index].hit;
    const css = getComputedStyle(plane);
    const [ox, oy] = css.transformOrigin.split(' ').map(parseFloat);
    return [plane, {plane, ox, oy, width, height, mask: atob(encoded), w: parseFloat(css.width), h: parseFloat(css.height)}];
  }));
  let highlighted = null;
  // In the exhibition: tell the world when an object is under the pointer, for its Bid cursor.
  const bridge = host.world ? host.installMapBridge({}) : null;
  function select(plane) {
    if (plane === highlighted) return;
    highlighted?.classList.remove('highlight');
    highlighted = plane;
    highlighted?.classList.add('highlight');
    bridge?.hover?.(!!plane);
  }
  function hits(target, x, y) {
    const {plane, ox, oy, width, height, mask, w, h} = target;
    const m = worldMatrix.translate(ox, oy).multiply(new DOMMatrix(getComputedStyle(plane).transform)).translate(-ox, -oy);
    // Undo perspective by solving for the point on this image's local XY plane.
    const a = m.m11 + x * m.m13 / PERSPECTIVE, b = m.m21 + x * m.m23 / PERSPECTIVE;
    const c = m.m12 + y * m.m13 / PERSPECTIVE, d = m.m22 + y * m.m23 / PERSPECTIVE;
    const e = x * (1 - m.m43 / PERSPECTIVE) - m.m41, f = y * (1 - m.m43 / PERSPECTIVE) - m.m42;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-7) return false;
    const u = (e * d - b * f) / det, v = (a * f - e * c) / det;
    if (u < 0 || u >= w || v < 0 || v >= h) return false;
    const bit = Math.floor(v / h * height) * width + Math.floor(u / w * width);
    return (mask.charCodeAt(bit >> 3) & (128 >> (bit & 7))) !== 0;
  }
  function pick(event) {
    const rect = auctionStage.getBoundingClientRect(), zoom = rect.width / auctionStage.offsetWidth;
    const x = (event.clientX - rect.left - rect.width / 2) / zoom;
    const y = (event.clientY - rect.top - rect.height / 2) / zoom;
    return root.elementsFromPoint(event.clientX, event.clientY)
      .find(candidate => targets.has(candidate) && hits(targets.get(candidate), x, y)) || null;
  }
  function focus(plane) {
    if (active) {
      const previous = active.plane, next = planes[active.index + 1] || null;
      previous.classList.remove('selected');
      world.insertBefore(previous, next);
    }
    active = plane ? entries.get(plane) : null;
    select(null);
    if (active) {
      active.plane.classList.add('selected');
      frontWorld.append(active.plane);
    }
    showForeground();
  }
  stage.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') { select(null); return; }
    select(active ? null : pick(event));
  });
  stage.addEventListener('pointerleave', () => select(null));
  foreground.addEventListener('click', event => {
    event.stopPropagation();
    if (event.target.closest('#bid-form')) return;
    focus(null);
  });
  stage.addEventListener('click', event => {
    if (event.target.closest('#focus-item')) return;
    const plane = pick(event);
    if (plane && active?.plane !== plane) sounds.cut();   // an object lights up and opens
    focus(active?.plane === plane ? null : plane);
  });
  stage.addEventListener('keydown', event => { if (event.key === 'Escape') focus(null); });
  stage.addEventListener('dragstart', event => event.preventDefault());

  // ---- the gentle float, paused while the card is off screen ----
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const floats = planes.map((plane, index) => {
    const base = plane.style.transform, amplitude = 5.5 + (index % 3) * 1.2;
    return plane.animate([0, -amplitude, 0, amplitude, 0].map(y => ({transform: `translateY(${y}px) ${base}`, easing: 'ease-in-out'})),
      {duration: 4800 + index * 370, delay: -index * 510, iterations: Infinity});
  });
  let onScreen = true;
  const updateMotion = () => floats.forEach(a => { if (motion.matches) a.cancel(); else if (onScreen) a.play(); else a.pause(); });
  updateMotion();
  motion.addEventListener('change', updateMotion);
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; updateMotion(); }).observe(stage);

  status.hidden = true;
  stage.dataset.state = 'ready';
} catch (error) {
  console.error(error);
  status.textContent = 'The estate sale could not load. Reload to try again.';
}
}
