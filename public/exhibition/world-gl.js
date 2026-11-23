// One WebGL renderer for the whole exhibition. Every card keeps its own scene code
// and print pass, but instead of its own canvas it gets a "surface": an offscreen
// target that behaves like a canvas (same tone mapping and colour encoding), sized
// exactly like the card's own frame. The world then draws each surface where the
// card's DOM canvas sits, so the print dots and grain scale with zoom exactly as the
// iframes did. Cards render only when they need to; static cards cost one blit.
import * as THREE from '../shared/vendor/three.module.js';

// Renderer state a card may change; restored whenever that card draws again.
const STATE = ['autoClear', 'autoClearColor', 'autoClearDepth', 'autoClearStencil', 'clippingPlanes', 'localClippingEnabled',
  'toneMapping', 'toneMappingExposure', 'sortObjects'];
const SHADOW = ['enabled', 'type', 'autoUpdate', 'needsUpdate'];

export function createWorldGL(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, alpha: false, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const defaults = Object.fromEntries(STATE.map(k => [k, renderer[k]]));
  const surfaces = [], claimed = new WeakSet();
  // The world's own state (compositing onto the paper), used when no card is drawing.
  const worldState = {state: {...defaults, clippingPlanes: []}, shadow: {enabled: false, type: THREE.PCFShadowMap, autoUpdate: true, needsUpdate: false},
    clearColor: new THREE.Color('#1a1d4a'), clearAlpha: 1, scissorTest: false};
  let current, rawDirty = false, dirty = true, onDirty = () => {};   // current: undefined until first activation

  // ---- per-card surfaces ----
  function activate(surface) {
    if (current === surface) return;
    if (current) current.shadow.needsUpdate = renderer.shadowMap.needsUpdate;
    if (rawDirty) { renderer.resetState(); rawDirty = false; }
    current = surface;
    const s = surface || worldState;
    for (const k of STATE) renderer[k] = s.state[k];
    for (const k of SHADOW) renderer.shadowMap[k] = s.shadow[k];
    renderer.setClearColor(s.clearColor, s.clearAlpha);
    renderer.setRenderTarget(surface ? surface.target ?? surface.output : null);
    renderer.setScissorTest(s.scissorTest);
  }
  function markDirty() { dirty = true; onDirty(); }

  function createSurface(element, options = {}) {
    // Behaves like a canvas: tone mapping and sRGB output apply as they would on screen.
    const output = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: !!options.stencil});
    output.isXRRenderTarget = true;
    output.texture.colorSpace = THREE.SRGBColorSpace;
    const surface = {element, output, width: 1, height: 1, ratio: 1, target: null, scissorTest: false,
      state: {...defaults, clippingPlanes: []}, shadow: {enabled: false, type: THREE.PCFShadowMap, autoUpdate: true, needsUpdate: false},
      clearColor: new THREE.Color(0, 0, 0), clearAlpha: options.alpha ? 0 : 1, angle: 0, mesh: null};
    element.classList.add('card-gl');
    // GL is drawn beneath the card's DOM, so whatever sat behind this canvas (its stage's
    // paper background) must let it show through. It is the world's paper colour anyway.
    // A raised layer with its own background (positioned, z-index above 0, like Act I's
    // letter cover) hid the card's other canvases in the iframe: the world paints that
    // background in GL beneath this canvas instead.
    surface.backdrops = [];
    for (let el = element.parentElement; el && !el.classList.contains('card-html'); el = el.parentElement) {
      const style = getComputedStyle(el), color = style.backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (!claimed.has(el) && style.position !== 'static' && +style.zIndex > 0 && color && (color[3] ?? 1) > 0) surface.backdrops.push({el, color, mesh: null});
      claimed.add(el);
      el.style.setProperty('background', 'transparent', 'important');   // beats a card's own !important page background
    }
    const sized = () => { output.setSize(Math.max(1, Math.floor(surface.width * surface.ratio)), Math.max(1, Math.floor(surface.height * surface.ratio))); if (current === surface) renderer.setRenderTarget(surface.target ?? output); };
    const scale = () => surface.ratio / renderer.getPixelRatio();   // card pixel units → real renderer units
    const shadowFacade = {};
    for (const k of SHADOW) Object.defineProperty(shadowFacade, k, {
      get: () => { activate(surface); return renderer.shadowMap[k]; },
      set: v => { activate(surface); surface.shadow[k] = v; renderer.shadowMap[k] = v; },
    });
    const overrides = {
      domElement: element,
      shadowMap: shadowFacade,
      setSize(w, h) { surface.width = w; surface.height = h; sized(); },
      setPixelRatio(r) { surface.ratio = r; sized(); },
      getPixelRatio: () => surface.ratio,
      getSize: v => v.set(surface.width, surface.height),
      getDrawingBufferSize: v => v.set(output.width, output.height),
      setRenderTarget(target, ...rest) { surface.target = target; renderer.setRenderTarget(target ?? output, ...rest); },
      getRenderTarget: () => surface.target,
      setClearColor(color, alpha) { surface.clearColor.set(color); if (alpha !== undefined) surface.clearAlpha = alpha; renderer.setClearColor(surface.clearColor, surface.clearAlpha); },
      setClearAlpha(alpha) { surface.clearAlpha = alpha; renderer.setClearAlpha(alpha); },
      setScissorTest(v) { surface.scissorTest = v; renderer.setScissorTest(v); },
      setViewport(x, y, w, h) {
        if (x.isVector4) [x, y, w, h] = [x.x, x.y, x.z, x.w];
        if (!surface.target) { output.viewport.set(x, y, w, h).multiplyScalar(surface.ratio); renderer.setRenderTarget(output); }
        else renderer.setViewport(x * scale(), y * scale(), w * scale(), h * scale());
      },
      setScissor(x, y, w, h) {
        if (x.isVector4) [x, y, w, h] = [x.x, x.y, x.z, x.w];
        if (!surface.target) { output.scissor.set(x, y, w, h).multiplyScalar(surface.ratio); renderer.setRenderTarget(output); }
        else renderer.setScissor(x * scale(), y * scale(), w * scale(), h * scale());
      },
      setAnimationLoop(callback) { const loop = t => { if (surface.loop !== loop) return; callback(t); requestAnimationFrame(loop); }; surface.loop = callback ? loop : null; if (callback) requestAnimationFrame(loop); },
      dispose() {},
    };
    surface.renderer = new Proxy(renderer, {
      get(target, key) {
        activate(surface);
        if (key === 'outputColorSpace') return output.texture.colorSpace;
        if (key === 'render' || key === 'clear' || key === 'compileAsync') markDirty();
        if (key in overrides) return overrides[key];
        if (STATE.includes(key)) return surface.state[key];
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, key, value) {
        activate(surface);
        if (key === 'outputColorSpace') { output.texture.colorSpace = value; return true; }   // the surface encodes like the card's canvas would
        if (STATE.includes(key)) surface.state[key] = value;
        target[key] = value;
        return true;
      },
    });
    surfaces.push(surface);
    return surface;
  }

  // Raw WebGL cards (architecture) draw into a surface through the shared context.
  // Switching to one resets GL to its defaults, as a fresh context of its own would be;
  // its "default framebuffer" is the surface; the canvas's width/height size the surface.
  const gl = renderer.getContext();
  const fbOf = target => renderer.properties.get(target).__webglFramebuffer;
  function ready(target) {   // make Three allocate a target's framebuffer, keeping GL bindings
    if (fbOf(target)) return;
    const viewport = gl.getParameter(gl.VIEWPORT), bound = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    renderer.setRenderTarget(target);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bound); gl.viewport(...viewport);
  }
  function createRawSurface(element) {
    const surface = createSurface(element, {alpha: true});
    surface.raw = true;
    let width = element.width, height = element.height;
    const resize = () => { surface.width = width; surface.height = height; surface.output.setSize(Math.max(1, width), Math.max(1, height)); };
    Object.defineProperty(element, 'width', {get: () => width, set: v => { width = v; resize(); }});
    Object.defineProperty(element, 'height', {get: () => height, set: v => { height = v; resize(); }});
    rawSources.set(element, surface);
    patchDrawImage();
    // Code written for a context of its own may set state once and rely on it later (Act I's
    // letter binds its textures and vertex layout at start-up only). The surface remembers
    // that state, keeps vertex layout in a vertex array of its own, and restores it whenever
    // the card draws again after Three.js or another card used the context.
    const vao = gl.createVertexArray();
    const kept = {program: null, framebuffer: null, renderbuffer: null, unit: gl.TEXTURE0, textures: new Map(), buffers: new Map(),
      viewport: null, scissor: null, caps: new Map(), calls: new Map(), pixel: new Map()};
    const enter = () => {
      if (current === surface) return;
      activate(surface);
      renderer.resetState();   // GL defaults, as a fresh context of its own would be
      // Image-upload settings are not part of Three's reset; it leaves flip-Y on after its uploads.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
      ready(surface.output);
      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, kept.framebuffer ?? fbOf(surface.output));
      if (kept.renderbuffer) gl.bindRenderbuffer(gl.RENDERBUFFER, kept.renderbuffer);
      if (kept.program) gl.useProgram(kept.program);
      for (const [key, texture] of kept.textures) { const [unit, type] = key.split(':').map(Number); gl.activeTexture(unit); gl.bindTexture(type, texture); }
      gl.activeTexture(kept.unit);
      for (const [type, buffer] of kept.buffers) gl.bindBuffer(type, buffer);
      if (kept.viewport) gl.viewport(...kept.viewport);
      if (kept.scissor) gl.scissor(...kept.scissor);
      for (const [cap, on] of kept.caps) on ? gl.enable(cap) : gl.disable(cap);
      for (const [name, args] of kept.calls) gl[name](...args);
      for (const [name, value] of kept.pixel) gl.pixelStorei(name, value);
    };
    const remember = name => (...args) => { kept.calls.set(name, args); return gl[name](...args); };
    const glOverrides = {
      canvas: element,
      get drawingBufferWidth() { return surface.output.width; },
      get drawingBufferHeight() { return surface.output.height; },
      bindFramebuffer(target, fb) { kept.framebuffer = fb; gl.bindFramebuffer(target, fb ?? fbOf(surface.output)); },
      bindRenderbuffer(target, rb) { kept.renderbuffer = rb; gl.bindRenderbuffer(target, rb); },
      getContextAttributes: () => ({...gl.getContextAttributes(), alpha: true}),
      useProgram(program) { kept.program = program; gl.useProgram(program); },
      activeTexture(unit) { kept.unit = unit; gl.activeTexture(unit); },
      bindTexture(type, texture) { kept.textures.set(kept.unit + ':' + type, texture); gl.bindTexture(type, texture); },
      bindBuffer(type, buffer) { if (type !== gl.ELEMENT_ARRAY_BUFFER) kept.buffers.set(type, buffer); gl.bindBuffer(type, buffer); },
      viewport(...args) { kept.viewport = args; gl.viewport(...args); },
      scissor(...args) { kept.scissor = args; gl.scissor(...args); },
      enable(cap) { kept.caps.set(cap, true); gl.enable(cap); },
      disable(cap) { kept.caps.set(cap, false); gl.disable(cap); },
      pixelStorei(name, value) { kept.pixel.set(name, value); gl.pixelStorei(name, value); },
      blendFunc: remember('blendFunc'), blendFuncSeparate: remember('blendFuncSeparate'), blendEquation: remember('blendEquation'),
      depthFunc: remember('depthFunc'), depthMask: remember('depthMask'), colorMask: remember('colorMask'), clearColor: remember('clearColor'),
      cullFace: remember('cullFace'), frontFace: remember('frontFace'),
    };
    surface.gl = new Proxy(gl, {
      get(target, key) {
        enter();
        rawDirty = true; markDirty();
        const descriptor = Object.getOwnPropertyDescriptor(glOverrides, key);
        if (descriptor) return descriptor.get ? descriptor.get() : descriptor.value;
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return surface;
  }
  // A raw card that copies its canvas into 2D canvases (architecture's detail flakes) gets
  // a GPU copy into a surface over each 2D canvas instead: no pixels come back to the CPU.
  const rawSources = new WeakMap(), copies = new WeakMap();
  let drawImagePatched = false;
  function patchDrawImage() {
    if (drawImagePatched) return;
    drawImagePatched = true;
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      const from = rawSources.get(source);
      if (!from || args.length !== 8) return drawImage.call(this, source, ...args);
      const [sx, sy, sw, sh, , , dw, dh] = args.map(Math.round);
      let copy = copies.get(this.canvas);
      if (!copy) { copy = createSurface(this.canvas, {alpha: true}); copies.set(this.canvas, copy); }
      if (copy.output.width !== dw || copy.output.height !== dh) { copy.width = dw; copy.height = dh; copy.output.setSize(dw, dh); }
      ready(copy.output);
      const H = from.output.height, scissor = gl.isEnabled(gl.SCISSOR_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbOf(from.output));
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbOf(copy.output));
      gl.blitFramebuffer(sx, H - sy - sh, sx + sw, H - sy, 0, 0, dw, dh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbOf(from.output));   // back to the card's "default framebuffer"
      if (scissor) gl.enable(gl.SCISSOR_TEST);
      markDirty();
    };
  }

  // ---- compositing: one textured quad per surface, placed over its DOM canvas ----
  // What the card's CSS does to a canvas is kept: its clip-paths (CSS polygons or SVG
  // <clipPath> references, intersected when canvas and wrapper both clip) become a mask,
  // a drop-shadow an offset tinted copy beneath, and SVG polygons the card stacks behind
  // the canvas (a lower z-index sibling) are drawn in GL beneath it, since all card DOM
  // now sits above the one GL canvas.
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const quad = new THREE.PlaneGeometry(1, 1);
  const passThrough = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
  const premultiplied = {transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor};
  const nativeRect = Element.prototype.getBoundingClientRect;
  function clipTo(object, surface) {   // scissor an object to its surface's clip box while it draws
    object.onBeforeRender = target => {
      const c = surface.clipRect;
      if (!c) return;
      const w = Math.max(0, c.right - c.left), h = Math.max(0, c.bottom - c.top);
      target.setScissor(c.left, innerHeight - c.bottom, w, h); target.setScissorTest(true);
    };
    object.onAfterRender = target => target.setScissorTest(false);
    return object;
  }
  function meshFor(surface) {
    if (surface.mesh) return surface.mesh;
    surface.maskCanvas = Object.assign(document.createElement('canvas'), {width: 256, height: 256});
    surface.mask = new THREE.CanvasTexture(surface.maskCanvas);
    const uniforms = {map: {value: surface.output.texture}, mask: {value: surface.mask}, useMask: {value: 0}, shadow: {value: new THREE.Vector4()}, isShadow: {value: 0}};
    const material = isShadow => new THREE.ShaderMaterial({
      uniforms: {...uniforms, isShadow: {value: isShadow}},   // shared uniform objects; only isShadow differs
      vertexShader: passThrough,
      // Values are already display-encoded, exactly as the card wrote them to its own canvas.
      fragmentShader: `uniform sampler2D map,mask;uniform float useMask,isShadow;uniform vec4 shadow;varying vec2 vUv;
        void main(){vec4 c=texture2D(map,vUv);float m=useMask>.5?texture2D(mask,vUv).r:1.0;
          gl_FragColor=isShadow>.5?vec4(shadow.rgb*shadow.a,shadow.a)*c.a*m:c*m;}`,
      ...premultiplied,
    });
    surface.mesh = clipTo(new THREE.Mesh(quad, material(0)), surface);
    surface.shadowMesh = clipTo(new THREE.Mesh(quad, material(1)), surface);
    surface.underlays = [];
    scene.add(surface.shadowMesh, surface.mesh);
    return surface.mesh;
  }
  // Stacking order within a card, as the browser resolves it: z-indices of the nested
  // stacking contexts from the outermost in (a canvas at z 1 inside a layer at z 25 sits
  // above a canvas at z 1 on its own), packed into one sortable number.
  const zOf = node => {
    const levels = [];
    for (; node && !node.classList?.contains('card-html'); node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.zIndex !== 'auto' && style.position !== 'static') levels.unshift(Math.max(-49, Math.min(49, +style.zIndex)));
    }
    return [0, 1, 2].reduce((key, i) => key * 100 + (levels[i] === undefined ? 0 : levels[i] + 50), 0);
  };
  function measure(surface) {
    let angle = 0, filter = 'none';
    const el = surface.element, clips = [];
    for (let node = el; node && !node.classList.contains('card-html'); node = node.parentElement) {
      const style = getComputedStyle(node), m = style.transform;
      const match = m && m !== 'none' ? m.match(/matrix\(([^,]+),\s*([^,]+)/) : null;
      if (match) angle += Math.atan2(+match[2], +match[1]);
      const sameBox = Math.abs(node.offsetWidth - el.offsetWidth) < 2 && Math.abs(node.offsetHeight - el.offsetHeight) < 2;
      if (!sameBox) continue;
      if (style.clipPath !== 'none') clips.push({clip: style.clipPath, box: node});
      if (filter === 'none' && style.filter !== 'none') filter = style.filter;
    }
    surface.angle = angle; surface.clips = clips;
    // Boxes that clip the canvas (overflow other than visible, up to the card's own frame),
    // as the browser or the iframe would: drawn with a scissor to their intersection.
    // Accent shards (shared/accent.js) reach past their card on purpose: never clipped.
    let clip = null;
    const card = el.closest('.accent-shard') ? null : el.getRootNode().querySelector?.('.card-html');
    for (let node = card && el.parentElement; node; node = node === card ? null : node.parentElement) {
      if (getComputedStyle(node).overflow === 'visible' && node !== card) continue;
      const b = nativeRect.call(node);   // the real box: cards may patch getBoundingClientRect to report unscaled sizes
      clip = clip ? {left: Math.max(clip.left, b.left), top: Math.max(clip.top, b.top), right: Math.min(clip.right, b.right), bottom: Math.min(clip.bottom, b.bottom)} : {left: b.left, top: b.top, right: b.right, bottom: b.bottom};
    }
    surface.clipRect = clip;
    const shadow = filter.match(/drop-shadow\((rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px/);
    surface.dropShadow = shadow ? {color: shadow[1].match(/[\d.]+/g).map(Number), x: +shadow[2], y: +shadow[3]} : null;
    if (surface.dropShadow) { const [r, g, b, a = 1] = surface.dropShadow.color; surface.shadowMesh.material.uniforms.shadow.value.set(r / 255, g / 255, b / 255, a); }
    const z = zOf(el), order = z * 1000 + surfaces.indexOf(surface) * 4;   // CSS stacking first, then creation order
    surface.underlayOrder = order; surface.shadowMesh.renderOrder = order + 1; surface.mesh.renderOrder = order + 2;
    if (!surface.underlaysFound) {   // SVG siblings stacked behind the canvas: drawn in GL instead, hidden in the DOM
      surface.underlaysFound = true;
      for (const sibling of el.parentElement?.children || []) {
        if (sibling === el || sibling.tagName.toLowerCase() !== 'svg' || zOf(sibling) >= z) continue;
        sibling.style.visibility = 'hidden';
        surface.underlays.push({svg: sibling, meshes: []});
      }
    }
  }
  const numbers = text => (text || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  // Polygon points (0..1 of the box) of a clip: CSS polygon() in % or px, or an SVG <clipPath>.
  function clipPolygons(clip, box) {
    if (clip.startsWith('polygon(')) {
      const unit = (v, length) => v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / Math.max(1, length);
      return [clip.slice(8, -1).split(',').map(p => { const [x, y] = p.trim().split(/\s+/); return [unit(x, box.offsetWidth), unit(y, box.offsetHeight)]; })];
    }
    const id = clip.match(/url\(["']?#([^"')]+)/)?.[1], node = id && box.getRootNode().getElementById?.(id);
    if (!node) return null;
    const bbox = node.getAttribute('clipPathUnits') === 'objectBoundingBox';
    return [...node.querySelectorAll('polygon')].map(p => {
      const v = numbers(p.getAttribute('points')), points = [];
      for (let i = 0; i + 1 < v.length; i += 2) points.push(bbox ? [v[i], v[i + 1]] : [v[i] / box.offsetWidth, v[i + 1] / box.offsetHeight]);
      return points;
    }).filter(p => p.length > 2);
  }
  function updateMask(surface) {
    const sets = surface.clips.map(({clip, box}) => clipPolygons(clip, box)).filter(Boolean);
    const key = JSON.stringify(sets);
    if (key === surface.maskKey) return;
    surface.maskKey = key;
    surface.mesh.material.uniforms.useMask.value = sets.length ? 1 : 0;
    if (!sets.length) return;
    const ctx = surface.maskCanvas.getContext('2d'), size = 256;
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, size, size);
    sets.forEach((polygons, i) => {   // union within one clip, intersection across clips
      ctx.globalCompositeOperation = i ? 'destination-in' : 'source-over';
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (const poly of polygons) poly.forEach(([x, y], j) => ctx[j ? 'lineTo' : 'moveTo'](x * size, y * size));
      ctx.fill();
    });
    surface.mask.needsUpdate = true;
  }
  function flatMesh() {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      uniforms: {color: {value: new THREE.Vector4()}},
      vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec4 color;void main(){gl_FragColor=vec4(color.rgb*color.a,color.a);}', ...premultiplied}));
    scene.add(mesh);
    return mesh;
  }
  function drawBackdrops(surface, H) {
    for (const b of surface.backdrops) {
      const r = nativeRect.call(b.el);
      if (!b.mesh) { b.mesh = clipTo(flatMesh(), surface); b.mesh.geometry = quad; }
      b.mesh.visible = r.width > 0 && r.height > 0;
      if (!b.mesh.visible) continue;
      const [red, green, blue, alpha = 1] = b.color;
      b.mesh.material.uniforms.color.value.set(red / 255, green / 255, blue / 255, alpha * +getComputedStyle(b.el).opacity);
      b.mesh.position.set(r.left + r.width / 2, H - (r.top + r.height / 2), 0);
      b.mesh.scale.set(r.width, r.height, 1);
      b.mesh.renderOrder = surface.underlayOrder;
    }
  }
  function drawUnderlays(surface, H) {
    for (const layer of surface.underlays) {
      const svg = layer.svg, r = nativeRect.call(svg), vb = svg.viewBox.baseVal;
      [...svg.querySelectorAll('polygon')].forEach((poly, i) => {
        let mesh = layer.meshes[i];
        if (!mesh) {
          mesh = layer.meshes[i] = clipTo(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
            uniforms: {color: {value: new THREE.Vector4()}},
            vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: 'uniform vec4 color;void main(){gl_FragColor=vec4(color.rgb*color.a,color.a);}', ...premultiplied})), surface);
          scene.add(mesh);
        }
        const v = numbers(poly.getAttribute('points')), key = v.join() + [r.left, r.top, r.width, r.height].join();
        if (mesh.userData.key !== key && v.length >= 6) {
          mesh.userData.key = key;
          const shape = new THREE.Shape();
          for (let j = 0; j + 1 < v.length; j += 2) {
            const x = r.left + (v[j] - vb.x) / (vb.width || 1) * r.width, y = H - (r.top + (v[j + 1] - vb.y) / (vb.height || 1) * r.height);
            shape[j ? 'lineTo' : 'moveTo'](x, y);
          }
          mesh.geometry.dispose(); mesh.geometry = new THREE.ShapeGeometry(shape);
        }
        // CSS colours are display values; written as-is, like everything else composited here.
        const style = getComputedStyle(poly), rgba = style.fill.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
        const alpha = (rgba[3] ?? 1) * +style.opacity * +style.fillOpacity * +getComputedStyle(svg).opacity;
        mesh.material.uniforms.color.value.set(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, alpha);
        mesh.renderOrder = surface.underlayOrder; mesh.visible = true;
      });
    }
  }
  function composite() {
    const W = innerWidth, H = innerHeight;
    activate(null);
    camera.right = W; camera.top = H; camera.updateProjectionMatrix();
    for (const surface of surfaces) {
      const mesh = meshFor(surface), shade = surface.shadowMesh, el = surface.element;
      mesh.visible = shade.visible = false;
      for (const layer of surface.underlays) for (const m of layer.meshes) m.visible = false;
      for (const b of surface.backdrops) if (b.mesh) b.mesh.visible = false;
      if (!el.isConnected || surface.hidden || getComputedStyle(el).visibility === 'hidden') continue;
      const r = nativeRect.call(el);
      if (!r.width || r.right < 0 || r.left > W || r.bottom < 0 || r.top > H) continue;
      measure(surface);
      const a = surface.angle, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const aspect = el.offsetWidth / Math.max(1, el.offsetHeight), h = r.width / (aspect * c + s), k = h / Math.max(1, el.offsetHeight);
      updateMask(surface);
      drawUnderlays(surface, H);
      drawBackdrops(surface, H);
      mesh.visible = true;
      mesh.position.set(r.left + r.width / 2, H - (r.top + r.height / 2), 0);
      mesh.scale.set(h * aspect, h, 1);
      mesh.rotation.z = -a;
      if (surface.dropShadow) {
        shade.visible = true;
        shade.position.set(mesh.position.x + surface.dropShadow.x * k, mesh.position.y - surface.dropShadow.y * k, 0);
        shade.scale.copy(mesh.scale); shade.rotation.z = -a;
      }
    }
    renderer.setViewport(0, 0, W, H);
    renderer.render(scene, camera);
    dirty = false;
  }
  function resize() { renderer.setSize(innerWidth, innerHeight, false); markDirty(); }
  addEventListener('resize', resize);
  resize();

  return {
    renderer, createSurface, createRawSurface, composite,
    get dirty() { return dirty; }, markDirty,
    set onDirty(fn) { onDirty = fn; },
  };
}

// ---- card documents: the card's own page markup and CSS, in a shadow root ----
// Equivalent to the iframe's document, minus the iframe: same DOM, same embedded CSS,
// isolated IDs and styles. Viewport units are rewritten to the card frame's size.
function rewriteCss(css, base) {
  return css
    .replace(/url\(\s*(['"]?)(?!data:|https?:|#)([^'")]+)\1\s*\)/g, (_, q, path) => `url("${new URL(path, base)}")`)
    .replace(/(^|[\s,{}>+~(])html(?=[\s.:#[{,>+~)]|$)/gm, '$1.card-html')
    .replace(/(^|[\s,{}>+~(])body(?=[\s.:#[{,>+~)]|$)/gm, '$1.card-body')
    .replace(/:root\b/g, '.card-html')
    .replace(/(-?\d*\.?\d+)[sdl]?vh\b/g, 'calc($1 * var(--card-vh))')
    .replace(/(-?\d*\.?\d+)[sdl]?vw\b/g, 'calc($1 * var(--card-vw))');
}
const HOST_CSS = `:host{all:initial;display:block;position:absolute;inset:0}
:host(.no-cursor) *{cursor:none!important}
.card-html,.card-body{position:relative;width:100%;height:100%;margin:0;overflow:hidden;background:transparent!important}
canvas.card-gl{background:transparent!important}
#loading{display:none!important}`;   /* the world shows the chapter label until the card is ready */

export async function loadCardDocument(frame, card, version = '') {
  const base = new URL(`../${card}/`, location.href), tag = version ? `?v=${version}` : '';
  const doc = new DOMParser().parseFromString(await (await fetch(base + tag)).text(), 'text/html');
  let css = '';
  for (const el of doc.querySelectorAll('link[rel=stylesheet],style')) {
    if (el.tagName === 'STYLE') css += rewriteCss(el.textContent, base);
    else { const href = new URL(el.getAttribute('href'), base); css += rewriteCss(await (await fetch(href + tag)).text(), href); }
  }
  doc.querySelectorAll('script').forEach(s => s.remove());
  doc.body.querySelectorAll('[src],[href]').forEach(el => {
    for (const attr of ['src', 'href']) { const v = el.getAttribute(attr); if (v && !/^(#|data:|https?:|mailto:)/.test(v)) el.setAttribute(attr, new URL(v, base)); }
  });
  const shadow = frame.shadowRoot || frame.attachShadow({mode: 'open'});
  shadow.innerHTML = `<style>${HOST_CSS}${css}</style><div class="card-html map-embedded"><div class="card-body ${doc.body.className}">${doc.body.innerHTML}</div></div>`;
  return {shadow, documentElement: shadow.querySelector('.card-html'), base};
}
