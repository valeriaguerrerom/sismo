/**
 * TerrainBlock — construye el bloque 3D del dominio de Nariño con relieve real.
 *
 * - Cara superior: PlaneGeometry desplazado por el heightmap (exageración ×2.5)
 *   y texturizado con el hillshade.
 * - Caras laterales: estratos geológicos (corteza superior/inferior, Moho, manto)
 *   con etiquetas de profundidad.
 * - Costa y límite departamental como líneas sobre la superficie (siguen el relieve).
 *
 * No hay física aquí: solo geometría para dibujar. Expone `sampleHeightAt(x,z)`
 * para que los frentes de onda sigan el relieve.
 *
 * @module map3d/TerrainBlock
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  BLOCK, DEPTH_LAYERS, TERRAIN_SCENE_HEIGHT, DOMAIN, depthToY, lonToX, latToZ,
} from './domain';

export interface TerrainHandle {
  group: THREE.Group;
  /** Altura (Y de escena) del relieve en la posición (x,z) de escena. */
  sampleHeightAt: (x: number, z: number) => number;
  /** Oculta (true) o muestra (false) el eje de profundidad + Moho en vista superior. */
  setTopView: (isTop: boolean) => void;
  dispose: () => void;
}

const SEG = 200; // segmentación del plano (200×200); se puede bajar por rendimiento

/** Colores de las capas geológicas (corte). */
const LAYER_COLORS: Record<string, number> = {
  crustUpper: 0x9aa3ad, // 0–15 km corteza superior (gris claro)
  crustLower: 0x6b7280, // 15–35 km corteza inferior (gris medio)
  mantle: 0x3a3340,     // 35–200 km manto (más oscuro)
  moho: 0xffcc66,       // línea del Moho a 35 km
};

// Paradas de color para el degradado suave por profundidad de las paredes.
// Corteza: tonos gris-azulados claros. Manto: más oscuro/cálido pero con
// suficiente contraste frente al fondo de escena (0x0a0e1a) para no fundirse.
const DEPTH_GRADIENT: { km: number; color: number }[] = [
  { km: 0, color: 0xaeb8c4 },   // superficie: gris-azulado claro
  { km: 15, color: 0x8791a0 },  // base corteza superior
  { km: 35, color: 0x6a5f6e },  // Moho: transición corteza→manto
  { km: 80, color: 0x5a4a4e },  // manto superior (cálido, aún legible)
  { km: 200, color: 0x4a3a3c }, // manto profundo (contraste sobre el fondo)
];

/** Interpola el color del degradado de profundidad para una profundidad (km). */
function gradientColorAtKm(km: number): THREE.Color {
  const stops = DEPTH_GRADIENT;
  if (km <= stops[0].km) return new THREE.Color(stops[0].color);
  const last = stops[stops.length - 1];
  if (km >= last.km) return new THREE.Color(last.color);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (km >= a.km && km <= b.km) {
      const t = (km - a.km) / (b.km - a.km);
      return new THREE.Color(a.color).lerp(new THREE.Color(b.color), t);
    }
  }
  return new THREE.Color(last.color);
}

/**
 * Construye el bloque de terreno y lo añade a la escena.
 *
 * @param scene Escena Three.js.
 * @param heightTex Textura del heightmap (escala de grises).
 * @param hillshadeTex Textura del hillshade (color).
 * @param coast Polilíneas de costa [[lon,lat],...].
 * @param border Polilíneas de límite [[lon,lat],...].
 * @param heightData Datos crudos del heightmap para muestrear altura (0–255) o null.
 * @param segments Segmentación del plano (por defecto 200).
 */
