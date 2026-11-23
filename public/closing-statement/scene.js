import * as THREE from '../shared/vendor/three.module.js';
import {gltfLoader} from '../shared/gltf.js';
import {PrintPass} from '../shared/print-pass.js';

// Closing Statement / Reflections: the floating mirror composition from
// "Mirror Composition.blend" (tools/export-reflections.py), seen through its reference camera.
// Every mirror is a live planar reflection. The pointer stays the ordinary cursor; while it is
// over the card an arrow floats where it points, visible only inside the mirrors.

const assetUrl = path => new URL(path, import.meta.url).href;
const GLASS = 'Polished mirror silver';
const ENV_LAYER = 1;                 // seen only by the mirrors' reflection cameras

// Framing and effect settings. Tune them on the standalone page (/closing-statement/, Tune panel),
// press "Copy settings" and paste the result over this object.
export const TUNING = {
  rotateX: -91, rotateY: 3, rotateZ: -1, // composition rotation in degrees, about its own centre
  moveX: 0, moveY: 0, moveZ: 0,         // composition offset in world units
  scale: 1,                             // composition scale
  zoom: 1,                              // >1 zooms the reference camera in
  arrowSize: .4,                        // reflected arrow height, in tenths of the view height
  arrowFloat: 1.77,                     // how far the arrow hovers in front of the glass: 0 = image exactly
                                        // under the cursor, more = tilted mirrors shift it further off
  orbit: 20,                            // soft orbit range in degrees (map pan and pointer turn the view)
};
const TUNE_KEY = 'closing-statement-tuning-v2';
const RANGES = {
  rotateX: [-180, 180, 1], rotateY: [-180, 180, 1], rotateZ: [-180, 180, 1],
  moveX: [-6, 6, .05], moveY: [-6, 6, .05], moveZ: [-6, 6, .05],
  scale: [.3, 2.5, .01], zoom: [.4, 2.5, .01],
  arrowSize: [.1, 2, .01], arrowFloat: [0, 2, .01], orbit: [0, 25, .5],
};

export async function mount(host) {
const canvas = host.$('#scene');
const stage = host.$('#stage');
const status = host.$('#status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(51.8, 1.6446, .1, 80);
camera.layers.enable(0);

const tuning = {...TUNING};
const tunable = !host.embedded && !host.world;
if (tunable) {
  try { Object.assign(tuning, JSON.parse(localStorage.getItem(TUNE_KEY) || '{}')); } catch {}
}

// ---- what the mirrors see beyond the composition: a dim violet sky with one soft lamp ----
function environment() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 dir;void main(){dir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 dir;
      void main(){
        float up=dir.y*.5+.5;
        vec3 low=vec3(.012,.014,.05),mid=vec3(.09,.045,.16),high=vec3(.05,.06,.19);
        vec3 c=mix(low,mid,smoothstep(.15,.55,up));c=mix(c,high,smoothstep(.55,1.0,up));
        c*=.6;
        c+=vec3(.32,.06,.22)*pow(1.0-abs(dir.y),9.0)*.35;                // pink horizon band
        c+=vec3(1.0,.82,.95)*smoothstep(.985,.997,dot(dir,normalize(vec3(-.35,.9,.25))))*.5; // lamp
        c+=vec3(.5,.55,1.0)*smoothstep(.988,.998,dot(dir,normalize(vec3(.55,.75,-.4))))*.3;
        gl_FragColor=vec4(c,1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), material);
  sky.layers.set(ENV_LAYER);
  sky.frustumCulled = false;
  return sky;
}

// ---- the pointer as an object: a classic arrow, extruded, one unit tall ----
function arrowGeometry(outline = .035, depth = .14) {
  const s = new THREE.Shape();
  const pts = [[0, 0], [0, -1], [.25, -.77], [.43, -1.16], [.6, -1.08], [.42, -.7], [.74, -.7]];
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelThickness: Math.min(.035, depth), bevelSize: outline, bevelSegments: 2});
  g.translate(0, 0, -depth / 2);     // tip at the origin, body down and right, like a screen cursor
  return g;
}

