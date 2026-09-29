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
  const n = time.length;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#FAFAF8');

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(2.4, 1.8, 2.4);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));

  const AXIS = 1.15;
  const addAxis = (dir: THREE.Vector3) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      dir.clone().multiplyScalar(-AXIS), dir.clone().multiplyScalar(AXIS),
    ]);
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd6d3d1 })));
  };
  addAxis(new THREE.Vector3(1, 0, 0));
  addAxis(new THREE.Vector3(0, 1, 0));
  addAxis(new THREE.Vector3(0, 0, 1));
  const grid = new THREE.GridHelper(2 * AXIS, 8, 0xe7e5e4, 0xefedeb);
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
  const lineMat = new LineMaterial({ vertexColors: true, linewidth: 3.5, worldUnits: false });
  lineMat.resolution.set(sizePx, sizePx);
  const line = new Line2(lineGeo, lineMat);
  scene.add(line);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(sizePx, sizePx);
  renderer.setPixelRatio(1);
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');

  // Limpieza del contexto WebGL efímero.
  lineGeo.dispose();
  lineMat.dispose();
  renderer.dispose();
  renderer.forceContextLoss();

  return dataUrl;
}
