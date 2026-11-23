// Accent shard: the blue riso backing card from Where Are They Now (disco), for any card.
// Same recipe as disco's #composition-card: a flat #222978 plane printed once through the
// shared PrintPass with the exhibition's print settings, tint and sketch off and exposure
// -0.35, on a canvas clipped to a polygon whose edges are slightly roughened.
// It sits under the card's scene canvas. Its points are fractions of the stage box and may
// reach outside it: on a card's own page the stage clips it, in the exhibition it draws whole.
import * as THREE from './vendor/three.module.js';
import {PrintPass} from './print-pass.js';
import {MAP_PRESET} from './map-preset.js';

const CSS = '.accent-shard{position:absolute;z-index:0;pointer-events:none}.accent-shard canvas{display:block;width:100%;height:100%}';
const BUFFER_SCALE = .4;   // canvas pixels per CSS pixel: disco's backing prints at about this density

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
  // Roughened edges, like disco's backing: a few points along each side, nudged off the line.
  const outline = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    for (let j = 0; j < 12; j++) {
      const t = j / 12, wave = Math.sin(j * 17.17 + i * 83) * .0025;
      outline.push(`${(((a[0] + (b[0] - a[0]) * t) - box.x) / box.w * 100 + wave * 100).toFixed(3)}% ${(((a[1] + (b[1] - a[1]) * t) - box.y) / box.h * 100 + wave * 100).toFixed(3)}%`);
    }
  });
  el.style.clipPath = `polygon(${outline.join(',')})`;
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
