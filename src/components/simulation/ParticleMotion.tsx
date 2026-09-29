/**
 * Movimiento de partícula (hodograma 3D).
 *
 * Dibuja la trayectoria que describe una partícula del suelo en la estación,
 * usando las tres componentes reales del registro (Norte, Este, Vertical) como
 * ejes de un espacio 3D. La línea se va construyendo con el tiempo compartido
 * del reproductor (`currentTime`): así se ve, instante a instante, cómo se
 * mueve el suelo.
 *
 * Colores del tramo según los tiempos de arribo:
 *  - Antes de la P: gris (reposo / ruido).
 *  - Entre P y S: terracota (dominan las ondas P, en la dirección de propagación).
 *  - Después de la S: verde bosque (dominan las ondas S, perpendiculares).
 *
 * Interacción: rotación con el mouse (OrbitControls). En pausa, un giro
 * automático lento ayuda a percibir la forma 3D; se desactiva si el usuario
 * prefiere menos movimiento (`prefers-reduced-motion`).
 *
 * @module components/simulation/ParticleMotion
 */
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { WaveData } from '../../lib/types';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  /** Series triaxiales reales (Norte, Este, Vertical) de la estación. */
  waveData: WaveData;
  /** Tiempo de arribo de la onda P (s). */
  pArrival: number;
  /** Tiempo de arribo de la onda S (s). */
  sArrival: number;
  /** Tiempo actual del reproductor compartido (s). */
  currentTime: number;
}

// Paleta de la plataforma (sin neón): gris reposo, terracota P, verde S.
const COLOR_REST = new THREE.Color('#A8A29E'); // stone-400
const COLOR_P = new THREE.Color('#C4553A');    // terracota
const COLOR_S = new THREE.Color('#2D6A4F');    // verde bosque

/** ¿El usuario pidió menos movimiento? (accesibilidad) */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function ParticleMotion({ waveData, pArrival, sArrival, currentTime }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Datos frescos para el loop de animación sin recrear la escena.
  const dataRef = useRef({ currentTime });
  dataRef.current = { currentTime };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight || 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#FAFAF8'); // fondo claro de la app

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.4, 1.8, 2.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Etiquetas de ejes (CSS2D) superpuestas.
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mount.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 8;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    // ── Ejes rotulados: Este (x), Vertical (y), Norte (z) ──
    const AXIS = 1.15;
    const axisMat = (hex: number) => new THREE.LineBasicMaterial({ color: hex });
    const addAxis = (dir: THREE.Vector3, hex: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        dir.clone().multiplyScalar(-AXIS), dir.clone().multiplyScalar(AXIS),
      ]);
      scene.add(new THREE.Line(geo, axisMat(hex)));
    };
    addAxis(new THREE.Vector3(1, 0, 0), 0xd6d3d1); // Este
    addAxis(new THREE.Vector3(0, 1, 0), 0xd6d3d1); // Vertical
    addAxis(new THREE.Vector3(0, 0, 1), 0xd6d3d1); // Norte

    const mkLabel = (text: string, pos: THREE.Vector3) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = 'font:600 13px Inter,system-ui,sans-serif;color:#57534E;background:rgba(255,255,255,.85);border:1px solid #E7E5E4;border-radius:6px;padding:1px 6px;white-space:nowrap;';
      const obj = new CSS2DObject(el);
      obj.position.copy(pos);
      scene.add(obj);
    };
    mkLabel('Este (E)', new THREE.Vector3(AXIS + 0.12, 0, 0));
    mkLabel('Vertical (Z)', new THREE.Vector3(0, AXIS + 0.12, 0));
    mkLabel('Norte (N)', new THREE.Vector3(0, 0, AXIS + 0.12));

    // Rejilla de referencia en el plano horizontal N-E.
    const grid = new THREE.GridHelper(2 * AXIS, 8, 0xe7e5e4, 0xefedeb);
    scene.add(grid);

    // ── Trayectoria de la partícula ──
    // Normaliza cada componente contra el pico común de las tres para conservar
    // las proporciones reales del movimiento (no deforma la forma 3D).
    const { time, north, east, vertical } = waveData;
    const n = time.length;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, Math.abs(north[i]), Math.abs(east[i]), Math.abs(vertical[i]));
    }
    const s = peak > 0 ? AXIS / peak : 1;
    // Posiciones y color por vértice (según arribo P/S).
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = east[i] * s;      // x = Este
      positions[i * 3 + 1] = vertical[i] * s; // y = Vertical
      positions[i * 3 + 2] = north[i] * s;    // z = Norte
      const c = time[i] < pArrival ? COLOR_REST : time[i] < sArrival ? COLOR_P : COLOR_S;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true });
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);

    // Punta que marca la posición actual de la partícula.
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a1a2e }),
    );
    scene.add(head);

    const lastT = time[n - 1] || 1;
    const reduced = prefersReducedMotion();

    // Cuántos vértices mostrar según el tiempo actual (línea que "crece").
    const setDrawCount = (t: number) => {
      // índice del último vértice con time <= t.
      let idx = 0;
      while (idx < n && time[idx] <= t) idx++;
      lineGeo.setDrawRange(0, Math.max(1, idx));
      const j = Math.min(n - 1, Math.max(0, idx - 1));
      head.position.set(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
    };
    setDrawCount(dataRef.current.currentTime);

    // ── Loop de render ──
    let raf = 0;
    let userInteracting = false;
    controls.addEventListener('start', () => { userInteracting = true; });
    controls.addEventListener('end', () => { userInteracting = false; });

    const animate = () => {
      raf = requestAnimationFrame(animate);
      setDrawCount(dataRef.current.currentTime);
      // Giro automático lento SOLO en "pausa" (línea completa) y sin interacción,
      // respetando prefers-reduced-motion.
      const paused = dataRef.current.currentTime >= lastT - 1e-6;
      if (paused && !userInteracting && !reduced) {
        scene.rotation.y += 0.0025;
      }
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate();

    // ── Resize ──
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight || 360;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      controls.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (labelRenderer.domElement.parentNode) labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
    };
    // Recrea la escena si cambian los datos o los arribos (nueva simulación).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveData, pArrival, sArrival]);

  return (
    <div className="space-y-3">
      <div
        ref={mountRef}
        className="relative w-full h-[clamp(300px,50vh,480px)] rounded-xl border border-stone-200/60 shadow-sm overflow-hidden bg-[#FAFAF8]"
      />
      {/* Leyenda de tramos */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-stone-500 px-1">
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#A8A29E] inline-block" /> Reposo</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#C4553A] inline-block" /> Onda P</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#2D6A4F] inline-block" /> Onda S</span>
        <span className="ml-auto flex items-center gap-1">
          <Tooltip content="Gira la vista arrastrando con el mouse. En pausa, la escena rota sola despacio para que percibas la forma 3D (se desactiva si tu sistema pide menos movimiento).">Cómo se ve</Tooltip>
        </span>
      </div>
      <p className="text-[13px] text-stone-500 leading-snug">
        La onda P mueve el suelo en la dirección de propagación; la S, de forma perpendicular.
      </p>
    </div>
  );
}
