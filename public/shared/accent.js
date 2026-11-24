// Accent shard: the blue riso backing card from Where Are They Now (disco), for any card.
// Same recipe as disco's #composition-card: a flat #222978 plane printed once through the
// shared PrintPass with the exhibition's print settings, tint and sketch off and exposure
// -0.35, on a canvas clipped to a polygon whose edges are slightly roughened.
// It sits under the card's scene canvas. Its points are fractions of the stage box and may
// reach outside it: on a card's own page the stage clips it, in the exhibition it draws whole.
// el.fold(open) wipes a three- or four-sided shard shut along two edges, as disco's backing
// does when its view zooms in (0 = gone, 1 = open).
import * as THREE from './vendor/three.module.js';
import {PrintPass} from './print-pass.js';
import {MAP_PRESET} from './map-preset.js';

const CSS = '.accent-shard{position:absolute;z-index:0;pointer-events:none}.accent-shard canvas{display:block;width:100%;height:100%}';
const BUFFER_SCALE = .4;   // canvas pixels per CSS pixel: disco's backing prints at about this density

// disco/scene.js foldCardEdges: the corners slide towards seams on two opposite edges.
function foldQuad(corners, open, variant = 1) {
  const q = corners.map(p => p.slice());
  if (variant) q.push(q.shift());
  const shut = 1 - Math.min(1, Math.max(0, open));
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const seamA = mix(q[0], q[3], variant ? .63 : .42), seamB = mix(q[1], q[2], variant ? .38 : .61);
  const folded = [mix(q[0], seamA, Math.pow(shut, variant ? 1.55 : .72)), mix(q[1], seamB, Math.pow(shut, variant ? 1.1 : .96)),
    mix(q[2], seamB, Math.pow(shut, variant ? .62 : 1.8)), mix(q[3], seamA, Math.pow(shut, variant ? .9 : 1.35))];
  if (variant) folded.unshift(folded.pop());
  return folded;
}
function roughened(points) {   // a few points along each side, nudged off the line
  const out = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    for (let j = 0; j < 12; j++) {
      const t = j / 12, wave = Math.sin(j * 17.17 + i * 83) * .25;
      out.push(`${(a[0] + (b[0] - a[0]) * t + wave).toFixed(3)}% ${(a[1] + (b[1] - a[1]) * t + wave).toFixed(3)}%`);
    }
  });
  return `polygon(${out.join(',')})`;
}

export function addAccent(host, stage, points, sceneCanvas) {
  if (!host.$('#accent-shard-css')) {
    const style = Object.assign(document.createElement('style'), {id: 'accent-shard-css', textContent: CSS});
    (host.body || document.body).append(style);
  }
  if (sceneCanvas) { sceneCanvas.style.position = 'relative'; sceneCanvas.style.zIndex = '1'; }   // the scene stays on top
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const box = {x: Math.min(...xs), y: Math.min(...ys)};
  box.w = Math.max(...xs) - box.x; box.h = Math.max(...ys) - box.y;
  const el = document.createElement('aside');
  el.className = 'accent-shard'; el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {left: box.x * 100 + '%', top: box.y * 100 + '%', width: box.w * 100 + '%', height: box.h * 100 + '%'});
  const local = points.map(([x, y]) => [(x - box.x) / box.w * 100, (y - box.y) / box.h * 100]);   // % of its own box
  el.style.clipPath = roughened(local);
  // A triangle folds as a four-sided card with its longest side split in two.
  let quad = local.length === 4 ? local : null;
  if (local.length === 3) {
    const sides = [0, 1, 2].map(i => Math.hypot(local[(i + 1) % 3][0] - local[i][0], local[(i + 1) % 3][1] - local[i][1]));
    const i = sides.indexOf(Math.max(...sides)), a = local[i], b = local[(i + 1) % 3];
    quad = [...local.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...local.slice(i + 1)];
  }
  let shown = 1;
  el.fold = open => {
    if (!quad || Math.abs(open - shown) < .001) return;
    shown = open;
    el.style.visibility = open <= .001 ? 'hidden' : '';
    el.style.clipPath = roughened(open >= .999 ? local : foldQuad(quad, open));
  };
  const canvas = document.createElement('canvas');
  el.append(canvas);
  stage.prepend(el);

  const renderer = host.createRenderer({canvas, antialias: true});
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10);
  camera.position.z = 2;
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({color: '#222978'})));
  let pass = null;
  function draw() {
    const w = Math.max(32, Math.round(el.clientWidth * BUFFER_SCALE)), h = Math.max(32, Math.round(el.clientHeight * BUFFER_SCALE));
    renderer.setSize(w, h, false);
    if (!pass) {
      pass = new PrintPass(renderer);
      pass.cardSize.set(1, 1); pass.cardCenter.set(.5, .5);
      for (const [key, value] of Object.entries(MAP_PRESET.print)) if (key in pass.settings) pass.set(key, value);
      pass.set('tint', 0); pass.set('sketch', 0);
      const neutral = {exposure: -.35, contrast: 1, shadows: 0, highlights: 0, saturation: 1, temperature: 0, tint: 0, value: 0};
      for (const region of ['ball', 'room', 'foliage']) for (const [key, value] of Object.entries(neutral)) pass.setGrade(region, key, value);
    } else pass.resize();
    pass.render(scene, camera, 0);
  }
  draw();
  addEventListener('resize', draw);
  return el;
}
