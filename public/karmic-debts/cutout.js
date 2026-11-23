import * as THREE from '../shared/vendor/three.module.js';

// The paper cut-out of the Karmic Debts room, built the way In the Life Of and the disco room cut
// theirs (shared/cutout/stage-clipping.js):
//
// - The wide outline (traced from the annotation) is a hard-edged mask with a slightly fibrous
//   paper edge, projected from the un-orbited wide camera onto the world. Every surface keeps or
//   drops its pixels by its world position, so the cut lives on the geometry: as the view orbits,
//   the edges slide along walls, floor and furniture. It stays on in both views.
// - Zooming in, straight world-space clipping planes sweep in through the room, one after another,
//   stepped with the zoom, until they stand on the close outline. The room shell (walls, floor,
//   partition, ceiling, services) takes the planes tight; the furniture around the table (table,
//   benches, stool, chairs, props) takes a looser set, so it stays whole and pokes out past the
//   shell's cut edge, as in the close annotation (the stool notch, the bench end).
// - Colour, normal/depth and shadow passes share the cut.

// Wide outline, image pixels of a 1.4 card. Points beyond the image carry it along the frame edge.
export const WIDE_OUTLINE = {width: 1001, height: 710, points: [
  [20, 80], [95, 92], [278, 95], [270, 40], [258, -80], [415, -80], [420, 2], [560, 22], [668, 55],
  [760, 40], [845, 2], [845, -80], [960, -80], [958, 15], [935, 90], [918, 135], [990, 122], [1090, 122],
  [1090, 320], [975, 400], [950, 480], [930, 580], [915, 668], [830, 610], [740, 550], [600, 590],
  [480, 612], [472, 652], [410, 655], [400, 690], [402, 790], [300, 790], [300, 640], [270, 610],
  [215, 600], [190, 625], [170, 652], [162, 640], [150, 560], [145, 450], [80, 455], [-6, 465],
  [95, 385], [100, 340], [85, 210], [40, 110],
]};

// Close cut planes, measured from the close annotation (its outline raycast into the room from the
// close camera), metres, y up. Kept where normal · p + constant >= 0.
const FRONT = new THREE.Vector3(.46, 0, -.89).normalize();   // across the floor in front of the table
export const CLOSE_PLANES = {
  //            wide (out of the room)   shell (tight)   furniture (loose)
  left:  {normal: new THREE.Vector3(1, 0, 0),  wide: 12, shell: .05,  furniture: .45},   // x >= -c: at the column
  top:   {normal: new THREE.Vector3(0, -1, 0), wide: 12, shell: 1.55, furniture: 1.6},   // y <= c: across the walls
  right: {normal: new THREE.Vector3(0, 0, -1), wide: 12, shell: .45,  furniture: 1.2},   // z <= c: the partition's near end
  front: {normal: FRONT,                       wide: 12, shell: -.38, furniture: .5},    // the floor before the table (furniture: the whole round top)
};
// When each plane travels during the zoom (fractions of it), staggered like In the Life Of's.
const PHASES = {right: [0, .9], left: [.06, .95], front: [.1, 1], top: [.16, 1]};

const SIZE = 1024, PAD = .2, SPAN = 1 + 2 * PAD;