try {
  const renderer = host.createRenderer({canvas, antialias: true});
  const pass = new PrintPass(renderer);
  pass.set('riso', .62);
  pass.set('sketch', .46);
  pass.set('wobble', .22);
  for (const region of ['room', 'ball', 'foliage']) {
    // Glass ('ball', the accent region) prints dark violet so the bright arrow pops inside it.
    pass.setGrade(region, 'exposure', region === 'ball' ? -.35 : .25);
    pass.setGrade(region, 'contrast', region === 'ball' ? 1.35 : 1.05);
    pass.setGrade(region, 'shadows', .05);
    pass.setGrade(region, 'highlights', 0);
    pass.setGrade(region, 'saturation', 1);
    pass.setGrade(region, 'temperature', 0);
    pass.setGrade(region, 'tint', 0);
    pass.setGrade(region, 'value', 0);
  }

  const gltf = await gltfLoader().loadAsync(assetUrl('assets/mirrors.glb?v=1'));
  const reference = gltf.cameras[0];
  gltf.scene.updateMatrixWorld(true);
  reference.updateMatrixWorld(true);
  const home = {position: reference.getWorldPosition(new THREE.Vector3()), quaternion: reference.getWorldQuaternion(new THREE.Quaternion()),
    fov: reference.fov, aspect: reference.aspect};
  reference.removeFromParent();

  // The composition hangs from a pivot at its own centre, so tuning rotates it in place.
  const centre = new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  gltf.scene.position.sub(centre);
  pivot.add(gltf.scene);
  scene.add(pivot);
  function placeComposition() {
    const d = THREE.MathUtils.degToRad;
    pivot.rotation.set(d(tuning.rotateX), d(tuning.rotateY), d(tuning.rotateZ));
    pivot.scale.setScalar(tuning.scale);
    pivot.position.copy(centre).add(new THREE.Vector3(tuning.moveX, tuning.moveY, tuning.moveZ));
    pivot.updateMatrixWorld(true);
  }

  // Our palette instead of the blend's metals: violet-charcoal frames, darker edges.
  const frame = new THREE.MeshStandardMaterial({color: '#3a3554', roughness: .62, metalness: .05});
  const edge = new THREE.MeshStandardMaterial({color: '#221d3b', roughness: .7});
  const mirrors = [];
  const glassMeshes = [];
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.name === GLASS) glassMeshes.push(o);
    else o.material = o.material.name === 'Dark frame edges' ? edge : frame;
  });
  for (const mesh of glassMeshes) {
    // Each mirror has one flat glass face: keep its plane in the mesh's own space.
    const g = mesh.geometry;
    g.computeBoundingBox();
    const localNormal = new THREE.Vector3();
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) localNormal.x += n.getX(i), localNormal.y += n.getY(i), localNormal.z += n.getZ(i);
    localNormal.normalize();
    const target = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: true});
    const textureMatrix = new THREE.Matrix4();
    mesh.material = new THREE.ShaderMaterial({
      uniforms: {reflection: {value: target.texture}, textureMatrix: {value: textureMatrix}, live: {value: 0},
        wipe: {value: -1}, wipeAt: {value: new THREE.Vector3()}, wipeReach: {value: g.boundingBox.getSize(new THREE.Vector3()).length()}},
      vertexShader: `uniform mat4 textureMatrix;varying vec4 vUv;varying vec3 vNormal,vView,vLocal;
        void main(){vUv=textureMatrix*vec4(position,1.0);vLocal=position;vec4 w=modelMatrix*vec4(position,1.0);vNormal=normalize(mat3(modelMatrix)*normal);vView=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform sampler2D reflection;uniform float live,wipe,wipeReach;uniform vec3 wipeAt;varying vec4 vUv;varying vec3 vNormal,vView,vLocal;
        void main(){
          vec3 r=texture2DProj(reflection,vUv).rgb*live;
          float fresnel=pow(1.0-abs(dot(vNormal,vView)),3.0);
          vec3 silver=vec3(.035,.032,.06)+vec3(.12,.1,.2)*fresnel;
          vec3 c=r*.9+silver;
          // Click wipe: a bright ring runs out across the glass from where it was pressed,
          // with a faint sheen trailing inside it, fading as it travels.
          if(wipe>=0.0&&wipe<1.0){
            float d=distance(vLocal,wipeAt),front=wipe*wipeReach,width=wipeReach*.05;
            float ring=exp(-pow((d-front)/width,2.0));
            float trail=smoothstep(front-wipeReach*.35,front,d)*step(d,front)*.35;
            c+=vec3(1.0,.86,.96)*(ring*1.3+trail)*(1.0-wipe)*(1.0-wipe);
          }
          gl_FragColor=vec4(c,1.0);
        }`,
    });
    mesh.material.userData.accent = true;   // print pass: mirror glass in the pink / violet ink family
    let root = mesh;
    while (root.parent !== gltf.scene) root = root.parent;
    mirrors.push({mesh, localNormal, localCentre: g.boundingBox.getCenter(new THREE.Vector3()),
      normal: new THREE.Vector3(), centre: new THREE.Vector3(), target, textureMatrix, camera: new THREE.PerspectiveCamera(),
      root, rest: {position: root.position.clone(), quaternion: root.quaternion.clone()}, press: null});
  }

  // ---- pressing a mirror: it gives a little under the click and springs back ----
  // An under-damped spring, so it overshoots and settles like glass hung on taut wires.
  // The mirror tips about its centre (more when pressed near an edge) and sinks a touch along
  // its normal; a wipe of light runs out across the glass from the pressed point.
  const PRESS = {stiffness: 95, damping: 6.5, tilt: THREE.MathUtils.degToRad(5), sink: .07, wipeTime: .9};
  const parentInverse = new THREE.Matrix4(), pressTurn = new THREE.Quaternion(), lever = new THREE.Vector3();
  function press(m, point) {
    m.mesh.updateWorldMatrix(true, false);
    parentInverse.copy(m.root.parent.matrixWorld).invert();
    const n = new THREE.Vector3().copy(m.localNormal).transformDirection(m.mesh.matrixWorld);
    const c = new THREE.Vector3().copy(m.localCentre).applyMatrix4(m.mesh.matrixWorld);
    lever.subVectors(point, c);
    const reach = m.mesh.material.uniforms.wipeReach.value * .5 * m.mesh.matrixWorld.getMaxScaleOnAxis();
    // Pushing in at `point` tips the mirror about the axis lever x n, through its centre.
    const axis = new THREE.Vector3().crossVectors(lever, n);
    const amount = Math.min(1, lever.length() / Math.max(reach, .001));
    m.press = {
      axis: axis.lengthSq() > 1e-8 ? axis.normalize().transformDirection(parentInverse) : new THREE.Vector3(1, 0, 0),
      centre: c.applyMatrix4(parentInverse), normal: n.transformDirection(parentInverse),
      lean: .35 + .65 * amount, x: m.press?.x ?? 0, v: (m.press?.v ?? 0) + 1, wipe: 0,
    };
    m.mesh.material.uniforms.wipeAt.value.copy(point).applyMatrix4(m.mesh.matrixWorld.clone().invert());
    wake();
  }
  function settle(dt) {
    let busy = false;
    for (const m of mirrors) {
      const p = m.press;
      if (!p) continue;
      for (let step = 0; step < 4; step++) {   // small steps keep the spring stable at low frame rates
        const h = dt / 4;
        p.v += (-PRESS.stiffness * p.x - PRESS.damping * p.v) * h;
        p.x += p.v * h;
      }
      p.wipe += dt / PRESS.wipeTime;
      m.mesh.material.uniforms.wipe.value = p.wipe < 1 ? p.wipe : -1;
      const x = reduced ? 0 : p.x;
      pressTurn.setFromAxisAngle(p.axis, x * PRESS.tilt * p.lean * 6);
      m.root.quaternion.copy(pressTurn).multiply(m.rest.quaternion);
      m.root.position.copy(m.rest.position).sub(p.centre).applyQuaternion(pressTurn).add(p.centre)
        .addScaledVector(p.normal, -x * PRESS.sink * 6);
      if (Math.abs(p.x) < 1e-4 && Math.abs(p.v) < 1e-3 && p.wipe >= 1) {
        m.root.position.copy(m.rest.position);
        m.root.quaternion.copy(m.rest.quaternion);
        m.press = null;
      } else busy = true;
    }
    return busy;
  }

  scene.add(environment());
  scene.add(new THREE.HemisphereLight('#eee4ef', '#3d3050', 1.4));
  const sun = new THREE.DirectionalLight('#fff0da', 2.4);
  sun.position.set(-4, 9, 3);
  scene.add(sun);

  // The arrow exists only for the mirrors (layer 1), and only while the pointer is over the card.
  // Each mirror gets it placed for itself (see placeArrow), so its image lands near the cursor.
  // Like a screen cursor it is a light arrow with a dark outline: the print pass inks the glass by
  // brightness alone, so a single-tone arrow vanishes wherever the reflected sky matches it.
  const arrow = new THREE.Group();
  const fill = new THREE.Mesh(arrowGeometry(.02, .01), new THREE.MeshBasicMaterial({color: new THREE.Color(1.6, 1.45, 1.55)}));
  const rim = new THREE.Mesh(arrowGeometry(.1, .01), new THREE.MeshBasicMaterial({color: '#07051a'}));
  rim.position.z = -.5;              // behind the fill, as seen by the viewer
  arrow.add(fill, rim);
  for (const o of [arrow, fill, rim]) o.layers.set(ENV_LAYER);
  arrow.matrixAutoUpdate = false;
  arrow.visible = false;
  scene.add(arrow);
  const image = new THREE.Matrix4();
  const cursorRay = new THREE.Ray(), glassPlane = new THREE.Plane(), mirrorMatrix = new THREE.Matrix4();
  const tip = new THREE.Vector3(), across = new THREE.Vector3(), up = new THREE.Vector3(), depth = new THREE.Vector3();
  const ndc = new THREE.Vector2(), aim = new THREE.Vector2();   // aim: the pointer, fixed for the frame
  function onGlass(x, y, out) {
    raycaster.setFromCamera(ndc.set(x, y), camera);
    return raycaster.ray.intersectPlane(glassPlane, out);
  }
  // Where should the arrow be for mirror m? Build its mirror image first, then reflect that
  // through the mirror's plane to get the real arrow in front of the glass.
  // The image is a decal lying in the glass plane, shaped so that from the viewer it looks like
  // an ordinary upright cursor of `arrowSize` with its tip under the pointer. It is then sunk
  // `arrowFloat` into the mirror, scaled by how squarely the mirror faces the viewer: that sinking
  // is what the mirror's tilt turns into a small offset (at most about arrowFloat), so the
  // reflection drifts a little off the cursor without ever running away from it.
  function placeArrow(m) {
    if (!pointer.inside) return false;
    const n = m.normal;
    const facing = -cursorRay.direction.dot(n);
    if (facing <= .02) return false;
    glassPlane.setFromNormalAndCoplanarPoint(n, m.centre);
    const h = tuning.arrowSize * .2, w = h / camera.aspect;   // arrow height / width in NDC
    if (!onGlass(aim.x, aim.y, tip) || !onGlass(aim.x + w, aim.y, across) || !onGlass(aim.x, aim.y + h, up)) return false;
    across.sub(tip);
    up.sub(tip);
    depth.copy(n).multiplyScalar(.02);
    tip.addScaledVector(n, -(tuning.arrowFloat * facing + .025));
    // local (x, y, z) -> tip + x*across + y*up + z*depth; the shape points down (-y) from its tip
    image.set(
      across.x, up.x, depth.x, tip.x,
      across.y, up.y, depth.y, tip.y,
      across.z, up.z, depth.z, tip.z,
      0, 0, 0, 1);
    const d = 2 * n.dot(m.centre);
    mirrorMatrix.set(
      1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, d * n.x,
      -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, d * n.y,
      -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, d * n.z,
      0, 0, 0, 1);
    arrow.matrix.multiplyMatrices(mirrorMatrix, image);
    arrow.matrixWorldNeedsUpdate = true;
    return true;
  }

  // ---- planar reflections (as three.js Reflector, but updated explicitly once per frame) ----
  const bias = new THREE.Matrix4().set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
  const view = new THREE.Vector3(), lookAt = new THREE.Vector3(), target = new THREE.Vector3();
  const rotation = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const camPos = new THREE.Vector3();
  function reflect(m) {
    m.normal.copy(m.localNormal).transformDirection(m.mesh.matrixWorld);
    m.centre.copy(m.localCentre).applyMatrix4(m.mesh.matrixWorld);
    camera.getWorldPosition(camPos);
    view.subVectors(m.centre, camPos);
    const live = view.dot(m.normal) < 0;
    m.mesh.material.uniforms.live.value = live ? 1 : 0;
    if (!live) return;                       // seen from behind: the frame's back hides the glass anyway
    view.reflect(m.normal).negate().add(m.centre);
    rotation.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rotation).add(camPos);
    target.subVectors(m.centre, lookAt).reflect(m.normal).negate().add(m.centre);
    const v = m.camera;
    v.position.copy(view);
    v.up.set(0, 1, 0).applyMatrix4(rotation).reflect(m.normal);
    v.lookAt(target);
    v.far = camera.far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix);
    v.layers.enable(ENV_LAYER);
    m.textureMatrix.copy(bias).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse).multiply(m.mesh.matrixWorld);
    // Oblique near plane at the glass so nothing behind the mirror leaks into its reflection.
    plane.setFromNormalAndCoplanarPoint(m.normal, m.centre).applyMatrix4(v.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = v.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1 - .003; p[14] = clip.w;
    v.projectionMatrixInverse.copy(v.projectionMatrix).invert();
    m.mesh.visible = false;
    arrow.visible = placeArrow(m);
    renderer.setRenderTarget(m.target);
    renderer.clear();
    renderer.render(scene, v);
    arrow.visible = false;
    m.mesh.visible = true;
  }

  // ---- pointer → a point on the arrow's plane ----
  const raycaster = new THREE.Raycaster();
  const pointer = {inside: false, ndc: new THREE.Vector2(), moved: -Infinity};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, visible = true, lastDraw = -Infinity, size = {width: 1, height: 1};

  function pointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
    pointer.inside = true;
    pointer.moved = performance.now();
    wake();
  }
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerdown', pointerMove);
  canvas.addEventListener('pointerleave', () => { pointer.inside = false; wake(); });
  // A click (not a drag) on a mirror presses it. In the exhibition a drag pans the world and
  // only clicks reach the card, so the click event is the one to listen to.
  const clickRay = new THREE.Raycaster();
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    clickRay.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), camera);
    const hit = clickRay.intersectObject(gltf.scene, true)[0];
    if (!hit) return;
    let root = hit.object;
    while (root.parent !== gltf.scene) root = root.parent;
    const m = mirrors.find(mirror => mirror.root === root);
    if (m) press(m, hit.point);
  });

  // ---- soft orbit: the view turns a few degrees around the composition ----
  // In the exhibition the world's pan drives it (a card off to the right is seen a little from
  // its left, as if the mirrors were really standing in the room); the pointer adds a smaller turn.
  const mapLook = new THREE.Vector2();          // card offset from the screen centre, in card widths / heights
  const orbitGoal = new THREE.Vector2(), orbitNow = new THREE.Vector2();
  const orbitTurn = new THREE.Quaternion(), axis = new THREE.Vector3(), turnB = new THREE.Quaternion();
  let mapShown = true;
  host.installMapBridge?.({
    viewport: m => {
      mapShown = m.visible !== false;
      mapLook.set(THREE.MathUtils.clamp((m.localPanX || 0) / Math.max(1, size.width), -1.5, 1.5),
        THREE.MathUtils.clamp((m.localPanY || 0) / Math.max(1, size.height), -1.5, 1.5));
      if (m.overview) mapLook.set(0, 0);
      wake();
    },
  });

  function wake() { if (!raf && visible && mapShown && !document.hidden) raf = requestAnimationFrame(draw); }
  function frameCamera(dt) {
    const look = tuning.orbit * Math.PI / 180;
    orbitGoal.copy(mapLook).multiplyScalar(.7);
    if (pointer.inside && !reduced) orbitGoal.addScaledVector(pointer.ndc, .3);
    orbitGoal.clampScalar(-1, 1);
    orbitNow.x = THREE.MathUtils.damp(orbitNow.x, orbitGoal.x, 3, dt);
    orbitNow.y = THREE.MathUtils.damp(orbitNow.y, orbitGoal.y, 3, dt);
    // Turn about the composition's centre: sideways about the camera's up axis, up/down about its right axis.
    const centre = pivot.position;
    orbitTurn.setFromAxisAngle(axis.set(0, 1, 0).applyQuaternion(home.quaternion), -orbitNow.x * look);
    turnB.setFromAxisAngle(axis.set(1, 0, 0).applyQuaternion(home.quaternion), -orbitNow.y * look * .7);
    orbitTurn.multiply(turnB);
    camera.position.copy(home.position).sub(centre).applyQuaternion(orbitTurn).add(centre);
    camera.quaternion.copy(orbitTurn).multiply(home.quaternion);
    // Keep the reference framing: its full width on narrower frames, its full height on wider ones.
    const aspect = size.width / size.height;
    const base = aspect >= home.aspect ? home.fov
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(home.fov) / 2) * home.aspect / aspect));
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) / tuning.zoom));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function draw(time) {
    raf = 0;
    if (!visible || !mapShown || document.hidden) return;
    const pressing = mirrors.some(m => m.press);
    const active = pointer.inside && time - pointer.moved < 1500 || pressing;
    // Full rate while the pointer moves or a mirror springs, 30 fps otherwise (the print grain keeps boiling).
    if (!active && time - lastDraw < 1000 / 30) { wake(); return; }
    const dt = Math.min(.05, (time - lastDraw) / 1000 || .016);
    lastDraw = time;
    const springing = settle(dt);
    placeComposition();
    frameCamera(dt);

    if (pointer.inside) {
      aim.copy(pointer.ndc);
      raycaster.setFromCamera(aim, camera);
      cursorRay.copy(raycaster.ray);
    }

    for (const m of mirrors) reflect(m);
    pass.render(scene, camera, time / 1000);
    canvas.dataset.state = 'ready';
    const settling = orbitNow.distanceToSquared(orbitGoal) > 1e-6;
    if (!reduced || active || settling || springing) wake();
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
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(.75);   // the small arrow must survive the halftone
    for (const m of mirrors) m.target.setSize(Math.max(1, Math.round(buffer.x)), Math.max(1, Math.round(buffer.y)));
    wake();
  }
  if (tunable) tuningPanel(host, tuning, () => {
    try { localStorage.setItem(TUNE_KEY, JSON.stringify(tuning)); } catch {}
    wake();
  });
  document.addEventListener('visibilitychange', wake);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }).observe(stage);
  new ResizeObserver(resize).observe(stage);
  status.hidden = true;
  resize();
} catch (error) {
  console.error(error);
  status.textContent = 'The mirrors could not load. Reload to try again.';
}
}

