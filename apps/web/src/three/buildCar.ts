import * as THREE from 'three';
import type { CarSpec } from './carSpec.ts';
import { SYSTEMS } from './systems.ts';
import {
  chromeMaterial,
  frameMaterial,
  glassMaterial,
  headlightMaterial,
  paintMaterial,
  rubberMaterial,
  systemMaterial,
  taillightMaterial,
  trimMaterial,
  xrayMaterial,
} from './materials.ts';

/**
 * Procedural vehicle. Built in four layers so each can be shown, hidden or
 * re-skinned independently:
 *
 *   shell     painted body, glass, trim, lights, tyres  (fades during X-ray)
 *   xray      fresnel hologram copy of the shell         (appears during X-ray)
 *   skeleton  chassis rails, cross members, axles        (the car's "bones")
 *   systems   13 internal assemblies, one per catalogue category group
 */
export interface CarBuild {
  root: THREE.Group;
  shell: THREE.Group;
  xray: THREE.Group;
  skeleton: THREE.Group;
  systems: Record<string, { group: THREE.Group; material: THREE.MeshStandardMaterial }>;
  anchors: Record<string, THREE.Vector3>;
  dispose: () => void;
}

const BEVEL = 0.05;

function extrude(shape: THREE.Shape, depth: number, bevel = BEVEL, segments = 4) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: segments,
    curveSegments: 24,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

/** Side silhouette of the lower body, with wheel arches cut along the sill. */
function lowerBodyShape(s: CarSpec): THREE.Shape {
  const xf = s.length / 2;
  const xr = -s.length / 2;
  const sh = new THREE.Shape();
  sh.moveTo(xf - 0.04, s.sill + 0.06);
  sh.quadraticCurveTo(xf + 0.03, (s.sill + s.bumperTop) / 2, xf, s.bumperTop);
  sh.quadraticCurveTo(xf - 0.03, s.hoodFront - 0.02, xf - 0.22, s.hoodFront);
  sh.quadraticCurveTo((xf + s.cowlX) / 2, s.belt - 0.02, s.cowlX, s.belt);
  sh.lineTo(s.backBaseX, s.belt);
  if (s.bed) {
    // drop to the tray floor; side walls + tailgate are added as separate panels
    const floor = s.sill + 0.42;
    sh.lineTo(s.backBaseX, floor);
    sh.lineTo(xr + 0.04, floor);
    sh.lineTo(xr, floor - 0.1);
  } else {
    sh.quadraticCurveTo((s.backBaseX + xr) / 2, s.deckY + 0.04, xr + 0.12, s.deckY);
    sh.quadraticCurveTo(xr - 0.02, s.deckY - 0.08, xr, s.bumperTop);
  }
  sh.quadraticCurveTo(xr - 0.03, (s.sill + s.bumperTop) / 2, xr + 0.05, s.sill + 0.06);
  // bottom edge, rear → front, arching over each wheel
  const ar = s.wheelR + 0.07;
  for (const ax of [s.rearAxle, s.frontAxle]) {
    const dy = s.sill - s.wheelR;
    const dx = Math.sqrt(Math.max(0.0001, ar * ar - dy * dy));
    sh.lineTo(ax - dx, s.sill);
    sh.absarc(ax, s.wheelR, ar, Math.atan2(dy, -dx), Math.atan2(dy, dx), true);
  }
  sh.lineTo(xf - 0.04, s.sill + 0.06);
  return sh;
}

/** Glass house: windscreen base → roof → rear window base. */
function greenhouseShape(s: CarSpec): THREE.Shape {
  const sh = new THREE.Shape();
  sh.moveTo(s.cowlX + 0.04, s.belt - 0.04);
  sh.lineTo(s.wsTopX, s.roof - 0.02);
  sh.lineTo(s.roofRearX, s.roof - 0.02);
  sh.lineTo(s.backBaseX, s.belt - 0.04);
  sh.closePath();
  return sh;
}

function poly(pts: [number, number][]): THREE.Shape {
  const sh = new THREE.Shape();
  sh.moveTo(...pts[0]!);
  for (const p of pts.slice(1)) sh.lineTo(...p);
  sh.closePath();
  return sh;
}