function wideMask() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, SIZE, SIZE);
  const at = ([x, y]) => [(x / WIDE_OUTLINE.width + PAD) / SPAN * SIZE, (y / WIDE_OUTLINE.height + PAD) / SPAN * SIZE];
  const points = WIDE_OUTLINE.points.map(at);
  c.fillStyle = '#fff';
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.fill();
  // Small deterministic fibre irregularities along the cut, as stage-clipping draws them.
  points.forEach(([x, y], i) => {
    const [bx, by] = points[(i + 1) % points.length], dx = bx - x, dy = by - y, len = Math.hypot(dx, dy);
    for (let j = 2; j < len; j += 4) {
      const t = j / len;
      c.fillStyle = Math.sin(j * 7.1 + i) > 0 ? '#000' : '#fff';
      c.fillRect(x + dx * t - .6, y + dy * t - .6, 1.2, 1.2);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function createCut(renderer, scene, pass) {
  renderer.localClippingEnabled = true;
  const sets = {shell: [], furniture: []};
  for (const plane of Object.values(CLOSE_PLANES)) {
    sets.shell.push(new THREE.Plane(plane.normal.clone(), plane.wide));
    sets.furniture.push(new THREE.Plane(plane.normal.clone(), plane.wide));
  }
  const uniforms = {cutMask: {value: wideMask()}, cutWide: {value: new THREE.Matrix4()}, cutOn: {value: 1}};
  const main = /void\s+main\s*\(\s*\)\s*\{/;
  const patched = new WeakSet();
  function attach(material, group) {
    material.clippingPlanes = sets[group];
    material.clipShadows = true;
    if (patched.has(material)) return;
    patched.add(material);
    const before = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, ...args) {
      before?.call(this, shader, ...args);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec3 vCutPoint;\n' + shader.vertexShader.replace(main,
        'void main(){\n  vCutPoint=(modelMatrix*vec4(position,1.0)).xyz;\n');
      shader.fragmentShader = `varying vec3 vCutPoint;uniform sampler2D cutMask;uniform mat4 cutWide;uniform float cutOn;
        void keepCutSurface(){
          if(cutOn<.5)return;
          vec4 q=cutWide*vec4(vCutPoint,1.0);
          vec2 uv=(q.xy/max(q.w,.00001)*vec2(.5,-.5)+.5+${PAD.toFixed(2)})/${SPAN.toFixed(2)};
          if(q.w<=0.0||any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0)))||texture2D(cutMask,vec2(uv.x,1.0-uv.y)).r<.5)discard;
        }\n` + shader.fragmentShader.replace(main, 'void main(){\n  keepCutSurface();\n');
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => 'karmic-cut-v2-' + material.type + '-' + (key ? key() : '');
    material.needsUpdate = true;
  }
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const group = o.userData.cutGroup === 'furniture' ? 'furniture' : 'shell';
    const original = o.material;
    attach(original, group);
    // The print pass draws normals with its own material per original: give it the cut too.
    if (!original.transparent) {
      let normal = pass.normalMaterials.get(original);
      if (!normal) {
        normal = new THREE.MeshNormalMaterial({flatShading: !!original.flatShading, side: original.side, transparent: true,
          opacity: original.userData.accent ? 1 : original.userData.foliage ? .5 : 0, blending: THREE.NoBlending});
        pass.normalMaterials.set(original, normal);
      }
      normal.forceSinglePass = true;
      attach(normal, group);
    }
    if (o.castShadow) {
      o.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide});
      attach(o.customDepthMaterial, group);
    }
  });

  let last = '';
  return {
    // wideCamera: the un-orbited wide view the outline was drawn from; mix: the zoom (0 wide, 1 close).
    update(wideCamera, mix) {
      wideCamera.updateMatrixWorld(true);
      uniforms.cutWide.value.multiplyMatrices(wideCamera.projectionMatrix, wideCamera.matrixWorldInverse);
      const names = Object.keys(CLOSE_PLANES);
      names.forEach((name, i) => {
        const plane = CLOSE_PLANES[name], [start, end] = PHASES[name];
        const t = THREE.MathUtils.clamp((mix - start) / (end - start), 0, 1);
        sets.shell[i].constant = THREE.MathUtils.lerp(plane.wide, plane.shell, t);
        sets.furniture[i].constant = THREE.MathUtils.lerp(plane.wide, plane.furniture, t);
      });
      const state = mix.toFixed(4) + uniforms.cutWide.value.elements.join();
      if (state !== last) { last = state; renderer.shadowMap.needsUpdate = true; }
    },
    set enabled(value) { uniforms.cutOn.value = value ? 1 : 0; renderer.shadowMap.needsUpdate = true; },
  };
}
