import * as THREE from '../shared/vendor/three.module.js';
import {mergeGeometries} from '../shared/vendor/BufferGeometryUtils.js';
import {gltfLoader} from '../shared/gltf.js';
import {PrintPass} from '../shared/print-pass.js';
import {loadTuning, tuningPanel} from '../shared/tuning-panel.js';
import {soundOutput} from '../shared/sound-output.js';

// Prayers for the Next Life: the three lockers of three_lockers_equal.blend
// (tools/export-prayers.py), seen along the blend's camera. Each locker has eight bottom-hinged
// drop-down doors; every door hangs from its "bottom hinge pivot" node, and turning that node
// about X opens it, exactly as the blend's driver does (open_amount * 100 deg).
// For now: hovering a door eases it open a few degrees, as a hint. Later a click opens it fully
// and a letter comes out (see openDoor).

const assetUrl = path => new URL(path, import.meta.url).href;
const FULL_OPEN = THREE.MathUtils.degToRad(100);   // the blend's driver range

// Framing and effect settings. Tune them on the standalone page (/prayers-for-the-next-life/,
// Tune panel), press "Copy settings" and paste the result over this object.
export const TUNING = {
  rotateX: 0, rotateY: 3, rotateZ: 0,   // composition rotation in degrees, about its own centre
  moveX: 0, moveY: 0, moveZ: 0,         // composition offset in world units
  scale: 1,                             // composition scale
  zoom: 1,                              // >1 zooms the camera in
  orbit: 20,                            // soft orbit range in degrees (map pan and pointer turn the view)
  peek: 30,                             // how far a hovered door eases open, in degrees
  // Look (for the final colour audit). Print: riso grain/dots, sketch lines. Light scales all lamps.
  riso: .62, sketch: .46, light: 1.18,
  // Print-pass grades: lockers = painted steel and hardware, graffiti = the photographed fronts.
  lockersExposure: 1.5, lockersContrast: 1.05, lockersShadows: .05, lockersHighlights: 0, lockersValue: .17,
  graffitiExposure: 2, graffitiContrast: .53, graffitiShadows: -.23, graffitiHighlights: .33, graffitiValue: -.61,
  // Material brightness (multiplies each material's colour).
  blueSteel: 1.41, darkSteel: 1, hardware: 1, graffiti: 1,
};
const TUNE_KEY = 'prayers-tuning-v1';
const RANGES = {
  rotateX: [-180, 180, 1], rotateY: [-180, 180, 1], rotateZ: [-180, 180, 1],
  moveX: [-4, 4, .02], moveY: [-4, 4, .02], moveZ: [-4, 4, .02],
  scale: [.3, 2.5, .01], zoom: [.4, 3, .01],
  orbit: [0, 30, .5], peek: [0, 40, .5],
  riso: [0, 1, .01], sketch: [0, 1, .01], light: [0, 3, .01],
  lockersExposure: [-2, 2, .01], lockersContrast: [0, 3, .01], lockersShadows: [-1, 1, .01], lockersHighlights: [-1, 1, .01], lockersValue: [-1, 1, .01],
  graffitiExposure: [-2, 2, .01], graffitiContrast: [0, 3, .01], graffitiShadows: [-1, 1, .01], graffitiHighlights: [-1, 1, .01], graffitiValue: [-1, 1, .01],
  blueSteel: [0, 3, .01], darkSteel: [0, 3, .01], hardware: [0, 3, .01], graffiti: [0, 3, .01],
};
const SECTIONS = {rotateX: 'Framing', orbit: 'Motion', riso: 'Look', lockersExposure: 'Lockers grade',
  graffitiExposure: 'Graffiti grade', blueSteel: 'Material brightness'};
// The blend's camera is orthographic; the print pass reads perspective depth, so the card
// looks along the same line from much further back with a narrow lens (nearly flat, but the
// orbit still gets a little real depth).
const CAMERA_DISTANCE = 24;