/** Glass panes: two side windows per side (split at the B-pillar), windscreen and rear glass. */
function glazing(s: CarSpec, ghW: number): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const top = s.roof - 0.09;
  const bot = s.belt + 0.03;
  // where the slanted A/C lines cross a height
  const aX = (y: number) => s.cowlX + 0.04 + ((s.wsTopX - s.cowlX - 0.04) * (y - (s.belt - 0.04))) / (s.roof - 0.02 - (s.belt - 0.04));
  const cX = (y: number) => s.backBaseX + ((s.roofRearX - s.backBaseX) * (y - (s.belt - 0.04))) / (s.roof - 0.02 - (s.belt - 0.04));
  const bx = (s.wsTopX + s.roofRearX) / 2;
  const split = s.wsTopX - s.roofRearX > 1.0;
  const panes: [number, number][][] = split
    ? [
        [[aX(bot) - 0.06, bot], [aX(top) - 0.06, top], [bx + 0.05, top], [bx + 0.05, bot]],
        [[bx - 0.06, bot], [bx - 0.06, top], [cX(top) + 0.06, top], [cX(bot) + 0.07, bot]],
      ]
    : [[[aX(bot) - 0.06, bot], [aX(top) - 0.06, top], [cX(top) + 0.06, top], [cX(bot) + 0.07, bot]]];
  for (const z of [1, -1])
    for (const p of panes) {
      const g = new THREE.ShapeGeometry(poly(p));
      const m = new THREE.Mesh(g, glassMaterial);
      m.position.z = z * (ghW / 2 + 0.006);
      out.push(m);
    }
  const pane = (x0: number, y0: number, x1: number, y1: number, outward: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.PlaneGeometry(len - 0.1, ghW - 0.14);
    const m = new THREE.Mesh(g, glassMaterial);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    m.position.set((x0 + x1) / 2 + Math.sin(ang) * 0.062 * outward, (y0 + y1) / 2 - Math.cos(ang) * 0.062 * outward, 0);
    m.rotation.set(-Math.PI / 2, 0, 0);
    m.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), ang);
    out.push(m);
  };
  pane(s.cowlX + 0.04, s.belt - 0.04, s.wsTopX, s.roof - 0.02, 1);
  pane(s.roofRearX, s.roof - 0.02, s.backBaseX, s.belt - 0.04, 1);
  return out;
}

function roofShape(s: CarSpec): THREE.Shape {
  const sh = new THREE.Shape();
  sh.moveTo(s.wsTopX + 0.08, s.roof - 0.06);
  sh.lineTo(s.wsTopX - 0.02, s.roof + 0.015);
  sh.lineTo(s.roofRearX + 0.04, s.roof + 0.015);
  sh.lineTo(s.roofRearX - 0.06, s.roof - 0.06);
  sh.closePath();
  return sh;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number], rot?: [number, number, number]) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function helix(radius: number, height: number, turns: number, tube: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= turns * 24; i++) {
    const t = i / (turns * 24);
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height - height / 2, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, tube, 6, false);
}

function wheel(s: CarSpec, x: number, side: 1 | -1, paintless = false) {
  const g = new THREE.Group();
  const w = 0.26;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(s.wheelR - 0.08, 0.09, 18, 48), rubberMaterial);
  tyre.scale.set(1, 1, 1.45);
  const tread = new THREE.Mesh(new THREE.CylinderGeometry(s.wheelR - 0.005, s.wheelR - 0.005, w * 0.9, 48, 1, true), rubberMaterial);
  tread.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(s.wheelR - 0.1, s.wheelR - 0.12, 0.05, 40), chromeMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.z = side * 0.105;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(s.wheelR - 0.125, s.wheelR - 0.125, w * 0.8, 32, 1, true), trimMaterial);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  g.add(tyre, tread, rim);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, s.wheelR - 0.12, 0.035), chromeMaterial);
    spoke.position.y = (s.wheelR - 0.12) / 2;
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 6) * Math.PI * 2;
    pivot.position.z = side * 0.135;
    pivot.add(spoke);
    g.add(pivot);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.31, 16), chromeMaterial);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  g.position.set(x, s.wheelR, side * (s.track / 2));
  g.userData.wheel = true;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = !paintless;
  });
  return g;
}