// ---- temporary framing controls (standalone page only) ----
function tuningPanel(host, tuning, changed) {
  const panel = document.createElement('details');
  panel.open = true;
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10;width:250px;max-height:calc(100vh - 24px);overflow:auto;background:#1a1d4aee;border:1px solid #8176a1;border-radius:10px;padding:8px 12px;font:12px system-ui,sans-serif;color:#e5d1ea';
  panel.innerHTML = '<summary style="cursor:pointer;font-weight:600">Tune framing</summary>';
  const inputs = {};
  for (const [key, [min, max, step]] of Object.entries(RANGES)) {
    const row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 52px;gap:2px 6px;margin:8px 0 0';
    row.innerHTML = `<span>${key}</span><input type="number" min="${min}" max="${max}" step="${step}" style="width:52px;background:transparent;color:inherit;border:1px solid #45456e;border-radius:4px"><input type="range" min="${min}" max="${max}" step="${step}" style="grid-column:1/3;width:100%">`;
    const [number, range] = row.querySelectorAll('input');
    const set = value => {
      tuning[key] = +value;
      number.value = range.value = tuning[key];
      changed();
    };
    number.addEventListener('input', () => set(number.value));
    range.addEventListener('input', () => set(range.value));
    number.value = range.value = tuning[key];
    inputs[key] = {number, range};
    panel.append(row);
  }
  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:6px;margin:12px 0 4px';
  const button = (label, action) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'flex:1;color:inherit;background:transparent;border:1px solid #8176a1;border-radius:14px;padding:5px 8px;cursor:pointer';
    b.onclick = action;
    buttons.append(b);
    return b;
  };
  const copy = button('Copy settings', async () => {
    const text = JSON.stringify(Object.fromEntries(Object.keys(RANGES).map(k => [k, tuning[k]])), null, 2);
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch { prompt('Copy these settings', text); }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1500);
  });
  button('Reset', () => {
    Object.assign(tuning, TUNING);
    for (const [key, {number, range}] of Object.entries(inputs)) number.value = range.value = tuning[key];
    changed();
  });
  panel.append(buttons);
  host.body.append(panel);
}
