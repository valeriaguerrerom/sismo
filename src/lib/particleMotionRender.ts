/**
 * Renderizador offscreen del "Movimiento de partícula" (hodograma 3D) para el
 * PDF. Reproduce el mismo mapeo y colores que el componente en pantalla
 * (`ParticleMotion.tsx`) pero dibuja la TRAYECTORIA COMPLETA en un canvas
 * fuera de pantalla y devuelve un PNG (data URL). No hay interacción ni
 * animación: es una foto fija en una vista 3D fija.
 *
 * Ejes: Este → x, Vertical → y (hacia arriba), Norte → z. Las tres componentes
 * comparten una sola escala (el máximo absoluto común de las tres), igual que
 * en pantalla. Tramos por arribo: gris (reposo), terracota (P), verde (S).
 *
 * @module lib/particleMotionRender
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { WaveData } from './types';

const COLOR_REST = new THREE.Color('#A8A29E');
const COLOR_P = new THREE.Color('#C4553A');
const COLOR_S = new THREE.Color('#2D6A4F');

export interface ParticleMotionRenderOpts {
  waveData: WaveData;
  pArrival: number;
  sArrival: number;
  /** Lado del PNG en píxeles (cuadrado). */
  sizePx?: number;
}

/**
 * Renderiza el hodograma 3D completo a un PNG (data URL). Crea un renderer
 * WebGL efímero, dibuja la escena una vez y lo destruye.
 */