export async function mount(host) {
const canvas = host.$('#scene');
const stage = host.$('#stage');
const status = host.$('#status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(10, 4 / 3, 1, 80);
const tunable = !host.embedded && !host.world;
const tuning = tunable ? loadTuning(TUNE_KEY, TUNING) : {...TUNING};

// Rebuild a geometry as plain Float32 position / normal / uv with an index, so any of the
// model's parts can be merged together.
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
  const pass = new PrintPass(renderer);
  pass.set('riso', .62);
  pass.set('sketch', .46);
  pass.set('wobble', .22);
  for (const region of ['room', 'ball', 'foliage']) {
    pass.setGrade(region, 'exposure', region === 'foliage' ? .45 : .3);
    pass.setGrade(region, 'contrast', region === 'foliage' ? 1.2 : 1.05);
    pass.setGrade(region, 'shadows', .05);
    pass.setGrade(region, 'highlights', 0);
    pass.setGrade(region, 'saturation', 1);
    pass.setGrade(region, 'temperature', 0);
    pass.setGrade(region, 'tint', 0);
    pass.setGrade(region, 'value', 0);
  }

  const gltf = await gltfLoader().loadAsync(assetUrl('assets/lockers.glb?v=1'));
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const reference = gltf.cameras[0];
  reference.updateMatrixWorld(true);
  reference.removeFromParent();

  // ---- materials in our palette (colour only sets value: the print pass inks by brightness) ----
  const materials = new Map();
  function restyle(source) {
    if (materials.has(source)) return materials.get(source);
    const name = source.name || '';
    let material;
    let group;
    if (source.map) {   // the photographed, graffitied fronts
      material = new THREE.MeshStandardMaterial({map: source.map, roughness: .85, metalness: 0});
      material.userData.foliage = true;   // print pass: its own grade, so the drawings keep their detail
      group = 'graffiti';
    } else if (/brass/i.test(name)) { material = new THREE.MeshStandardMaterial({color: '#c79a62', roughness: .45, metalness: .1}); group = 'hardware'; }
    else if (/keyway|slot/i.test(name)) { material = new THREE.MeshStandardMaterial({color: '#0b0a1a', roughness: .8}); group = 'hardware'; }
    else if (/hardware/i.test(name)) { material = new THREE.MeshStandardMaterial({color: '#8c8aa0', roughness: .5, metalness: .1}); group = 'hardware'; }
    else if (/charcoal/i.test(name)) { material = new THREE.MeshStandardMaterial({color: '#3a3652', roughness: .78, metalness: .05}); group = 'darkSteel'; }
    else { material = new THREE.MeshStandardMaterial({color: '#4f6e86', roughness: .78, metalness: .05}); group = 'blueSteel'; }   // the blue locker
    material.userData.look = {group, base: material.color.clone()};
    materials.set(source, material);
    return material;
  }

  // ---- doors: one node per door (its hinge), parts merged per material ----
  // The blend has ~825 small parts; merged, each door is a handful of meshes and the cabinets a few more.
  const hinges = [];
  model.traverse(o => { if (/hinge.?pivot/i.test(o.name)) hinges.push(o); });
  const underHinge = new Set();
  for (const hinge of hinges) hinge.traverse(o => { if (o !== hinge) underHinge.add(o); });
  const doors = [];
  const doorMeshes = [];
  function mergeInto(parent, meshes, toLocal) {
    const byMaterial = new Map();
    for (const mesh of meshes) {
      const list = byMaterial.get(mesh.material) || [];
      list.push(plain(mesh.geometry, new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld)));
      byMaterial.set(mesh.material, list);
    }
    const made = [];
    for (const [material, list] of byMaterial) {
      const merged = new THREE.Mesh(mergeGeometries(list), restyle(material));
      parent.add(merged);
      made.push(merged);
    }
    return made;
  }
  const cabinetParts = [];   // collected first: the merged door meshes below must not join them
  model.traverse(o => { if (o.isMesh && !underHinge.has(o)) cabinetParts.push(o); });
  for (const hinge of hinges) {
    const parts = [];
    hinge.traverse(o => { if (o.isMesh) parts.push(o); });
    const toLocal = hinge.matrixWorld.clone().invert();
    for (const part of parts) part.removeFromParent();
    for (const child of [...hinge.children]) child.removeFromParent();   // leftover empties
    const made = mergeInto(hinge, parts, toLocal);
    const door = {hinge, rest: hinge.rotation.x, angle: 0, velocity: 0, target: 0, meshes: made};
    for (const mesh of made) { mesh.userData.door = door; doorMeshes.push(mesh); }
    doors.push(door);
  }
  const cabinets = new THREE.Group();
  for (const part of cabinetParts) part.removeFromParent();
  mergeInto(cabinets, cabinetParts, model.matrixWorld.clone().invert());
  model.add(cabinets);

  // The composition hangs from a pivot at its own centre, so tuning rotates it in place.
  const centre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  model.position.sub(centre);
  pivot.add(model);
  scene.add(pivot);
  function placeComposition() {
    const d = THREE.MathUtils.degToRad;
    pivot.rotation.set(d(tuning.rotateX), d(tuning.rotateY), d(tuning.rotateZ));
    pivot.scale.setScalar(tuning.scale);
    pivot.position.copy(centre).add(new THREE.Vector3(tuning.moveX, tuning.moveY, tuning.moveZ));
    pivot.updateMatrixWorld(true);
  }

  // ---- the blend's orthographic view, as a distant narrow perspective camera ----
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(reference.getWorldQuaternion(new THREE.Quaternion()));
  const eye = reference.getWorldPosition(new THREE.Vector3());
  const along = centre.clone().sub(eye).dot(forward);
  const home = {
    position: eye.clone().addScaledVector(forward, along - CAMERA_DISTANCE),
    quaternion: reference.getWorldQuaternion(new THREE.Quaternion()),
    aspect: (reference.right - reference.left) / (reference.top - reference.bottom),
    fov: THREE.MathUtils.radToDeg(2 * Math.atan(((reference.top - reference.bottom) / 2 / reference.zoom) / CAMERA_DISTANCE)),
  };
  camera.near = CAMERA_DISTANCE * .5;
  camera.far = CAMERA_DISTANCE * 1.6;

  const sky = new THREE.HemisphereLight('#efe6f2', '#2c2442', 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight('#fff1de', 2.6);
  key.position.copy(centre).add(new THREE.Vector3(-3, 5, 6));
  key.target.position.copy(centre);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#c9c2ff', .7);
  fill.position.copy(centre).add(new THREE.Vector3(5, 2, 3));
  scene.add(fill);

  // ---- look: print grades, material brightness and light, all from tuning ----
  const GRADES = {lockers: 'room', graffiti: 'foliage'};
  function applyLook() {
    pass.set('riso', tuning.riso);
    pass.set('sketch', tuning.sketch);
    for (const [name, region] of Object.entries(GRADES))
      for (const g of ['Exposure', 'Contrast', 'Shadows', 'Highlights', 'Value']) pass.setGrade(region, g.toLowerCase(), tuning[name + g]);
    for (const material of materials.values()) material.color.copy(material.userData.look.base).multiplyScalar(tuning[material.userData.look.group]);
    sky.intensity = 1.5 * tuning.light;
    key.intensity = 2.6 * tuning.light;
    fill.intensity = .7 * tuning.light;
  }

  // ---- pointer: hovering a door hints it can open ----
  const raycaster = new THREE.Raycaster();
  const pointer = {inside: false, ndc: new THREE.Vector2(), moved: -Infinity};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, visible = true, mapShown = true, lastDraw = -Infinity, size = {width: 1, height: 1}, hovered = null;
  function pointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
    pointer.inside = true;
    pointer.moved = performance.now();
    wake();
  }
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; wake(); });
  function pick() {
    if (!pointer.inside) return null;
    raycaster.setFromCamera(pointer.ndc, camera);
    // The cabinets can hide a door's lower edge, so test everything and take the first hit.
    const hits = raycaster.intersectObject(model, true);
    // Sticky hover: an opening door swings out from under the pointer and exposes its neighbour,
    // which used to flip the hover back and forth between two doors (and their sounds). Keep the
    // current door while the ray still touches it anywhere, and never switch unless the pointer moved.
    if (hovered && (pointer.moved === pickedAt || hits.some(h => h.object.userData.door === hovered))) return hovered;
    pickedAt = pointer.moved;
    return hits[0]?.object.userData.door || null;
  }
  let pickedAt = -Infinity;
  // Later: a click opens the door fully and a letter slides out.
  // function openDoor(door) { door.target = FULL_OPEN * .8; ... }

  // ---- sound: the supplied locker recording, split in two. locker-open.mp3 (≈18.1–19.3 s:
  // latch and swing) plays once as a door starts to open under the pointer, and nothing more
  // while it stays open; locker-close.mp3 (≈19.3–20.2 s) plays as it swings shut when the
  // pointer leaves. Each door keeps one voice, so a quick open→close cuts the opening short
  // instead of overlapping it. Browsers only allow sound after a click or key press on the
  // page, so until then the doors move silently.
  const doorSound = (() => {
    let context, loading;
    const clips = {open: null, close: null};
    function trimmed(decoded) {   // skip the frame-aligned lead-in so the attack meets the cue
      const samples = decoded.getChannelData(0);
      let peak = 0;
      for (const s of samples) peak = Math.max(peak, Math.abs(s));
      const first = samples.findIndex(s => Math.abs(s) > Math.max(.003, peak * .05));
      return {buffer: decoded, offset: Math.max(0, first / decoded.sampleRate - .005)};
    }
    function load() {
      context ||= new AudioContext();
      loading ||= Promise.all(Object.keys(clips).map(name => fetch(assetUrl(`./assets/locker-${name}.mp3`))
        .then(r => { if (!r.ok) throw Error(`Locker ${name} sound unavailable`); return r.arrayBuffer(); })
        .then(data => context.decodeAudioData(data)).then(decoded => { clips[name] = trimmed(decoded); })))
        .catch(error => { loading = null; console.error('Locker sound:', error); });
      return context.resume().catch(() => {});
    }
    canvas.addEventListener('pointerdown', load);
    function stopAll() { if (context?.state === 'running') context.suspend().catch(() => {}); }
    addEventListener('pagehide', stopAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
    load();   // fetch now so the first hover isn't silent
    // Softened: a low level and a gentle low-pass that takes the metallic edge off.
    const LEVEL = .3, CUTOFF = 3200;
    let voice = null, pending = null;
    function fadeOut(now) {
      if (!voice) return;
      const g = voice.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + .05);
      voice.source.stop(now + .06);
      voice = null;
    }
    function play(name) {
      if (!context) return;
      if (context.state !== 'running') load();
      const clip = clips[name];
      if (!clip || context.state !== 'running') return;
      const now = context.currentTime;
      fadeOut(now);   // only ever one locker sound at a time
      const source = context.createBufferSource(), soft = context.createBiquadFilter(), gain = context.createGain();
      source.buffer = clip.buffer;
      soft.type = 'lowpass'; soft.frequency.value = CUTOFF; soft.Q.value = .5;
      const length = clip.buffer.duration - clip.offset;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(LEVEL, now + .01);
      gain.gain.setValueAtTime(LEVEL, now + Math.max(.02, length - .06));
      gain.gain.linearRampToValueAtTime(0, now + length);
      source.connect(soft).connect(gain).connect(soundOutput(context));
      const mine = {source, gain};
      source.onended = () => { source.disconnect(); soft.disconnect(); gain.disconnect(); if (voice === mine) voice = null; };
      source.start(now, clip.offset);
      voice = mine;
    }
    return {
      // Called every frame for every door: true while the door is (or is heading) open.
      // Changes are only noted here; flush() picks one sound for the whole frame.
      door(door, open) {
        const state = open ? 'open' : 'closed';
        door.sound ||= 'closed';
        if (door.sound === state) return;
        door.sound = state;
        if (open || pending !== 'open') pending = open ? 'open' : 'close';   // moving door to door: just the opening
      },
      flush() { if (pending) play(pending); pending = null; },
    };
  })();

  // ---- soft orbit: the view turns a few degrees around the lockers ----
  // In the exhibition the world's pan drives it (a card off to one side is seen a little from
  // that side); the pointer adds a smaller turn.
  const mapLook = new THREE.Vector2(), orbitGoal = new THREE.Vector2(), orbitNow = new THREE.Vector2();
  const turn = new THREE.Quaternion(), turnB = new THREE.Quaternion(), axis = new THREE.Vector3();
  host.installMapBridge?.({
    viewport: m => {
      mapShown = m.visible !== false;
      mapLook.set(THREE.MathUtils.clamp((m.localPanX || 0) / Math.max(1, size.width), -1.5, 1.5),
        THREE.MathUtils.clamp((m.localPanY || 0) / Math.max(1, size.height), -1.5, 1.5));
      if (m.overview) mapLook.set(0, 0);
      wake();
    },
  });
  function frameCamera(dt) {
    const look = THREE.MathUtils.degToRad(tuning.orbit);
    orbitGoal.copy(mapLook).multiplyScalar(.7);
    if (pointer.inside && !reduced) orbitGoal.addScaledVector(pointer.ndc, .3);
    orbitGoal.clampScalar(-1, 1);
    orbitNow.x = THREE.MathUtils.damp(orbitNow.x, orbitGoal.x, 3, dt);
    orbitNow.y = THREE.MathUtils.damp(orbitNow.y, orbitGoal.y, 3, dt);
    const c = pivot.position;
    turn.setFromAxisAngle(axis.set(0, 1, 0).applyQuaternion(home.quaternion), -orbitNow.x * look);
    turnB.setFromAxisAngle(axis.set(1, 0, 0).applyQuaternion(home.quaternion), -orbitNow.y * look * .7);
    turn.multiply(turnB);
    camera.position.copy(home.position).sub(c).applyQuaternion(turn).add(c);
    camera.quaternion.copy(turn).multiply(home.quaternion);
    // Keep the blend's framing: its full width on narrower frames, its full height on wider ones.
    const aspect = size.width / size.height;
    const base = aspect >= home.aspect ? home.fov
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(home.fov) / 2) * home.aspect / aspect));
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) / tuning.zoom));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  // Doors swing on a lightly under-damped spring: a small settle, like a sprung hinge.
  function swing(dt) {
    let moving = false;
    for (const door of doors) {
      door.target = door === hovered ? THREE.MathUtils.degToRad(tuning.peek) : 0;
      doorSound.door(door, door === hovered);   // the clip starts on the same frame the swing does
      for (let i = 0; i < 3; i++) {
        const h = dt / 3;
        door.velocity += (-140 * (door.angle - door.target) - 16 * door.velocity) * h;
        door.angle += door.velocity * h;
      }
      if (reduced) { door.angle = door.target; door.velocity = 0; }
      door.hinge.rotation.x = door.rest + door.angle;
      if (Math.abs(door.angle - door.target) > 1e-4 || Math.abs(door.velocity) > 1e-3) moving = true;
    }
    doorSound.flush();
    return moving;
  }

  function wake() { if (!raf && visible && mapShown && !document.hidden) raf = requestAnimationFrame(draw); }
  let swinging = false;
  function draw(time) {
    raf = 0;
    if (!visible || !mapShown || document.hidden) return;
    const active = pointer.inside && time - pointer.moved < 1500 || swinging;
    if (!active && time - lastDraw < 1000 / 30) { wake(); return; }
    const dt = Math.min(.05, (time - lastDraw) / 1000 || .016);
    lastDraw = time;
    placeComposition();
    applyLook();
    frameCamera(dt);
    hovered = pick();
    canvas.style.cursor = hovered ? 'pointer' : '';
    swinging = swing(dt);
    pass.render(scene, camera, time / 1000);
    canvas.dataset.state = 'ready';
    canvas.dataset.door = hovered ? String(doors.indexOf(hovered)) : '';
    const settling = orbitNow.distanceToSquared(orbitGoal) > 1e-6;
    if (!reduced || active || settling || swinging) wake();
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
  if (tunable) tuningPanel(host, tuning, {defaults: TUNING, ranges: RANGES, sections: SECTIONS, storageKey: TUNE_KEY, changed: wake});
  document.addEventListener('visibilitychange', wake);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }).observe(stage);
  new ResizeObserver(resize).observe(stage);
  status.hidden = true;
  resize();
} catch (error) {
  console.error(error);
  status.textContent = 'The lockers could not load. Reload to try again.';
}
}
