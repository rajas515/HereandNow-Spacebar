import * as THREE from '../shared/vendor/three.module.js';

// The paper cut-out of the Karmic Debts room, as in the other room cards (see
// shared/cutout/stage-clipping.js): an outline drawn over the view becomes a mask, and every
// surface keeps or drops its pixels by projecting its *world* position through the camera the
// outline was drawn from. The cut therefore lives on the geometry: when the view orbits, its
// edges slide along walls, floor and furniture and change shape, like the other studies.
//
// Two outlines, one per view (traced from the annotations, image pixels of a 1.4 card):
// the wide corner and the close table. Each is drawn as a slightly soft field (wide in red,
// close in green). During the zoom the two fields are blended by the zoom amount and cut at
// one half, so the boundary morphs from one outline to the other across the surfaces.
// Colour, normal/depth and shadow passes all use the same cut.

// Points beyond the image (< 0 or > width/height) carry an outline along the frame edge.
export const WIDE_OUTLINE = {width: 1001, height: 710, points: [
  [20, 80], [95, 92], [278, 95], [270, 40], [258, -80], [415, -80], [420, 2], [560, 22], [668, 55],
  [760, 40], [845, 2], [845, -80], [960, -80], [958, 15], [935, 90], [918, 135], [990, 122], [1090, 122],
  [1090, 320], [975, 400], [950, 480], [930, 580], [915, 668], [830, 610], [740, 550], [600, 590],
  [480, 612], [472, 652], [410, 655], [400, 690], [402, 790], [300, 790], [300, 640], [270, 610],
  [215, 600], [190, 625], [170, 652], [162, 640], [150, 560], [145, 450], [80, 455], [-6, 465],
  [95, 385], [100, 340], [85, 210], [40, 110],
]};
export const CLOSE_OUTLINE = {width: 998, height: 708, points: [
  [135, 115], [210, 130], [400, 150], [560, 165], [700, 150], [965, 130], [975, 140], [970, 300],
  [955, 400], [945, 470], [925, 482], [985, 520], [992, 548], [950, 575], [942, 605], [905, 638],
  [875, 642], [850, 665], [845, 605], [700, 640], [550, 690], [470, 680], [250, 632], [170, 455],
  [100, 460], [95, 500], [80, 460], [70, 400], [55, 345], [70, 322], [130, 318], [130, 300], [120, 140],
]};

// The mask canvas covers -20%..120% of the view, so outlines can run past the frame edge.
const SIZE = 1024, PAD = .2, SPAN = 1 + 2 * PAD;

function drawField(ctx, outline, channel) {
  const layer = document.createElement('canvas');
  layer.width = layer.height = SIZE;
  const c = layer.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, SIZE, SIZE);
  c.filter = 'blur(5px)';   // a soft field, so two outlines can blend into each other
  c.fillStyle = '#fff';
  c.beginPath();
  outline.points.forEach(([x, y], i) => {
    const u = (x / outline.width + PAD) / SPAN * SIZE, v = (y / outline.height + PAD) / SPAN * SIZE;
    if (i) c.lineTo(u, v); else c.moveTo(u, v);
  });
  c.closePath();
  c.fill();
  ctx.globalCompositeOperation = 'lighter';
  const tint = document.createElement('canvas');
  tint.width = tint.height = SIZE;
  const t = tint.getContext('2d');
  t.drawImage(layer, 0, 0);
  t.globalCompositeOperation = 'multiply';
  t.fillStyle = channel;
  t.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(tint, 0, 0);
}

export function createCut(renderer, scene, pass) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  drawField(ctx, WIDE_OUTLINE, '#f00');
  drawField(ctx, CLOSE_OUTLINE, '#0f0');
  const field = new THREE.CanvasTexture(canvas);
  field.minFilter = field.magFilter = THREE.LinearFilter;
  field.generateMipmaps = false;
  field.colorSpace = THREE.NoColorSpace;

  const uniforms = {
    cutField: {value: field}, cutMix: {value: 0}, cutOn: {value: 1},
    cutWide: {value: new THREE.Matrix4()}, cutClose: {value: new THREE.Matrix4()},
  };
  const main = /void\s+main\s*\(\s*\)\s*\{/;
  const patched = new WeakSet();
  function attach(material) {
    if (patched.has(material)) return;
    patched.add(material);
    const before = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, ...args) {
      before?.call(this, shader, ...args);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec3 vCutPoint;\n' + shader.vertexShader.replace(main,
        'void main(){\n  vCutPoint=(modelMatrix*vec4(position,1.0)).xyz;\n');
      shader.fragmentShader = `varying vec3 vCutPoint;uniform sampler2D cutField;uniform mat4 cutWide,cutClose;uniform float cutMix,cutOn;
        float cutSample(mat4 view,int channel){
          vec4 q=view*vec4(vCutPoint,1.0);
          if(q.w<=0.0)return 0.0;
          vec2 uv=(q.xy/q.w*vec2(.5,-.5)+.5+${PAD.toFixed(2)})/${SPAN.toFixed(2)};
          if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return 0.0;
          vec4 f=texture2D(cutField,vec2(uv.x,1.0-uv.y));
          return channel==0?f.r:f.g;
        }
        float cutHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void keepCutSurface(){
          if(cutOn<.5)return;
          float keep=mix(cutSample(cutWide,0),cutSample(cutClose,1),cutMix);
          // A little fibre along the torn edge, fixed to the surface.
          float fibre=(cutHash(floor(vCutPoint.xz*180.0+vCutPoint.y*97.0))-.5)*.06;
          if(keep<.5+fibre)discard;
        }\n` + shader.fragmentShader.replace(main, 'void main(){\n  keepCutSurface();\n');
    };
    const key = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => 'karmic-cut-v1-' + material.type + '-' + (key ? key() : '');
    material.needsUpdate = true;
  }
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const original = o.material;
    attach(original);
    // The print pass draws normals with its own material per original: give it the cut too.
    if (!original.transparent) {
      let normal = pass.normalMaterials.get(original);
      if (!normal) {
        normal = new THREE.MeshNormalMaterial({flatShading: !!original.flatShading, side: original.side, transparent: true,
          opacity: original.userData.accent ? 1 : original.userData.foliage ? .5 : 0, blending: THREE.NoBlending});
        pass.normalMaterials.set(original, normal);
      }
      normal.forceSinglePass = true;
      attach(normal);
    }
    if (o.castShadow) {
      o.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide});
      attach(o.customDepthMaterial);
    }
  });

  let last = '';
  return {
    // Anchors: the two cameras the outlines were drawn from (no orbit, at the card's home shape).
    update(wideCamera, closeCamera, mix) {
      for (const [camera, target] of [[wideCamera, uniforms.cutWide.value], [closeCamera, uniforms.cutClose.value]]) {
        camera.updateMatrixWorld(true);
        target.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      }
      uniforms.cutMix.value = mix;
      const state = mix.toFixed(4) + uniforms.cutWide.value.elements.join() + uniforms.cutClose.value.elements.join();
      if (state !== last) { last = state; renderer.shadowMap.needsUpdate = true; }
    },
    set enabled(value) { uniforms.cutOn.value = value ? 1 : 0; renderer.shadowMap.needsUpdate = true; },
  };
}
