import * as THREE from '../shared/vendor/three.module.js';
import {mergeGeometries} from '../shared/vendor/BufferGeometryUtils.js';
import {gltfLoader} from '../shared/gltf.js';
import {PrintPass} from '../shared/print-pass.js';
import {loadTuning, tuningPanel} from '../shared/tuning-panel.js';

// Karmic Debts: the corner of the studio of studio_room.blend (tools/export-karmic.py), framed
// as in the sketch: the back plaster wall on the left, the glass partition on the right, the two
// benches along them and the round table with its house of cards in front.
// Built like the other room cards (disco, Will): the shared print pass, warm sun with soft
// shadows. The partition is frosted grey glass, with the purple door in its nearest bay
// (added by the export). The table props stay separate objects for the interaction to come.

const assetUrl = path => new URL(path, import.meta.url).href;

// Camera and look. Tune them on the standalone page (/karmic-debts/, Tune panel), press
// "Copy settings" and paste the result over this object. Positions are in metres, y up
// (the blend's x, z, -y).
export const TUNING = {
  // Wide view: the corner, as in the sketch.
  camX: .03, camY: 1.73, camZ: 2.2,         // where the viewer stands
  lookX: 1.58, lookY: .87, lookZ: -1.05,    // the point looked at (the far corner, past the table)
  lens: 14,                                 // focal length in mm on a 36 mm film width
  // Close view (click the table): pushed in on the table, as the disco ball zoom.
  closeCamX: .08, closeCamY: 1.41, closeCamZ: 1.76,
  closeLookX: 1.6, closeLookY: .51, closeLookZ: -1.38,
  closeLens: 25.5,
  orbit: 8,                                 // soft orbit range in degrees (map pan and pointer turn the view)
  // Look (for the final colour audit). Print: riso grain/dots, sketch lines.
  riso: .62, sketch: .46, light: 1, sun: 1,
  // Print-pass grades: room = everything solid, glass = the frosted partition panes,
  // cards = the table props (printed in the pink accent ink, like the disco ball).
  roomExposure: .25, roomContrast: 1.05, roomShadows: .05, roomHighlights: 0, roomValue: 0,
  glassExposure: .25, glassContrast: 1.05, glassShadows: .05, glassHighlights: 0, glassValue: 0,
  cardsExposure: 0, cardsContrast: 1.1, cardsShadows: 0, cardsHighlights: 0, cardsValue: 0,
  // Material brightness (multiplies each material's colour).
  walls: 1, floor: 1, wood: 1, furniture: 1, props: 1, glass: 1, door: 1,
};
const TUNE_KEY = 'karmic-tuning-v1';
const GRADE = name => ({[name + 'Exposure']: [-2, 3, .01], [name + 'Contrast']: [0, 3, .01], [name + 'Shadows']: [-1, 1, .01],
  [name + 'Highlights']: [-1, 1, .01], [name + 'Value']: [-1, 1, .01]});
const RANGES = {
  camX: [-2.3, 2.3, .01], camY: [.3, 3, .01], camZ: [-2, 2.2, .01],
  lookX: [-2.3, 2.3, .01], lookY: [0, 3, .01], lookZ: [-2.2, 2.2, .01],
  lens: [10, 60, .5],
  closeCamX: [-2.3, 2.3, .01], closeCamY: [.3, 3, .01], closeCamZ: [-2, 2.2, .01],
  closeLookX: [-2.3, 2.3, .01], closeLookY: [0, 3, .01], closeLookZ: [-2.2, 2.2, .01],
  closeLens: [10, 80, .5], orbit: [0, 30, .5],
  riso: [0, 1, .01], sketch: [0, 1, .01], light: [0, 3, .01], sun: [0, 3, .01],
  ...GRADE('room'), ...GRADE('glass'), ...GRADE('cards'),
  walls: [0, 3, .01], floor: [0, 3, .01], wood: [0, 3, .01], furniture: [0, 3, .01], props: [0, 3, .01],
  glass: [0, 3, .01], door: [0, 3, .01],
};
const SECTIONS = {camX: 'Wide camera', closeCamX: 'Close camera (click the table)', orbit: 'Motion', riso: 'Look', roomExposure: 'Room grade',
  glassExposure: 'Glass grade', cardsExposure: 'Table props grade', walls: 'Material brightness'};