export function renderParticleMotionPng(opts: ParticleMotionRenderOpts): string {
  const { waveData, pArrival, sArrival, sizePx = 900 } = opts;
  const { time, north, east, vertical } = waveData;
  const nAll = time.length;
  // Misma ventana limpia que en pantalla: hasta un poco después de la S, para
  // que la trayectoria no sea un ovillo de coda.
  const winEnd = (sArrival > 0 && pArrival > 0)
    ? sArrival + (sArrival - pArrival) + 2.0
    : (time[nAll - 1] || 1);
  let n = nAll;
  for (let i = 0; i < nAll; i++) { if (time[i] > winEnd) { n = i; break; } }
  n = Math.max(2, n);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#FAFAF8');

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  // Vista casi "de frente" (poca elevación): la Vertical (Z) queda arriba, el
  // Norte a la derecha y el Este hacia el fondo, como se prefiere para el PDF.
  // Altura baja (y pequeño) con un ligero picado para dar relieve; el
  // auto-encuadre posterior solo ajusta la DISTANCIA, conserva esta dirección.
  camera.position.set(1.35, 0.55, 2.35);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));

  const AXIS = 1.15;
  const addAxis = (dir: THREE.Vector3) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      dir.clone().multiplyScalar(-AXIS), dir.clone().multiplyScalar(AXIS),
    ]);
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xcfcbc6 })));
  };
  addAxis(new THREE.Vector3(1, 0, 0));
  addAxis(new THREE.Vector3(0, 1, 0));
  addAxis(new THREE.Vector3(0, 0, 1));
  const grid = new THREE.GridHelper(2 * AXIS, 8, 0xe0ddd9, 0xeeece9);
  scene.add(grid);

  // Escala común (máximo absoluto de las tres componentes).
  let peak = 0;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(north[i]), Math.abs(east[i]), Math.abs(vertical[i]));
  }
  const s = peak > 0 ? AXIS / peak : 1;

  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < n; i++) {
    positions.push(east[i] * s, vertical[i] * s, north[i] * s);
    const c = time[i] < pArrival ? COLOR_REST : time[i] < sArrival ? COLOR_P : COLOR_S;
    colors.push(c.r, c.g, c.b);
  }
  const lineGeo = new LineGeometry();
  lineGeo.setPositions(positions);
  lineGeo.setColors(colors);
  // Línea más gruesa para el PDF (se ve como una cinta clara, no un hilo).
  const lineMat = new LineMaterial({ vertexColors: true, linewidth: 5, worldUnits: false });
  lineMat.resolution.set(sizePx, sizePx);
  const line = new Line2(lineGeo, lineMat);
  scene.add(line);

  // Origen (posición de reposo) marcado con un punto oscuro.
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x1a1a2e }),
  );
  scene.add(origin);

  // ── Encuadre a partir de la extensión REAL de la trayectoria ──
  // Se proyectan todos los puntos (más las puntas de los ejes rotulados) a NDC
  // y se aleja la cámara hasta que TODO quepa con un margen pequeño, así la
  // trayectoria no se sale por los lados. Se itera un par de veces porque la
  // proyección en perspectiva no es lineal.
  const dir0 = camera.position.clone().normalize();
  const AXLBL = AXIS + 0.14; // las etiquetas de eje viven un poco más lejos
  const fitPts: THREE.Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    fitPts.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  fitPts.push(new THREE.Vector3(AXLBL, 0, 0), new THREE.Vector3(0, AXLBL, 0), new THREE.Vector3(0, 0, AXLBL));
  const TARGET = 0.82; // deja ~18 % de margen alrededor
  for (let iter = 0; iter < 4; iter++) {
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let maxNdc = 0;
    for (const p of fitPts) {
      const q = p.clone().project(camera);
      maxNdc = Math.max(maxNdc, Math.abs(q.x), Math.abs(q.y));
    }
    if (maxNdc < 1e-6) break;
    const ratio = maxNdc / TARGET;
    // Si ya cabe con el margen deseado (ratio ≈ 1), no seguimos alejando.
    if (ratio <= 1.02 && ratio >= 0.9) break;
    const dist = camera.position.length() * ratio;
    camera.position.copy(dir0).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(sizePx, sizePx);
  renderer.setPixelRatio(1);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  // ── Composición 2D: sobre el render 3D dibujamos las etiquetas de los ejes
  //    (N/E/Z), proyectando la punta de cada eje a coordenadas de pantalla, y
  //    un marco sutil. Así el PDF no depende de CSS2DRenderer (que no existe
  //    offscreen) y se ve rotulado y ordenado. ──
  const out = document.createElement('canvas');
  out.width = sizePx; out.height = sizePx;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(renderer.domElement, 0, 0);

  const project = (v: THREE.Vector3): { x: number; y: number } => {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * sizePx, y: (-p.y * 0.5 + 0.5) * sizePx };
  };
  const labelAt = (v: THREE.Vector3, text: string) => {
    const proj = project(v);
    ctx.font = `600 ${Math.round(sizePx * 0.03)}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    const padX = sizePx * 0.012, padY = sizePx * 0.009;
    const bw = w + padX * 2, bh = Math.round(sizePx * 0.03) + padY * 2;
    // Se mantiene la caja de la etiqueta DENTRO del lienzo (con 2 px de aire),
    // así ningún rótulo (p. ej. "Vertical (Z)" arriba) queda cortado (B1).
    const margin = 2;
    let bx = proj.x - bw / 2;
    let by = proj.y - bh / 2;
    bx = Math.max(margin, Math.min(sizePx - bw - margin, bx));
    by = Math.max(margin, Math.min(sizePx - bh - margin, by));
    const x = bx + bw / 2;
    const y = by + bh / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    // rectángulo redondeado
    const r = sizePx * 0.008;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#57534e';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  };
  const AX = AXIS + 0.14;
  labelAt(new THREE.Vector3(AX, 0, 0), 'Este (E)');
  labelAt(new THREE.Vector3(0, AX, 0), 'Vertical (Z)');
  labelAt(new THREE.Vector3(0, 0, AX), 'Norte (N)');

  const dataUrl = out.toDataURL('image/png');

  // Limpieza del contexto WebGL efímero.
  lineGeo.dispose();
  lineMat.dispose();
  renderer.dispose();
  renderer.forceContextLoss();

  return dataUrl;
}
