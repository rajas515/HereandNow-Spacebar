import * as THREE from '../shared/vendor/three.module.js';
// In the life of: one folder per batch on the worktables.
// The eight loose sheets already on the two central tables (studio-panorama-v3.blend, "Loose sketched
// paper" .000–.007) become the batch folders, 2015 to 2022, read from the top left like a page. Their
// triangles are lifted out of the baked details-central mesh at load, so each folder is its own mesh:
// it can brighten and take an outline on hover, and carries its batch faintly in pencil.
//
// SHEETS: centre x, y (Blender metres, Z up) and rotation about Z, from the source file. In three.js
// (Y up) a Blender point (x, y, z) is (x, z, -y), and the rotation is the same angle about +Y.
const SHEETS = [
  {batch: 2015, x: -.58, y: -1.85, angle: .15},
  {batch: 2016, x: -.40, y: .10, angle: -.40},
  {batch: 2017, x: -.52, y: 1.45, angle: .15},
  {batch: 2018, x: .25, y: -1.55, angle: -.20},
  {batch: 2019, x: .10, y: -.13, angle: .25},
  {batch: 2020, x: .05, y: .85, angle: .70},
  {batch: 2021, x: .59, y: -1.85, angle: .70},
  {batch: 2022, x: .62, y: 1.43, angle: -.20},
];
const HALF = {u: .105, v: .1485};   // half the A-size sheet: .21 x .297
const TOP = .763;                   // the sheets' height above the floor
// Hover and selection must read through the shared print screen, which inks by lightness: the sheet
// dims a step (white paper is already at the top of the scale) and a dark band frames it.
const HOVER = {exposure: .7, outline: '#2a1238', band: .011};

// Sheet-local coordinates of a three.js point (u along the short side, v along the long side).
function local(sheet, x, z) {
  const dx = x - sheet.x, dy = -z - sheet.y, c = Math.cos(sheet.angle), s = Math.sin(sheet.angle);
  return [c * dx + s * dy, -s * dx + c * dy];
}
function world(sheet, u, v, y) {
  const c = Math.cos(sheet.angle), s = Math.sin(sheet.angle);
  return new THREE.Vector3(sheet.x + c * u - s * v, y, -(sheet.y + s * u + c * v));
}

// The batch in pencil: a faint label lying on the sheet, upright for the overhead camera.
function labelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 192;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(42,18,56,.9)';
  g.font = '800 150px Mulish, "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 100);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// room: the loaded studio; screenUp: the overhead camera's up vector (the label reads upright to it).
export function createFolders(room, screenUp) {
  const source = room.getObjectByName('details-central');
  if (!source) return null;
  const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry;
  const position = geometry.attributes.position, color = geometry.attributes.color;
  const keep = [], parts = SHEETS.map(() => []);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
    let owner = -1;
    if (y > TOP - .01 && y < TOP + .04) {
      owner = SHEETS.findIndex(sheet => { const [u, v] = local(sheet, x, z); return Math.abs(u) < HALF.u + .006 && Math.abs(v) < HALF.v + .006; });
    }
    (owner < 0 ? keep : parts[owner]).push(i, i + 1, i + 2);
  }
  const pick = ids => {
    const out = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const size = attribute.itemSize, array = new attribute.array.constructor(ids.length * size);
      ids.forEach((id, n) => { for (let k = 0; k < size; k++) array[n * size + k] = attribute.array[id * size + k]; });
      out.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
    }
    out.computeBoundingSphere();
    return out;
  };
  // The tables keep everything else; each sheet becomes a folder of its own.
  const rest = pick(keep);
  source.geometry.dispose();
  source.geometry = rest;

  const angleUp = Math.atan2(-screenUp.x, -screenUp.z);   // rotation about Y that turns -Z to screenUp
  const folders = SHEETS.map((sheet, n) => {
    const mesh = new THREE.Mesh(pick(parts[n]), source.material.clone());
    mesh.name = `folder-${sheet.batch}`;
    mesh.userData.batch = sheet.batch;
    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
    // Outline: a flat band just outside the sheet's edge, shown on hover and while selected. A basic
    // material keeps it out of the print's normal pass, so it inks dark without adding contours.
    const ring = (grow) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => world(sheet, su * (HALF.u + grow), sv * (HALF.v + grow), TOP + .016));
    const inner = ring(.004), outer = ring(.004 + HOVER.band), points = [];
    for (let k = 0; k < 4; k++) {
      const a0 = inner[k], a1 = inner[(k + 1) % 4], b0 = outer[k], b1 = outer[(k + 1) % 4];
      points.push(a0, b0, b1, a0, b1, a1);
    }
    const outline = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(points), new THREE.MeshBasicMaterial({color: HOVER.outline, side: THREE.DoubleSide, toneMapped: false}));
    outline.name = `${mesh.name}-outline`; outline.visible = false;
    // Label: lies flat, turned with the sheet to whichever of its edges is nearest upright.
    const turns = Math.round((angleUp - sheet.angle) / (Math.PI / 2));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.16, .06), new THREE.MeshBasicMaterial({map: labelTexture(String(sheet.batch)), transparent: true, depthWrite: false, toneMapped: false}));
    label.name = `${mesh.name}-label`;
    label.rotation.order = 'YXZ';
    label.rotation.set(-Math.PI / 2, sheet.angle + turns * Math.PI / 2, 0);
    const toward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), label.rotation.y);   // the label's up on the table
    label.position.copy(world(sheet, 0, 0, TOP + .02)).addScaledVector(toward, -.075);   // in the sheet's lower part, clear of the sketch
    label.renderOrder = 2;
    for (const o of [mesh, outline, label]) o.userData.central = true;   // cut with the tables, not the room (stage-clipping)
    room.add(mesh, outline, label);
    return {sheet, mesh, outline, label};
  });

  let hovered = null, selected = null;
  const paint = () => {
    for (const f of folders) {
      const lit = f === hovered || f === selected;
      f.mesh.material.color.setScalar(lit ? HOVER.exposure : 1);
      f.outline.visible = lit;
      f.label.material.opacity = lit ? 1 : .8;
    }
  };
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TOP + .01)), hit = new THREE.Vector3();
  return {
    names: folders.flatMap(f => [f.mesh.name, f.outline.name, f.label.name]),
    // The folder under a ray, or null.
    at(ray) {
      if (!ray.intersectPlane(plane, hit)) return null;
      return folders.find(f => { const [u, v] = local(f.sheet, hit.x, hit.z); return Math.abs(u) < HALF.u + .01 && Math.abs(v) < HALF.v + .01; }) || null;
    },
    // Returns true when the look changed (the caller redraws).
    hover(folder) { if (folder === hovered) return false; hovered = folder; paint(); return true; },
    select(folder) { selected = folder; paint(); },
    get selected() { return selected; },
  };
}