// The zoom between the two views moves like the disco ball's: 2.6 s, stepped at 24 fps, eased.
const ZOOM_TIME = 2600, ZOOM_FPS = 24;
// The round table top (for the click that zooms in): centre and radius in metres, y up.
const TABLE = {x: .99, y: .8, z: .14, radius: .75};
// Card framing is set for this shape; wider frames keep its height, narrower ones its width.
const HOME_ASPECT = 1.4;
// Objects kept apart (not merged) for the coming interaction: the cards and the table things.
const PROPS = /Castle|Deck card|Loose playing card|mug|saucer|Mug handle|Ashtray|Wallet/i;
const GLASS = 'smoky_partition_glass';

export async function mount(host) {
const canvas = host.$('#scene');
const stage = host.$('#stage');
const status = host.$('#status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, HOME_ASPECT, .05, 40);
const tunable = !host.embedded && !host.world;
const tuning = tunable ? loadTuning(TUNE_KEY, TUNING) : {...TUNING};

// Rebuild a geometry as plain Float32 position / normal / uv with an index, so parts can merge.
function plain(geometry, matrix) {
  const g = geometry.index ? geometry : geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
  const out = new THREE.BufferGeometry();
  const count = g.attributes.position.count;
  const copy = (name, size) => {
    const source = g.attributes[name], array = new Float32Array(count * size);
    if (source) for (let i = 0; i < count; i++) for (let k = 0; k < size; k++) array[i * size + k] = source.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  };
  copy('position', 3);
  copy('normal', 3);
  copy('uv', 2);
  out.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  out.applyMatrix4(matrix);
  return out;
}

try {
  const renderer = host.createRenderer({canvas, antialias: true});
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const pass = new PrintPass(renderer);
  pass.set('wobble', .22);

  const gltf = await gltfLoader().loadAsync(assetUrl('assets/studio.glb?v=2'));
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  scene.add(model);

  // ---- materials: the model's own colours and textures, matte (no environment to reflect) ----
  const looks = new Map();
  const groupOf = name =>
    /plaster|laminate|skylight/i.test(name) ? 'walls'
    : /floor/i.test(name) ? 'floor'
    : /pine|grain/i.test(name) ? 'wood'
    : /card|ceramic|pewter|paper edges/i.test(name) ? 'props'
    : /door paint/i.test(name) ? 'door'
    : 'furniture';
  function restyle(source) {
    if (looks.has(source)) return looks.get(source);
    if (source.name === GLASS) {
      // Frosted glass: a pale, matte grey with a little light of its own (daylight through it).
      const frosted = new THREE.MeshStandardMaterial({color: '#b9bcc6', roughness: .95, metalness: 0,
        emissive: new THREE.Color('#cfd2da'), emissiveIntensity: .22});
      frosted.userData.foliage = true;   // print pass: its own grade (the "glass" region)
      frosted.userData.look = {group: 'glass', base: frosted.color.clone()};
      looks.set(source, frosted);
      return frosted;
    }
    const material = new THREE.MeshStandardMaterial({
      color: source.color, map: source.map, roughness: Math.max(.55, source.roughness ?? .8), metalness: 0,
      side: source.side,
    });
    if (/skylight/i.test(source.name)) { material.emissive = new THREE.Color('#fff4e0'); material.emissiveIntensity = .6; }
    if (/card|ceramic|pewter|paper edges/i.test(source.name)) material.userData.accent = true;   // print pass: pink accent ink
    material.userData.look = {group: groupOf(source.name), base: material.color.clone()};
    looks.set(source, material);
    return material;
  }

  // ---- merge the room per material; keep the table props as their own objects ----
  const room = new THREE.Group(), props = new THREE.Group();
  room.name = 'room';
  props.name = 'table-props';
  const byMaterial = new Map();
  const meshes = [];
  model.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    let top = mesh;
    while (top.parent && top.parent !== model) top = top.parent;
    const material = restyle(mesh.material);
    if (PROPS.test(mesh.name) || PROPS.test(top.name)) {
      const prop = new THREE.Mesh(mesh.geometry, material);
      mesh.matrixWorld.decompose(prop.position, prop.quaternion, prop.scale);
      prop.name = top.name;
      prop.castShadow = prop.receiveShadow = true;
      props.add(prop);
      continue;
    }
    const list = byMaterial.get(material) || [];
    list.push(plain(mesh.geometry, mesh.matrixWorld));
    byMaterial.set(material, list);
  }
  for (const [material, list] of byMaterial) {
    const merged = new THREE.Mesh(mergeGeometries(list), material);
    const isGlass = material.userData.look?.group === 'glass';   // light passes the frosted panes
    merged.castShadow = !isGlass;
    merged.receiveShadow = !isGlass;
    room.add(merged);
  }
  scene.remove(model);
  scene.add(room, props);

  // ---- light: warm daylight through the partition, soft shadows, a cool fill ----
  const hemi = new THREE.HemisphereLight('#fff6e6', '#4a4256', 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe6c2', 3);
  sun.position.set(7, 5.5, 1.5);
  sun.target.position.set(.4, 0, -.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 20});
  sun.shadow.bias = -.0003;
  sun.shadow.normalBias = .015;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#c3c8ff', .5);
  fill.position.set(-3, 4, 4);
  scene.add(fill);
  renderer.shadowMap.needsUpdate = true;

  // ---- look: print grades, material brightness and light, all from tuning ----
  const GRADES = {room: 'room', glass: 'foliage', cards: 'ball'};
  function applyLook() {
    pass.set('riso', tuning.riso);
    pass.set('sketch', tuning.sketch);
    for (const [name, region] of Object.entries(GRADES))
      for (const g of ['Exposure', 'Contrast', 'Shadows', 'Highlights', 'Value']) pass.setGrade(region, g.toLowerCase(), tuning[name + g]);
    for (const material of looks.values())
      if (material.userData.look) material.color.copy(material.userData.look.base).multiplyScalar(tuning[material.userData.look.group]);
    hemi.intensity = 1.6 * tuning.light;
    fill.intensity = .5 * tuning.light;
    sun.intensity = 3 * tuning.light * tuning.sun;
  }

  // ---- camera with the soft orbit about the point looked at ----
  const pointer = {inside: false, ndc: new THREE.Vector2(), moved: -Infinity};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, visible = true, mapShown = true, lastDraw = -Infinity, size = {width: 1, height: 1};
  const mapLook = new THREE.Vector2(), orbitGoal = new THREE.Vector2(), orbitNow = new THREE.Vector2();
  const eye = new THREE.Vector3(), target = new THREE.Vector3(), closeEye = new THREE.Vector3(), closeTarget = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const turn = new THREE.Quaternion(), turnB = new THREE.Quaternion();
  host.installMapBridge?.({
    viewport: m => {
      mapShown = m.visible !== false;
      mapLook.set(THREE.MathUtils.clamp((m.localPanX || 0) / Math.max(1, size.width), -1.5, 1.5),
        THREE.MathUtils.clamp((m.localPanY || 0) / Math.max(1, size.height), -1.5, 1.5));
      if (m.overview) mapLook.set(0, 0);
      wake();
    },
    command: m => { if (m.command === 'zoom') setView(!close); if (m.command === 'wide') setView(false); if (m.command === 'detail') setView(true); },
  });
  canvas.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    pointer.ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
    pointer.inside = true;
    pointer.moved = performance.now();
    wake();
  });
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; wake(); });

  // ---- wide / close: click the table to go in; Escape or a click away from it comes back ----
  // (Clicks on the table in the close view are left for the interaction to come.)
  let close = false, viewMix = 0, zoom = null;
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE.y), tableHit = new THREE.Vector3();
  const clickRay = new THREE.Raycaster();
  function overTable(e) {
    const rect = canvas.getBoundingClientRect();
    clickRay.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), camera);
    if (!clickRay.ray.intersectPlane(tablePlane, tableHit)) return false;
    return Math.hypot(tableHit.x - TABLE.x, tableHit.z - TABLE.z) < TABLE.radius;
  }
  function setView(next) {
    if (close === next && !zoom) return;
    close = next;
    zoom = {from: viewMix, to: next ? 1 : 0, start: performance.now(), duration: reduced ? 400 : ZOOM_TIME};
    canvas.dataset.view = next ? 'close' : 'wide';
    zoomOut.hidden = !next;
    wake();
  }
  // A visible way back out of the close view (Escape and a click off the table also work).
  const zoomOut = host.$('#zoom-out');
  zoomOut.addEventListener('click', e => { e.stopPropagation(); setView(false); canvas.focus(); });
  canvas.addEventListener('click', e => {
    const onTable = overTable(e);
    if (!close && onTable) setView(true);
    else if (close && !onTable) setView(false);
  });
  canvas.addEventListener('keydown', e => {
    if (e.code === 'Escape') setView(false);
    if (e.code === 'Enter') { e.preventDefault(); setView(!close); }
  });
  canvas.addEventListener('pointermove', e => { canvas.style.cursor = !close && overTable(e) ? 'zoom-in' : close && !overTable(e) ? 'zoom-out' : ''; });
  function stepZoom(now) {
    if (!zoom) return false;
    const elapsed = now - zoom.start;
    let t = Math.min(1, Math.floor(elapsed / (1000 / ZOOM_FPS)) * (1000 / ZOOM_FPS) / zoom.duration);
    t = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    viewMix = THREE.MathUtils.lerp(zoom.from, zoom.to, t);
    if (elapsed >= zoom.duration) { viewMix = zoom.to; zoom = null; }
    return true;
  }

  function frameCamera(dt) {
    // The orbit eases off in the close view, as disco's parallax does.
    const look = THREE.MathUtils.degToRad(tuning.orbit) * THREE.MathUtils.lerp(1, .4, viewMix);
    orbitGoal.copy(mapLook).multiplyScalar(.7);
    if (pointer.inside && !reduced) orbitGoal.addScaledVector(pointer.ndc, .3);
    orbitGoal.clampScalar(-1, 1);
    orbitNow.x = THREE.MathUtils.damp(orbitNow.x, orbitGoal.x, 3, dt);
    orbitNow.y = THREE.MathUtils.damp(orbitNow.y, orbitGoal.y, 3, dt);
    eye.set(tuning.camX, tuning.camY, tuning.camZ).lerp(closeEye.set(tuning.closeCamX, tuning.closeCamY, tuning.closeCamZ), viewMix);
    target.set(tuning.lookX, tuning.lookY, tuning.lookZ).lerp(closeTarget.set(tuning.closeLookX, tuning.closeLookY, tuning.closeLookZ), viewMix);
    // Turn about the point looked at: sideways about the vertical, up/down about the view's right.
    right.subVectors(target, eye).cross(up).normalize();
    turn.setFromAxisAngle(up, -orbitNow.x * look);
    turnB.setFromAxisAngle(right, orbitNow.y * look * .6);
    turn.multiply(turnB);
    camera.position.copy(eye).sub(target).applyQuaternion(turn).add(target);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    // Lens: horizontal angle of `lens` mm on 36 mm film at the home shape; wider frames keep the height.
    const lens = THREE.MathUtils.lerp(tuning.lens, tuning.closeLens, viewMix);
    const homeV = 2 * Math.atan(Math.tan(Math.atan(18 / lens)) / HOME_ASPECT);
    const aspect = size.width / size.height;
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(aspect >= HOME_ASPECT ? homeV : 2 * Math.atan(Math.tan(homeV / 2) * HOME_ASPECT / aspect));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function wake() { if (!raf && visible && mapShown && !document.hidden) raf = requestAnimationFrame(draw); }
  function draw(time) {
    raf = 0;
    if (!visible || !mapShown || document.hidden) return;
    const active = pointer.inside && time - pointer.moved < 1500 || !!zoom;
    if (!active && time - lastDraw < 1000 / 30) { wake(); return; }
    const dt = Math.min(.05, (time - lastDraw) / 1000 || .016);
    lastDraw = time;
    stepZoom(time);
    applyLook();
    frameCamera(dt);
    pass.render(scene, camera, time / 1000);
    canvas.dataset.state = 'ready';
    const settling = orbitNow.distanceToSquared(orbitGoal) > 1e-6;
    if (!reduced || active || settling) wake();
  }
  function resize() {
    const {width, height} = stage.getBoundingClientRect();
    if (!width || !height) return;
    size = {width, height};
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    renderer.setSize(width, height, false);
    pass.resize();
    pass.cardSize.set(1, 1);
    pass.cardCenter.set(.5, .5);
    wake();
  }
  if (tunable) tuningPanel(host, tuning, {defaults: TUNING, ranges: RANGES, sections: SECTIONS, storageKey: TUNE_KEY,
    changed: () => { renderer.shadowMap.needsUpdate = true; wake(); }});
  document.addEventListener('visibilitychange', wake);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }).observe(stage);
  new ResizeObserver(resize).observe(stage);
  status.hidden = true;
  resize();
} catch (error) {
  console.error(error);
  status.textContent = 'The room could not load. Reload to try again.';
}
}
