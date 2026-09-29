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
import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
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

/** Modo de visualización del hodograma (B3). */
type PmMode = 'full' | 'p' | 's';

export function ParticleMotion({ waveData, pArrival, sArrival, currentTime }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Modo: completo, solo P o solo S (B3). En "solo" se recorta a ese tramo y se
  // reescala para llenar la vista (la escala queda ampliada, se avisa abajo).
  const [mode, setMode] = useState<PmMode>('full');
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
    // z-index bajo: las etiquetas de los ejes viven dentro de la tarjeta y no
    // deben flotar por encima de diálogos/modales (que usan z alto).
    labelRenderer.domElement.style.zIndex = '0';
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
    // Se usan las MUESTRAS REALES de las tres componentes, con la resolución
    // temporal completa de la ventana (sin diezmar ni suavizar). Los tres ejes
    // comparten UNA SOLA escala: el máximo absoluto común de las tres
    // componentes, para no deformar las proporciones reales del movimiento
    // (así la vertical se ve tan pequeña o grande como es respecto a N y E).
    const { time, north, east, vertical } = waveData;
    const nAll = time.length;
    // VENTANA LIMPIA: la trayectoria solo muestra hasta un poco después de la S
    // (P + S + una cola corta). Con la coda larga de reverberación la partícula
    // daría cientos de vueltas y se vería como un ovillo; recortar a esta
    // ventana deja el hodograma didáctico (los lazos de la P y la S se leen).
    const winEnd = (sArrival > 0 && pArrival > 0)
      ? sArrival + (sArrival - pArrival) + 2.0
      : (time[nAll - 1] || 1);
    let nWin = nAll;
    for (let i = 0; i < nAll; i++) { if (time[i] > winEnd) { nWin = i; break; } }
    nWin = Math.max(2, nWin);

    // Rango de muestras según el modo (B3):
    //  - 'full': toda la ventana limpia.
    //  - 'p'   : solo el tramo P (entre arribo P y arribo S).
    //  - 's'   : solo el tramo S (desde el arribo S hasta el fin de la ventana).
    const idxAtOrAfter = (t: number) => {
      for (let i = 0; i < nAll; i++) { if (time[i] >= t) return i; }
      return nAll - 1;
    };
    let iStart = 0;
    let iEnd = nWin; // exclusivo
    if (mode === 'p' && pArrival > 0 && sArrival > pArrival) {
      iStart = idxAtOrAfter(pArrival);
      iEnd = Math.min(nWin, idxAtOrAfter(sArrival) + 1);
    } else if (mode === 's' && sArrival > 0) {
      iStart = idxAtOrAfter(sArrival);
      iEnd = nWin;
    }
    if (iEnd - iStart < 2) { iStart = 0; iEnd = nWin; } // salvaguarda

    // Escala: en 'solo' se reescala SOLO con el pico de ese tramo, para que el
    // movimiento (pequeño en la P) llene la vista. La escala queda ampliada,
    // se avisa en el rótulo inferior.
    let peak = 0;
    for (let i = iStart; i < iEnd; i++) {
      peak = Math.max(peak, Math.abs(north[i]), Math.abs(east[i]), Math.abs(vertical[i]));
    }
    const s = peak > 0 ? AXIS / peak : 1;
    // Posiciones (x=Este, y=Vertical hacia arriba, z=Norte) y color por vértice
    // según el arribo (gris reposo, terracota P, verde S). Line2 interpola el
    // color entre vértices y permite un grosor real en píxeles, para que el
    // tramo P (pequeño frente a la S) se vea como una cinta clara, no un punto.
    const positions: number[] = [];
    const colors: number[] = [];
    for (let i = iStart; i < iEnd; i++) {
      positions.push(east[i] * s, vertical[i] * s, north[i] * s);
      const c = time[i] < pArrival ? COLOR_REST : time[i] < sArrival ? COLOR_P : COLOR_S;
      colors.push(c.r, c.g, c.b);
    }
    const lineGeo = new LineGeometry();
    lineGeo.setPositions(positions);
    lineGeo.setColors(colors);
    const lineMat = new LineMaterial({
      vertexColors: true,
      linewidth: 3,          // grosor en píxeles (Line2 sí respeta el ancho)
      worldUnits: false,
      alphaToCoverage: true,
    });
    lineMat.resolution.set(width, height);
    const line = new Line2(lineGeo, lineMat);
    line.computeLineDistances();
    scene.add(line);

    // Punta que marca la posición actual de la partícula.
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a1a2e }),
    );
    scene.add(head);

    const nSeg = iEnd - iStart;        // nº de muestras dibujadas
    const lastT = time[iEnd - 1] || 1; // fin del tramo mostrado
    const reduced = prefersReducedMotion();

    // Cuántos SEGMENTOS mostrar según el tiempo actual (la línea "crece"). En
    // Line2 el número de instancias dibujadas se controla con instanceCount de
    // la geometría (cada instancia es un segmento entre dos muestras). Los
    // índices se mapean al rango [iStart, iEnd) del modo actual.
    const setDrawCount = (t: number) => {
      let idx = iStart;
      while (idx < iEnd && time[idx] <= t) idx++;
      const local = idx - iStart; // muestras dentro del tramo hasta t
      const segs = Math.max(1, Math.min(local - 1, nSeg - 1));
      lineGeo.instanceCount = segs;
      const j = Math.min(iEnd - 1, Math.max(iStart, idx - 1));
      head.position.set(east[j] * s, vertical[j] * s, north[j] * s);
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
      // Line2 necesita la resolución del lienzo para calcular el grosor en px.
      lineMat.resolution.set(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);
    // También al redimensionar la ventana (p. ej. al ampliar la Visualización,
    // que dispara un 'resize' para que el lienzo se re-mida).
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      controls.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (labelRenderer.domElement.parentNode) labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
    };
    // Recrea la escena si cambian los datos, los arribos (nueva simulación) o
    // el modo de vista (completo / solo P / solo S).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveData, pArrival, sArrival, mode]);

  // ¿Hay tramos P/S disponibles para ofrecer los botones? (arribos válidos).
  const hasP = pArrival > 0 && sArrival > pArrival;
  const hasS = sArrival > 0;

  return (
    <div className="space-y-3">
      {/* Selector de tramo (B3): completo, solo P o solo S. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-stone-500">
          <Tooltip content="La P mueve el suelo casi en línea recta, en la dirección en que viaja la onda. La S lo mueve de forma perpendicular. Usa estas opciones para verlas por separado." showIcon>Ver tramo</Tooltip>
        </span>
        <div className="flex gap-1">
          {([['full', 'Completo', true], ['p', 'Solo P', hasP], ['s', 'Solo S', hasS]] as const).map(([m, txt, enabled]) => (
            <button
              key={m}
              onClick={() => enabled && setMode(m)}
              disabled={!enabled}
              className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold ${mode === m ? 'bg-[#C4553A] text-white' : 'bg-white border border-stone-200 text-stone-400'} ${!enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {txt}
            </button>
          ))}
        </div>
      </div>
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
      {mode !== 'full' && (
        <p className="text-[11px] text-[#C4553A] leading-snug px-1">
          Vista ampliada del tramo {mode === 'p' ? 'de la onda P' : 'de la onda S'}: la escala está aumentada para que el movimiento llene la vista, no es comparable con la del modo completo.
        </p>
      )}
      <p className="text-[13px] text-stone-500 leading-snug">
        La onda P mueve el suelo en la dirección de propagación; la S, de forma perpendicular.
      </p>
    </div>
  );
}