export function buildTerrainBlock(
  scene: THREE.Scene,
  _heightTex: THREE.Texture | null,
  hillshadeTex: THREE.Texture | null,
  coast: number[][][],
  border: number[][][],
  heightData: { data: Uint8ClampedArray; w: number; h: number } | null,
  segments: number = SEG,
  /** Anillo [lon,lat] del departamento; si se da, el bloque toma su forma. */
  ring: number[][] | null = null,
): TerrainHandle {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // ── Muestreo de altura desde el heightmap (para relieve y frentes) ──
  const sampleNorm = (u: number, v: number): number => {
    if (!heightData) return 0;
    const { data, w, h } = heightData;
    const px = Math.min(w - 1, Math.max(0, Math.floor(u * (w - 1))));
    // v: 0 abajo(sur) → fila h-1; el heightmap tiene norte arriba (fila 0)
    const py = Math.min(h - 1, Math.max(0, Math.floor((1 - v) * (h - 1))));
    return data[(py * w + px) * 4] / 255;
  };

  /** Altura de escena del relieve en (x,z). Se define antes para reutilizarla. */
  const sampleHeightAtXZ = (x: number, z: number): number => {
    const u = x / BLOCK.width + 0.5;
    const v = -z / BLOCK.depthXY + 0.5;
    return sampleNorm(u, v) * TERRAIN_SCENE_HEIGHT;
  };

  // ═══════════════════════════════════════════════════════════════════
  // MODO SILUETA: si hay anillo del departamento, el bloque toma su forma.
  // Superficie recortada (ShapeGeometry) + paredes laterales que siguen el
  // contorno + tapa inferior. Reemplaza el plano y las cajas rectangulares.
  // ═══════════════════════════════════════════════════════════════════
  if (ring && ring.length >= 3) {
    return buildSilhouetteBlock(
      scene, group, disposables, hillshadeTex, coast, border, ring,
      sampleHeightAtXZ,
    );
  }

  // ── Superficie con relieve ──
  const planeGeo = new THREE.PlaneGeometry(BLOCK.width, BLOCK.depthXY, segments, segments);
  const pos = planeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // en el plano sin rotar, Y es la coordenada "vertical" (será Z)
    const u = x / BLOCK.width + 0.5;
    const v = y / BLOCK.depthXY + 0.5;
    pos.setZ(i, sampleNorm(u, v) * TERRAIN_SCENE_HEIGHT);
  }
  planeGeo.computeVertexNormals();
  const surfMat = new THREE.MeshStandardMaterial({
    map: hillshadeTex ?? undefined,
    color: hillshadeTex ? 0xffffff : 0x4a6a4a,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(planeGeo, surfMat);
  surface.rotation.x = -Math.PI / 2;
  group.add(surface);
  disposables.push(planeGeo, surfMat);

  /** Altura de escena del relieve en (x,z). */
  const sampleHeightAt = (x: number, z: number): number => {
    const u = x / BLOCK.width + 0.5;
    const v = -z / BLOCK.depthXY + 0.5;
    return sampleNorm(u, v) * TERRAIN_SCENE_HEIGHT;
  };

  // ── Bloque de subsuelo con estratos ──
  const layerDefs = [
    { from: 0, to: 15, color: LAYER_COLORS.crustUpper },
    { from: 15, to: 35, color: LAYER_COLORS.crustLower },
    { from: 35, to: 200, color: LAYER_COLORS.mantle },
  ];
  for (const L of layerDefs) {
    const yTop = depthToY(L.from);
    const yBot = depthToY(L.to);
    const h = Math.abs(yTop - yBot);
    const boxGeo = new THREE.BoxGeometry(BLOCK.width, h, BLOCK.depthXY);
    const mat = new THREE.MeshStandardMaterial({
      color: L.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      roughness: 1, metalness: 0,
    });
    const box = new THREE.Mesh(boxGeo, mat);
    box.position.y = (yTop + yBot) / 2;
    group.add(box);
    disposables.push(boxGeo, mat);
  }

  // Grupo del eje de profundidad + Moho (se oculta en vista superior).
  const axisGroup = new THREE.Group();
  group.add(axisGroup);

  // ── Línea del Moho (35 km) resaltada en las 4 aristas ──
  const mohoY = depthToY(35);
  const mohoGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-BLOCK.width / 2, mohoY, -BLOCK.depthXY / 2),
    new THREE.Vector3(BLOCK.width / 2, mohoY, -BLOCK.depthXY / 2),
    new THREE.Vector3(BLOCK.width / 2, mohoY, BLOCK.depthXY / 2),
    new THREE.Vector3(-BLOCK.width / 2, mohoY, BLOCK.depthXY / 2),
    new THREE.Vector3(-BLOCK.width / 2, mohoY, -BLOCK.depthXY / 2),
  ]);
  const moho = new THREE.Line(mohoGeo, new THREE.LineBasicMaterial({ color: LAYER_COLORS.moho, linewidth: 2 }));
  axisGroup.add(moho);
  disposables.push(mohoGeo);

  // ── Etiquetas de profundidad en la cara +X ──
  const cutX = BLOCK.width / 2 + 0.1;
  for (const km of DEPTH_LAYERS) {
    const y = depthToY(km);
    const div = document.createElement('div');
    div.textContent = km === 35 ? '35 km · Moho' : `${km} km`;
    div.style.cssText = `font-family:monospace;font-size:9px;color:${km === 35 ? '#ffcc66' : '#c8d4e0'};text-shadow:0 0 3px #000,0 0 3px #000;background:rgba(0,0,0,0.4);padding:0 3px;border-radius:2px;white-space:nowrap;`;
    const label = new CSS2DObject(div);
    label.position.set(cutX, y, BLOCK.depthXY / 2 + 0.5);
    axisGroup.add(label);
  }

  // ── Costa y límite departamental sobre el relieve ──
  const drawGeoLines = (lines: number[][][], color: number, yOffset: number) => {
    for (const line of lines) {
      const pts: THREE.Vector3[] = [];
      for (const [lon, lat] of line) {
        const x = lonToX(lon);
        const z = latToZ(lat);
        const y = sampleHeightAt(x, z) + yOffset;
        pts.push(new THREE.Vector3(x, y, z));
      }
      if (pts.length < 2) continue;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
      group.add(new THREE.Line(geo, mat));
      disposables.push(geo, mat);
    }
  };
  drawGeoLines(coast, 0x66ccff, 0.06); // costa en celeste
  drawGeoLines(border, 0xffdd88, 0.08); // límite departamental en dorado

  scene.add(group);

  return {
    group,
    sampleHeightAt,
    setTopView: (isTop: boolean) => { axisGroup.visible = !isTop; },
    dispose: () => {
      disposables.forEach(d => d.dispose());
      scene.remove(group);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Prueba punto-en-polígono (ray casting) sobre el anillo en coords de escena.
// ─────────────────────────────────────────────────────────────────────
function pointInRing(x: number, z: number, ringXZ: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ringXZ.length - 1; i < ringXZ.length; j = i++) {
    const [xi, zi] = ringXZ[i];
    const [xj, zj] = ringXZ[j];
    const intersect = (zi > z) !== (zj > z) &&
      x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-30) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Construye el bloque 3D con la SILUETA del departamento de Nariño.
 *
 * - Superficie: malla regular densa recortada al polígono (triángulos cuyo
 *   centro cae fuera del anillo se descartan), desplazada por el heightmap y
 *   texturizada con el hillshade.
 * - Paredes laterales: un "faldón" vertical que sigue el contorno, desde la
 *   superficie hasta la profundidad máxima, coloreado por estratos geológicos.
 * - Tapa inferior: el polígono a profundidad máxima.
 *
 * @returns TerrainHandle equivalente al del bloque rectangular.
 */
function buildSilhouetteBlock(
  scene: THREE.Scene,
  group: THREE.Group,
  disposables: { dispose: () => void }[],
  hillshadeTex: THREE.Texture | null,
  coast: number[][][],
  border: number[][][],
  ring: number[][],
  sampleHeightAt: (x: number, z: number) => number,
): TerrainHandle {
  // Anillo en coordenadas de escena (x = lon, z = lat).
  const ringXZ: [number, number][] = ring.map(([lon, lat]) => [lonToX(lon), latToZ(lat)]);

  // Grupo del eje de profundidad + Moho + rejilla de niveles. Se oculta en
  // vista superior (setTopView) porque de planta no aporta información.
  const axisGroupInner = new THREE.Group();
  group.add(axisGroupInner);

  // ── Superficie: malla regular recortada al polígono ──
  const SEGX = 180, SEGZ = 180;
  const x0 = -BLOCK.width / 2, z0 = -BLOCK.depthXY / 2;
  const dx = BLOCK.width / SEGX, dz = BLOCK.depthXY / SEGZ;

  const positions: number[] = [];
  const uvs: number[] = [];
  const surfIndices: number[] = [];
  // Índice de vértice por celda de rejilla (o -1 si el vértice no se usa).
  const vIndex = new Int32Array((SEGX + 1) * (SEGZ + 1)).fill(-1);

  const vAt = (ix: number, iz: number): number => {
    const key = iz * (SEGX + 1) + ix;
    if (vIndex[key] !== -1) return vIndex[key];
    const x = x0 + ix * dx;
    const z = z0 + iz * dz;
    const y = sampleHeightAt(x, z);
    const idx = positions.length / 3;
    positions.push(x, y, z);
    // UV por bounding box del bloque (coincide con el hillshade del dominio).
    uvs.push(x / BLOCK.width + 0.5, 1 - (z / BLOCK.depthXY + 0.5));
    vIndex[key] = idx;
    return idx;
  };

  for (let iz = 0; iz < SEGZ; iz++) {
    for (let ix = 0; ix < SEGX; ix++) {
      // Centro de la celda: si cae dentro del polígono, se conserva.
      const cx = x0 + (ix + 0.5) * dx;
      const cz = z0 + (iz + 0.5) * dz;
      if (!pointInRing(cx, cz, ringXZ)) continue;
      const a = vAt(ix, iz);
      const b = vAt(ix + 1, iz);
      const c = vAt(ix + 1, iz + 1);
      const d = vAt(ix, iz + 1);
      surfIndices.push(a, d, b, b, d, c); // dos triángulos (CCW mirando -Y)
    }
  }

  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  surfGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  surfGeo.setIndex(surfIndices);
  surfGeo.computeVertexNormals();
  // Terreno más claro: baja roughness, súbele el color base y añade un
  // emissive tenue para que el relieve no se vea apagado sobre el fondo oscuro.
  const surfMat = new THREE.MeshStandardMaterial({
    map: hillshadeTex ?? undefined,
    color: hillshadeTex ? 0xffffff : 0x6f8f6a,
    emissive: 0x2a3038,
    emissiveIntensity: 0.35,
    roughness: 0.78, metalness: 0.0, side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  group.add(surface);
  disposables.push(surfGeo, surfMat);

  /** Altura de escena del relieve en (x,z). */
  const sampleHeightAtPublic = (x: number, z: number): number => sampleHeightAt(x, z);

  // ── Paredes laterales (faldón que sigue el contorno) ──
  // Para cada arista del anillo, un quad vertical desde la superficie hasta el
  // fondo del bloque. Se colorea por estrato según la profundidad del vértice.
  const yBottom = depthToY(DOMAIN.depthMax);
  const wallPos: number[] = [];
  const wallCol: number[] = [];
  const wallIdx: number[] = [];

  // Profundidad (km) a partir de una Y de escena (interpolación lineal del bloque).
  const depthKmFromY = (y: number): number => {
    const yTop = 0; // superficie a y≈0 (el relieve suma un poco, se ignora aquí)
    const t = (yTop - y) / (yTop - yBottom);
    return t * DOMAIN.depthMax;
  };

  // Muchas subdivisiones verticales → el degradado por vértice es suave (sin
  // las "rayas verticales" que producían las bandas de color escalonadas).
  const VSEG = 48;
  for (let i = 0; i < ringXZ.length; i++) {
    const [xA, zA] = ringXZ[i];
    const [xB, zB] = ringXZ[(i + 1) % ringXZ.length];
    const yTopA = sampleHeightAt(xA, zA);
    const yTopB = sampleHeightAt(xB, zB);

    // Columna de vértices A y B, desde su cima hasta el fondo.
    const baseIdx = wallPos.length / 3;
    for (let s = 0; s <= VSEG; s++) {
      const t = s / VSEG;
      const yA = yTopA + (yBottom - yTopA) * t;
      const yB = yTopB + (yBottom - yTopB) * t;
      wallPos.push(xA, yA, zA);
      const cA = gradientColorAtKm(depthKmFromY(yA));
      wallCol.push(cA.r, cA.g, cA.b);
      wallPos.push(xB, yB, zB);
      const cB = gradientColorAtKm(depthKmFromY(yB));
      wallCol.push(cB.r, cB.g, cB.b);
    }
    // Triángulos entre filas consecutivas (cada fila tiene 2 vértices: A,B).
    for (let s = 0; s < VSEG; s++) {
      const r0 = baseIdx + s * 2;
      const r1 = baseIdx + (s + 1) * 2;
      wallIdx.push(r0, r0 + 1, r1, r1, r0 + 1, r1 + 1);
    }
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
  wallGeo.setIndex(wallIdx);
  wallGeo.computeVertexNormals();
  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.95,
    side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
  });
  group.add(new THREE.Mesh(wallGeo, wallMat));
  disposables.push(wallGeo, wallMat);

  // ── Tapa inferior (polígono a profundidad máxima) ──
  const capShape = new THREE.Shape(ringXZ.map(([x, z]) => new THREE.Vector2(x, z)));
  const capGeo = new THREE.ShapeGeometry(capShape);
  // ShapeGeometry vive en el plano XY; lo rotamos a XZ y bajamos al fondo.
  capGeo.rotateX(-Math.PI / 2);
  capGeo.translate(0, yBottom, 0);
  // La tapa usa el color del degradado a profundidad máxima (coincide con la
  // base de las paredes) y comparte exactamente el anillo (sin sobresalir).
  const capMat = new THREE.MeshStandardMaterial({
    color: gradientColorAtKm(DOMAIN.depthMax), transparent: true, opacity: 0.95,
    side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
  });
  group.add(new THREE.Mesh(capGeo, capMat));
  disposables.push(capGeo, capMat);

  // ── Contorno del departamento sobre el relieve (dorado) con leve brillo ──
  const ringPts: THREE.Vector3[] = ringXZ.map(([x, z]) =>
    new THREE.Vector3(x, sampleHeightAt(x, z) + 0.08, z));
  ringPts.push(ringPts[0].clone());
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  // Doble trazo: uno ancho tenue (halo) y otro nítido, para simular el brillo
  // en las aristas superiores del contorno.
  const ringGlowMat = new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.35 });
  const ringGlow = new THREE.Line(ringGeo, ringGlowMat);
  ringGlow.scale.setScalar(1.004);
  group.add(ringGlow);
  const ringMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.95 });
  group.add(new THREE.Line(ringGeo, ringMat));
  disposables.push(ringGeo, ringMat, ringGlowMat);

  // ── Rejilla horizontal sutil sobre las paredes en cada nivel de profundidad ──
  // Una línea cerrada que sigue el contorno del anillo a cada Y de DEPTH_LAYERS.
  for (const km of DEPTH_LAYERS) {
    if (km <= 0) continue; // el nivel 0 ya lo marca el contorno de superficie
    const y = depthToY(km);
    const pts = ringXZ.map(([x, z]) => new THREE.Vector3(x, y, z));
    pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const isMoho = km === 35;
    const mat = new THREE.LineBasicMaterial({
      color: isMoho ? LAYER_COLORS.moho : 0x8894a4,
      transparent: true,
      opacity: isMoho ? 0.9 : 0.28,
    });
    axisGroupInner.add(new THREE.Line(geo, mat));
    disposables.push(geo, mat);
  }

  // ── Costa y (líneas internas del) límite sobre el relieve ──
  const drawGeoLines = (lines: number[][][], color: number, yOffset: number) => {
    for (const line of lines) {
      const pts: THREE.Vector3[] = [];
      for (const [lon, lat] of line) {
        const x = lonToX(lon), z = latToZ(lat);
        pts.push(new THREE.Vector3(x, sampleHeightAt(x, z) + yOffset, z));
      }
      if (pts.length < 2) continue;
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
      group.add(new THREE.Line(geo, mat));
      disposables.push(geo, mat);
    }
  };
  // Costa y límites recortados al polígono, para no pintar tramos fuera de la
  // silueta (que asomarían como líneas sueltas fuera del bloque).
  const clipLinesToRing = (lines: number[][][]): number[][][] =>
    lines.map(line => line.filter(([lon, lat]) => pointInRing(lonToX(lon), latToZ(lat), ringXZ)))
      .filter(seg => seg.length >= 2);
  drawGeoLines(clipLinesToRing(coast), 0x66ccff, 0.06);
  drawGeoLines(clipLinesToRing(border), 0xffdd88, 0.05);

  // ── Eje de profundidad en la ARISTA FRONTAL del bloque ──
  // Arista frontal = punto del anillo con mayor Z de escena (más al frente
  // hacia la cámara por defecto), lejos del reparto de estaciones.
  let frontIdx = 0;
  for (let i = 1; i < ringXZ.length; i++) if (ringXZ[i][1] > ringXZ[frontIdx][1]) frontIdx = i;
  const [axX, axZ] = ringXZ[frontIdx];
  // El 0 km coincide con la superficie real del terreno en ese punto.
  const surfY0 = sampleHeightAt(axX, axZ);

  // Línea vertical del eje (de la superficie al fondo) sobre la arista frontal.
  const axisLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(axX, surfY0, axZ + 0.05),
    new THREE.Vector3(axX, depthToY(DOMAIN.depthMax), axZ + 0.05),
  ]);
  const axisLineMat = new THREE.LineBasicMaterial({ color: 0xaab4c2, transparent: true, opacity: 0.5 });
  axisGroupInner.add(new THREE.Line(axisLineGeo, axisLineMat));
  disposables.push(axisLineGeo, axisLineMat);

  for (const km of DEPTH_LAYERS) {
    // El nivel 0 se ancla a la superficie real; el resto a su profundidad.
    const y = km === 0 ? surfY0 : depthToY(km);

    // Marca horizontal tenue (tick) hacia afuera de la arista frontal.
    const tickGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(axX, y, axZ + 0.05),
      new THREE.Vector3(axX, y, axZ + 0.6),
    ]);
    const tickMat = new THREE.LineBasicMaterial({
      color: km === 35 ? LAYER_COLORS.moho : 0x9aa6b6,
      transparent: true, opacity: km === 35 ? 0.85 : 0.5,
    });
    axisGroupInner.add(new THREE.Line(tickGeo, tickMat));
    disposables.push(tickGeo, tickMat);

    const div = document.createElement('div');
    div.textContent = km === 35 ? '35 km · Moho' : `${km} km`;
    div.style.cssText = `font-family:monospace;font-size:9px;color:${km === 35 ? '#ffcc66' : '#c8d4e0'};text-shadow:0 0 3px #000,0 0 3px #000;background:rgba(0,0,0,0.4);padding:0 3px;border-radius:2px;white-space:nowrap;`;
    const label = new CSS2DObject(div);
    label.position.set(axX, y, axZ + 0.75);
    axisGroupInner.add(label);
  }

  scene.add(group);
  return {
    group,
    sampleHeightAt: sampleHeightAtPublic,
    setTopView: (isTop: boolean) => { axisGroupInner.visible = !isTop; },
    dispose: () => {
      disposables.forEach(d => d.dispose());
      // Eliminar del DOM los elementos de las etiquetas CSS2D (eje de
      // profundidad, etc.) para que no queden huérfanos al reconstruir.
      group.traverse((obj) => {
        const el = (obj as unknown as { element?: HTMLElement }).element;
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      scene.remove(group);
    },
  };
}

/**
 * Carga las polilíneas de costa/límite desde public/terrain.
 * @returns Promesa con {coast, border} (arrays vacíos si no existen).
 */
export async function loadGeoLines(): Promise<{ coast: number[][][]; border: number[][][] }> {
  const safe = async (url: string): Promise<number[][][]> => {
    try {
      const r = await fetch(url);
      if (!r.ok) return [];
      return (await r.json()) as number[][][];
    } catch {
      return [];
    }
  };
  const [coast, border] = await Promise.all([
    safe('/terrain/narino_coast.json'),
    safe('/terrain/narino_border.json'),
  ]);
  return { coast, border };
}

export { loadNarinoRing } from './narinoSilhouette';

/**
 * Lee el heightmap como datos de píxeles para muestrear altura en el cliente.
 * @returns Promesa con {data,w,h} o null si no existe.
 */
export async function loadHeightData(): Promise<{ data: Uint8ClampedArray; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      resolve({ data: imgData.data, w: img.width, h: img.height });
    };
    img.onerror = () => resolve(null);
    img.src = '/terrain/narino_heightmap.png';
  });
}