export function buildCar(s: CarSpec, paint: string): CarBuild {
  const root = new THREE.Group();
  const shell = new THREE.Group();
  const xray = new THREE.Group();
  const skeleton = new THREE.Group();
  root.add(shell, xray, skeleton);
  const paintMat = paintMaterial(paint);
  const xrayMat = xrayMaterial('#4fd8ff');
  const disposables: { dispose: () => void }[] = [paintMat, xrayMat];

  // ------------------------------------------------------------ shell
  const lowerGeo = extrude(lowerBodyShape(s), s.width, 0.07, 5);
  const lower = mesh(lowerGeo, paintMat);
  const ghW = s.width * 0.84;
  const ghGeo = extrude(greenhouseShape(s), ghW, 0.05, 3);
  const greenhouse = mesh(ghGeo, paintMat);
  const roofGeo = extrude(roofShape(s), s.width * 0.86, 0.03, 3);
  const roof = mesh(roofGeo, paintMat);
  shell.add(lower, greenhouse, roof, ...glazing(s, ghW));
  for (const z of [1, -1]) {
    shell.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.14), trimMaterial, [s.cowlX - 0.1, s.belt + 0.1, z * (s.width / 2 + 0.05)])); // mirrors
    // door seams + side skirt + arch flares
    const seam = (x: number) => shell.add(mesh(new THREE.BoxGeometry(0.012, s.belt - s.sill - 0.12, 0.01), trimMaterial, [x, (s.belt + s.sill) / 2 + 0.02, z * (s.width / 2 + 0.002)]));
    seam(s.cowlX - 0.08);
    seam((s.wsTopX + s.roofRearX) / 2);
    if (!s.bed && s.wsTopX - s.roofRearX > 1.0) seam(s.roofRearX - 0.05);
    shell.add(mesh(new THREE.BoxGeometry(s.wheelbase - s.wheelR * 2 - 0.25, 0.07, 0.05), trimMaterial, [(s.frontAxle + s.rearAxle) / 2, s.sill + 0.04, z * (s.width / 2 + 0.01)]));
    for (const ax of [s.frontAxle, s.rearAxle]) {
      const flare = mesh(new THREE.TorusGeometry(s.wheelR + 0.08, 0.035, 8, 40, Math.PI), trimMaterial, [ax, s.wheelR, z * (s.width / 2 - 0.01)]);
      flare.scale.z = 1.4;
      shell.add(flare);
    }
  }
  // ute tray: liner floor, two side walls with capped rails, tailgate
  if (s.bed) {
    const floor = s.sill + 0.42;
    const x0 = s.backBaseX - 0.02;
    const x1 = -s.length / 2 + 0.02;
    const len = x0 - x1;
    const cx = (x0 + x1) / 2;
    const wallH = s.bed.rail - floor;
    shell.add(mesh(new THREE.BoxGeometry(len, 0.03, s.width - 0.16), trimMaterial, [cx, floor + 0.02, 0]));
    for (const z of [1, -1]) {
      shell.add(mesh(new THREE.BoxGeometry(len, wallH, 0.07), paintMat, [cx, floor + wallH / 2, z * (s.width / 2 - 0.035)]));
      shell.add(mesh(new THREE.BoxGeometry(len, 0.035, 0.1), trimMaterial, [cx, s.bed.rail + 0.015, z * (s.width / 2 - 0.035)]));
    }
    shell.add(mesh(new THREE.BoxGeometry(0.07, wallH, s.width - 0.02), paintMat, [x1 + 0.035, floor + wallH / 2, 0]));
    shell.add(mesh(new THREE.BoxGeometry(0.05, wallH * 0.8, s.width - 0.12), paintMat, [x0, floor + wallH / 2, 0]));
  }
  // grille, bumpers, lights
  shell.add(mesh(new THREE.BoxGeometry(0.06, (s.bumperTop - s.sill) * 0.55, s.width * 0.56), trimMaterial, [s.length / 2 + 0.005, s.bumperTop - 0.05, 0]));
  shell.add(mesh(new THREE.BoxGeometry(0.1, 0.1, s.width * 0.9), trimMaterial, [s.length / 2 - 0.02, s.sill + 0.1, 0]));
  shell.add(mesh(new THREE.BoxGeometry(0.1, 0.1, s.width * 0.9), trimMaterial, [-s.length / 2 + 0.02, s.sill + 0.1, 0]));
  for (const z of [1, -1]) {
    shell.add(mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), headlightMaterial, [s.length / 2 - 0.05, s.bumperTop + 0.08, z * s.width * 0.34]));
    const tailY = s.bed ? s.bed.rail - 0.18 : s.deckY - 0.12;
    shell.add(mesh(new THREE.BoxGeometry(0.06, 0.14, 0.26), taillightMaterial, [-s.length / 2 + 0.01, tailY, z * s.width * 0.38]));
  }
  // ---- details: grille slats, plates, fog lamps, exhaust, indicators, roof rails / sports bar
  const gh = (s.bumperTop - s.sill) * 0.55;
  for (let i = 0; i < 5; i++)
    shell.add(mesh(new THREE.BoxGeometry(0.02, 0.012, s.width * 0.52), chromeMaterial, [s.length / 2 + 0.04, s.bumperTop - 0.05 - gh / 2 + (i + 0.5) * (gh / 5), 0]));
  const plate = new THREE.MeshStandardMaterial({ color: '#e9eef0', roughness: 0.4, metalness: 0.1 });
  disposables.push(plate);
  shell.add(mesh(new THREE.BoxGeometry(0.02, 0.12, 0.38), plate, [s.length / 2 + 0.06, s.sill + 0.2, 0]));
  shell.add(mesh(new THREE.BoxGeometry(0.02, 0.12, 0.38), plate, [-s.length / 2 - 0.02, s.sill + 0.24, 0]));
  for (const z of [1, -1]) {
    shell.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), headlightMaterial, [s.length / 2 + 0.02, s.sill + 0.16, z * s.width * 0.38], [0, 0, Math.PI / 2]));
    shell.add(mesh(new THREE.BoxGeometry(0.1, 0.025, 0.012), new THREE.MeshStandardMaterial({ color: '#ffb03a', emissive: '#ff9a1a', emissiveIntensity: 2, toneMapped: false }), [s.cowlX + 0.2, s.belt - 0.1, z * (s.width / 2 + 0.006)]));
  }
  const tip = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 20, 1, true), chromeMaterial, [-s.length / 2 - 0.02, s.sill - 0.02, -0.42], [0, 0, Math.PI / 2]);
  shell.add(tip);
  if (s.body === 'SUV' || s.body === 'Wagon')
    for (const z of [1, -1]) shell.add(mesh(new THREE.BoxGeometry((s.wsTopX - s.roofRearX) * 0.92, 0.035, 0.04), trimMaterial, [(s.wsTopX + s.roofRearX) / 2, s.roof + 0.06, z * s.width * 0.36]));
  if (s.bed) {
    const barX = s.bed.x0 - 0.28;
    for (const z of [1, -1]) shell.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12), chromeMaterial, [barX, s.bed.rail + 0.24, z * (s.width / 2 - 0.08)]));
    shell.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, s.width - 0.16, 12), chromeMaterial, [barX, s.bed.rail + 0.48, 0], [Math.PI / 2, 0, 0]));
  }

  for (const [x, side] of [
    [s.frontAxle, 1],
    [s.frontAxle, -1],
    [s.rearAxle, 1],
    [s.rearAxle, -1],
  ] as [number, 1 | -1][])
    shell.add(wheel(s, x, side));

  // ------------------------------------------------------------ x-ray shell (same silhouettes)
  for (const geo of [lowerGeo, ghGeo, roofGeo]) xray.add(new THREE.Mesh(geo, xrayMat));
  for (const x of [s.frontAxle, s.rearAxle])
    for (const z of [1, -1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s.wheelR - 0.04, 0.03, 8, 40), xrayMat);
      ring.position.set(x, s.wheelR, z * (s.track / 2));
      xray.add(ring);
    }

  // ------------------------------------------------------------ skeleton (chassis)
  const railY = s.sill + 0.02;
  const railLen = s.length * 0.86;
  for (const z of [1, -1]) skeleton.add(mesh(new THREE.BoxGeometry(railLen, 0.09, 0.07), frameMaterial, [-0.05, railY, z * s.width * 0.3]));
  for (const x of [s.frontAxle + 0.4, s.frontAxle - 0.35, (s.frontAxle + s.rearAxle) / 2, s.rearAxle + 0.35, s.rearAxle - 0.4])
    skeleton.add(mesh(new THREE.BoxGeometry(0.07, 0.07, s.width * 0.6), frameMaterial, [x, railY, 0]));
  for (const x of [s.frontAxle, s.rearAxle]) {
    const axle = mesh(new THREE.CylinderGeometry(0.035, 0.035, s.track, 12), frameMaterial, [x, s.wheelR, 0], [Math.PI / 2, 0, 0]);
    skeleton.add(axle);
  }

  // ------------------------------------------------------------ systems
  const systems: CarBuild['systems'] = {};
  const anchors: CarBuild['anchors'] = {};
  for (const def of SYSTEMS) {
    const group = new THREE.Group();
    group.name = def.id;
    group.userData.system = def.id;
    const material = systemMaterial(def.color);
    disposables.push(material);
    systems[def.id] = { group, material };
    anchors[def.id] = new THREE.Vector3(...def.anchor(s));
    root.add(group);
  }
  const add = (id: string, geo: THREE.BufferGeometry, pos: [number, number, number], rot?: [number, number, number]) => {
    const m = mesh(geo, systems[id]!.material, pos, rot);
    m.userData.system = id;
    systems[id]!.group.add(m);
    return m;
  };
  const fa = s.frontAxle;
  const ra = s.rearAxle;
  const eY = s.engineY;
  const H = Math.PI / 2;

  // engine: block, heads, intake runners
  add('engine', new THREE.BoxGeometry(0.62, 0.42, 0.5), [fa - 0.15, eY, 0]);
  for (const z of [0.16, -0.16]) add('engine', new THREE.BoxGeometry(0.6, 0.1, 0.2), [fa - 0.15, eY + 0.26, z], [z > 0 ? -0.35 : 0.35, 0, 0]);
  for (let i = 0; i < 4; i++) add('engine', new THREE.TorusGeometry(0.08, 0.02, 6, 16, Math.PI), [fa - 0.38 + i * 0.15, eY + 0.33, 0], [0, H, 0]);
  // ignition: coil packs + plugs across the head
  for (let i = 0; i < 4; i++) add('ignition', new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), [fa - 0.38 + i * 0.15, eY + 0.3, 0.05]);
  // cooling: radiator + fan
  add('cooling', new THREE.BoxGeometry(0.06, 0.42, s.width * 0.62), [s.length / 2 - 0.32, eY, 0]);
  add('cooling', new THREE.TorusGeometry(0.16, 0.015, 6, 32), [s.length / 2 - 0.4, eY, 0], [0, H, 0]);
  add('cooling', new THREE.CylinderGeometry(0.15, 0.15, 0.25, 16), [s.length / 2 - 0.55, s.belt - 0.12, -s.width * 0.3]);
  // belts: pulleys + belt loop on the engine front
  add('belts', new THREE.TorusGeometry(0.09, 0.012, 6, 24), [fa + 0.18, eY + 0.12, 0.12], [0, H, 0]);
  add('belts', new THREE.TorusGeometry(0.06, 0.012, 6, 24), [fa + 0.18, eY - 0.08, -0.12], [0, H, 0]);
  add('belts', new THREE.TorusGeometry(0.2, 0.01, 4, 40), [fa + 0.2, eY + 0.02, 0], [0, H, 0]);
  add('belts', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(fa + 0.1, eY + 0.2, 0.2), new THREE.Vector3(s.length / 2 - 0.42, eY + 0.15, 0.25), new THREE.Vector3(s.length / 2 - 0.36, eY, 0.3)]), 20, 0.025, 6), [0, 0, 0]);
  // filters: air box + intake, oil filter can
  add('filters', new THREE.BoxGeometry(0.34, 0.16, 0.3), [fa - 0.05, eY + 0.22, -s.width * 0.27]);
  add('filters', new THREE.CylinderGeometry(0.05, 0.05, 0.45, 12), [fa + 0.25, eY + 0.22, -s.width * 0.18], [0, 0, H]);
  add('filters', new THREE.CylinderGeometry(0.05, 0.05, 0.11, 16), [fa - 0.3, eY - 0.15, 0.27], [H, 0, 0]);
  // electrical: battery + alternator + harness
  add('electrical', new THREE.BoxGeometry(0.28, 0.2, 0.18), [fa - 0.45, eY + 0.17, s.width * 0.3]);
  add('electrical', new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16), [fa + 0.08, eY + 0.12, 0.24], [H, 0, 0]);
  add('electrical', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(fa - 0.45, eY + 0.28, s.width * 0.3), new THREE.Vector3(fa - 0.6, s.belt - 0.1, 0), new THREE.Vector3(s.cowlX - 0.5, s.belt - 0.15, 0)]), 20, 0.012, 5), [0, 0, 0]);
  // fluids: oil pan + reservoirs + fuel tank
  add('fluids', new THREE.BoxGeometry(0.5, 0.12, 0.38), [fa - 0.2, eY - 0.3, 0]);
  add('fluids', new THREE.BoxGeometry(0.5, 0.22, s.width * 0.55), [ra + 0.65, s.sill + 0.12, 0]);
  add('fluids', new THREE.CylinderGeometry(0.06, 0.06, 0.14, 12), [s.cowlX + 0.05, s.belt - 0.12, -s.width * 0.32]);
  // brakes: disc + caliper at each wheel
  for (const x of [fa, ra])
    for (const z of [1, -1]) {
      add('brakes', new THREE.CylinderGeometry(s.wheelR * 0.62, s.wheelR * 0.62, 0.025, 32), [x, s.wheelR, z * (s.track / 2 - 0.1)], [H, 0, 0]);
      add('brakes', new THREE.BoxGeometry(0.12, 0.08, 0.07), [x - 0.12, s.wheelR + 0.12, z * (s.track / 2 - 0.08)], [0, 0, 0.6]);
    }
  // suspension: coil + damper at each corner
  for (const x of [fa, ra])
    for (const z of [1, -1]) {
      const pos: [number, number, number] = [x, s.wheelR + 0.3, z * (s.track / 2 - 0.2)];
      add('suspension', helix(0.07, 0.34, 6, 0.012), pos);
      add('suspension', new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), pos);
    }
  // steering: rack, column, wheel
  add('steering', new THREE.CylinderGeometry(0.03, 0.03, s.track * 0.7, 10), [fa - 0.05, s.wheelR + 0.08, 0], [H, 0, 0]);
  add('steering', new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), [s.cowlX - 0.25, s.belt - 0.3, -s.width * 0.2], [0, 0, -0.9]);
  add('steering', new THREE.TorusGeometry(0.18, 0.02, 8, 32), [s.cowlX - 0.62, s.belt + 0.02, -s.width * 0.2], [0, H, 0.35]);
  // drivetrain: gearbox, driveshaft, diff, exhaust
  add('drivetrain', new THREE.CylinderGeometry(0.14, 0.2, 0.6, 16), [fa - 0.75, s.sill + 0.22, 0], [0, 0, H]);
  add('drivetrain', new THREE.CylinderGeometry(0.04, 0.04, Math.abs(ra - fa) - 1.1, 10), [(fa - 1.05 + ra) / 2, s.sill + 0.05, 0], [0, 0, H]);
  add('drivetrain', new THREE.SphereGeometry(0.15, 20, 14), [ra, s.wheelR, 0]);
  add('drivetrain', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(fa - 0.3, s.sill + 0.15, -0.2), new THREE.Vector3(fa - 1.0, s.sill - 0.05, -0.25), new THREE.Vector3(ra + 0.3, s.sill - 0.05, -0.3), new THREE.Vector3(-s.length / 2 + 0.15, s.sill, -0.4)]), 40, 0.035, 8), [0, 0, 0]);
  // lighting: projector housings behind the lenses
  for (const z of [1, -1]) add('lighting', new THREE.SphereGeometry(0.07, 16, 12), [s.length / 2 - 0.14, s.bumperTop + 0.08, z * s.width * 0.34]);
  // wipers
  for (const z of [0.25, -0.15]) add('wipers', new THREE.BoxGeometry(0.03, 0.02, 0.55), [s.cowlX + 0.02, s.belt + 0.03, z], [0, 0.25, 0.35]);

  const dispose = () => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    disposables.forEach((d) => d.dispose());
  };
  return { root, shell, xray, skeleton, systems, anchors, dispose };
}
