/**
 * Escena 3D del "Mapa 3D" (estilo Swaves) para Nariño.
 *
 * Dibuja un bloque de subsuelo con la cara superior como terreno y una cara
 * lateral como corte, marcadores de estaciones (triángulos rojos + etiqueta),
 * epicentro/hipocentro, y los frentes de onda P (rojo) y S (cian) que se
 * expanden sobre la superficie según el tiempo de animación.
 *
 * No hay física aquí: los radios de los anillos se calculan con la velocidad
 * y el tiempo que llegan por props; los tiempos de llegada provienen del backend.
 *
 * @module map3d/Scene3D
 */
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  DOMAIN, BLOCK, lonToX, latToZ, depthToY, kmToSceneUnits,
} from './domain';
import {
  buildTerrainBlock, loadGeoLines, loadHeightData, loadNarinoRing, type TerrainHandle,
} from './TerrainBlock';
import type {
  Station, StationTravelTime, RayPathResult, SceneGeometry, SceneHypocenter,
} from '../../lib/api3d';

interface Epicenter {
  lat: number;
  lon: number;
  depthKm: number;
}

interface Props {
  stations: Station[];
  epicenter: Epicenter | null;
  travelTimes: StationTravelTime[];
  /** Velocidades para el radio de los anillos (km/s), del panel de parámetros. */
  vpKmS: number;
  vsKmS: number;
  /** Tiempo actual de la animación (s). */
  elapsed: number;
  /** Estación seleccionada (resalta su marcador y define el plano de corte). */
  selectedStation: string | null;
  /** Trayectoria del rayo hacia la estación seleccionada (del backend). */
  rayPath: RayPathResult | null;
  /** Comando de vista de cámara (cambia para disparar una transición). */
  viewCommand?: { view: 'north' | 'cut' | 'top' | 'fit'; nonce: number } | null;
  /** Geometría de escena calculada por el backend (posiciones preferidas). */
  sceneGeometry?: SceneGeometry | null;
  /** Hipocentros del catálogo posicionados por el backend (esferas). */
  hypocenters?: SceneHypocenter[];
  /** Callbacks de interacción. */
  onSelectStation?: (code: string) => void;
  onPlaceEpicenter?: (lat: number, lon: number) => void;
}

const COLOR_P = 0xff4d4d;
const COLOR_S = 0x22d3ee;

/**
 * Componente de la escena 3D. Gestiona el ciclo de vida de Three.js y
 * actualiza los frentes de onda en cada cambio de `elapsed`.
 */
export function Scene3D({
  stations, epicenter, travelTimes, vpKmS, vsKmS, elapsed,
  selectedStation, rayPath, viewCommand, sceneGeometry, hypocenters,
  onSelectStation, onPlaceEpicenter,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    labelRenderer: CSS2DRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    hypoGroup: THREE.Group;
    catalogGroup: THREE.Group;
    stationMeshes: Map<string, THREE.Mesh>;
    raf: number;
  } | null>(null);

  // Geometría de escena del backend (posiciones preferidas). Se lee en los
  // effects de estaciones/hipocentros; si es null se usa el fallback local.
  const sceneGeomRef = useRef<SceneGeometry | null>(sceneGeometry ?? null);
  sceneGeomRef.current = sceneGeometry ?? null;

  // Refs para que el loop de animación lea valores frescos sin recrear la escena.
  const dataRef = useRef({ epicenter, travelTimes, vpKmS, vsKmS, elapsed, selectedStation });
  dataRef.current = { epicenter, travelTimes, vpKmS, vsKmS, elapsed, selectedStation };

  // El usuario puede arrastrar el mini globo para rotarlo (pausa el giro auto).
  const globeUserRotating = useRef(false);
  // Terreno y segmentación (se baja si el rendimiento cae).
  const terrainRef = useRef<TerrainHandle | null>(null);
  const terrainSeg = useRef(200);
  // Grupo del plano de corte + rayo.
  const cutGroupRef = useRef<THREE.Group | null>(null);
  // Estado de arribos (destello/etiquetas), reseteable al cambiar epicentro.
  const arrivalResetRef = useRef<(() => void) | null>(null);

  // ── Montaje único de la escena ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e1a);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    // Cámara alejada: el bloque ocupa menos del lienzo y queda margen alrededor
    // para que las ondas P/S crezcan y se atenúen sin cortarse contra el borde.
    camera.position.set(33, 30, 41);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Renderer de etiquetas (CSS2D) superpuesto
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mount.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, labelRenderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, -2, 0);

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(20, 30, 20);
    scene.add(dir);

    // ── Campo de estrellas sutil ──
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 120 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 10;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x8899bb, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.7 }),
    );
    scene.add(stars);

    // ── Cargador de texturas (Blue Marble, dominio público NASA) ──
    const texLoader = new THREE.TextureLoader();

    // ── Bloque de terreno con relieve real (heightmap + hillshade) ──
    // Se construye asíncronamente al cargar texturas/datos; hasta entonces,
    // un bloque plano provisional evita el vacío.
    const placeholderGeo = new THREE.BoxGeometry(BLOCK.width, BLOCK.height, BLOCK.depthXY);
    const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x33404f, transparent: true, opacity: 0.6 });
    const placeholder = new THREE.Mesh(placeholderGeo, placeholderMat);
    placeholder.position.y = -BLOCK.height / 2;
    scene.add(placeholder);

    let terrain: TerrainHandle | null = null;
    Promise.all([
      new Promise<THREE.Texture | null>(res => texLoader.load('/terrain/narino_hillshade.png', t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null))),
      loadHeightData(),
      loadGeoLines(),
      loadNarinoRing(),
    ]).then(([hillshade, heightData, geo, ring]) => {
      if (disposed) return;
      if (!heightData) {
        console.info('[Map3D] Sin heightmap en /terrain/; se mantiene bloque plano.');
        return;
      }
      terrain = buildTerrainBlock(scene, null, hillshade, geo.coast, geo.border, heightData, terrainSeg.current, ring);
      terrainRef.current = terrain;
      scene.remove(placeholder);
      placeholderGeo.dispose();
      placeholderMat.dispose();
    });

    // Rejilla sutil en el nivel de superficie (referencia)
    const grid = new THREE.GridHelper(BLOCK.width, 12, 0x556688, 0x2a3a4a);
    grid.position.y = 0.01;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.15;
    scene.add(grid);

    // ── Mini globo de contexto (esquina sup. derecha) ──
    // Escena y cámara separadas: solo contexto geográfico, no participa en cálculos.
    const globeScene = new THREE.Scene();
    const globeCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    globeCam.position.set(0, 0, 4);
    globeScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const globeLight = new THREE.DirectionalLight(0xffffff, 0.6);
    globeLight.position.set(5, 3, 5);
    globeScene.add(globeLight);
    // Grupo giratorio (globo + marcador rotan juntos).
    const globeGroup = new THREE.Group();
    globeScene.add(globeGroup);
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0x3366aa }),
    );
    globeGroup.add(globe);
    texLoader.load('/textures/blue_marble.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      (globe.material as THREE.MeshStandardMaterial).map = tex;
      (globe.material as THREE.MeshStandardMaterial).color.set(0xffffff);
      (globe.material as THREE.MeshStandardMaterial).needsUpdate = true;
    });
    // Punto rojo en Nariño (centro del dominio: lat 1.5, lon -78.1) sobre la esfera.
    // Conversión (lat,lon) → XYZ para una SphereGeometry de Three.js con textura
    // equirectangular estándar (lon 0 = meridiano central de la imagen):
    //   x = -cos(lat)·cos(lon),  y = sin(lat),  z = cos(lat)·sin(lon)
    const narLat = (1.5 * Math.PI) / 180;
    // La textura equirectangular tiene el meridiano 0 desfasado π respecto a
    // la convención de SphereGeometry; lo compensamos en la longitud del punto
    // para que el marcador caiga realmente sobre Nariño.
    const narLon = (-78.1 * Math.PI) / 180 + Math.PI;
    const rr = 1.33;
    const markerDir = new THREE.Vector3(
      -Math.cos(narLat) * Math.cos(narLon),
      Math.sin(narLat),
      Math.cos(narLat) * Math.sin(narLon),
    );
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false }),
    );
    marker.renderOrder = 999; // siempre visible por encima del globo
    marker.position.copy(markerDir).multiplyScalar(rr);
    globeGroup.add(marker);
    // Rotar el grupo para que el marcador quede de frente a la cámara (+Z),
    // así Nariño siempre mira al observador del mini globo. El ángulo del
    // marcador en el plano XZ (medido desde +Z) es atan2(x, z); rotamos su
    // negativo para llevarlo a +Z. Un pequeño tilt en X sube la latitud a la vista.
    // Rotación que lleva el marcador (ya con la longitud corregida) al frente
    // de la cámara del mini globo, para que Nariño mire al observador.
    const globeBaseRotY = -Math.atan2(markerDir.x, markerDir.z);
    globeGroup.rotation.y = globeBaseRotY;
    globeGroup.rotation.x = narLat;

    // (Las aristas, estratos y etiquetas de profundidad las dibuja TerrainBlock.)

    // ── Frentes de onda como anillos que siguen el relieve ──
    // Cada frente es una LineLoop cuyos vértices se proyectan sobre la altura
    // del terreno. Se mantiene una estela de anillos previos (opacidad decreciente).
    const RING_SEGMENTS = 96;
    const TRAIL = 3; // anillos de estela
    type WaveRing = { line: THREE.LineLoop; mat: THREE.LineBasicMaterial };
    const makeWaveRings = (color: number): WaveRing[] => {
      const rings: WaveRing[] = [];
      for (let k = 0; k <= TRAIL; k++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RING_SEGMENTS + 1) * 3), 3));
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
        const line = new THREE.LineLoop(geo, mat);
        line.visible = false;
        scene.add(line);
        rings.push({ line, mat });
      }
      return rings;
    };
    const pRings = makeWaveRings(COLOR_P);
    const sRings = makeWaveRings(COLOR_S);

    // Radios (en unidades de escena) para el desvanecimiento de las ondas.
    // Las ondas pueden crecer MÁS ALLÁ del contorno de Nariño y atenuarse
    // suavemente hasta el borde del área visible, en vez de cortarse en seco.
    const WAVE_FADE_START = BLOCK.width * 0.75; // empieza a desvanecerse
    const WAVE_FADE_END = BLOCK.width * 1.6;    // desaparece por completo

    /** Actualiza un conjunto de anillos (frente + estela) a un radio dado en km. */
    const updateWaveRings = (rings: WaveRing[], ex: number, ez: number, vKmS: number, elapsed: number) => {
      const th = terrainRef.current;
      for (let k = 0; k < rings.length; k++) {
        const tLag = elapsed - k * 0.6; // estela: 0.6 s de retraso por anillo
        const rKm = vKmS * tLag;
        const r = kmToSceneUnits(rKm);
        const { line, mat } = rings[k];
        if (tLag <= 0 || r < 0.05 || r > WAVE_FADE_END) { line.visible = false; continue; }
        const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
        for (let s = 0; s <= RING_SEGMENTS; s++) {
          const a = (s / RING_SEGMENTS) * Math.PI * 2;
          const x = ex + r * Math.cos(a);
          const z = ez + r * Math.sin(a);
          const y = (th ? th.sampleHeightAt(x, z) : 0) + 0.08;
          posAttr.setXYZ(s, x, y, z);
        }
        posAttr.needsUpdate = true;
        // Opacidad = atenuación por estela × atenuación radial suave hacia el borde.
        const trailFade = 0.9 * (1 - k / (TRAIL + 1));
        const edgeFade = r <= WAVE_FADE_START
          ? 1
          : Math.max(0, 1 - (r - WAVE_FADE_START) / (WAVE_FADE_END - WAVE_FADE_START));
        mat.opacity = trailFade * edgeFade;
        line.visible = mat.opacity > 0.02;
      }
    };

    // ── Grupo de hipocentro/epicentro (se puebla al recibir epicentro) ──
    const hypoGroup = new THREE.Group();
    scene.add(hypoGroup);

    // ── Grupo de hipocentros del catálogo (esferas por profundidad) ──
    const catalogGroup = new THREE.Group();
    scene.add(catalogGroup);

    // ── Grupo del plano de corte + rayo (se puebla al seleccionar estación) ──
    const cutGroup = new THREE.Group();
    scene.add(cutGroup);
    cutGroupRef.current = cutGroup;

    const stationMeshes = new Map<string, THREE.Mesh>();

    // ── Raycaster para colocar epicentro y seleccionar estaciones ──
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onClick = (ev: MouseEvent) => {
      // El rect debe ser el del elemento que RECIBE el clic (labelRenderer),
      // que es donde está el listener, para que clientX/Y sean consistentes.
      const rect = labelRenderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // ¿Se hizo clic en una estación?
      const stationHits = raycaster.intersectObjects([...stationMeshes.values()], false);
      if (stationHits.length > 0) {
        const code = stationHits[0].object.userData.code as string;
        onSelectStation?.(code);
        return;
      }
      // Colocar epicentro. Para que el punto caiga EXACTAMENTE donde se hizo
      // clic sobre lo que se ve, se intersecta la MALLA REAL del terreno (con
      // relieve), no un plano y=0. Un plano plano desalinea el clic porque la
      // superficie está elevada por el relieve y la cámara es oblicua.
      const hitPoint = new THREE.Vector3();
      let gotHit = false;
      const th = terrainRef.current;
      if (th) {
        const terrainHits = raycaster.intersectObject(th.group, true);
        // Primer impacto sobre una malla (superficie o paredes del bloque).
        const surfaceHit = terrainHits.find(h => (h.object as THREE.Mesh).isMesh);
        if (surfaceHit) { hitPoint.copy(surfaceHit.point); gotHit = true; }
      }
      // Respaldo: plano de superficie y=0 si el terreno aún no cargó.
      if (!gotHit) {
        const surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        if (raycaster.ray.intersectPlane(surfacePlane, hitPoint)) gotHit = true;
      }
      if (gotHit) {
        // Inversa exacta de lonToX / latToZ (mismo origen y proyección).
        const tLon = hitPoint.x / BLOCK.width + 0.5;
        const tLat = -(hitPoint.z / BLOCK.depthXY) + 0.5;
        const lon = DOMAIN.lonMin + tLon * (DOMAIN.lonMax - DOMAIN.lonMin);
        const lat = DOMAIN.latMin + tLat * (DOMAIN.latMax - DOMAIN.latMin);
        if (lon >= DOMAIN.lonMin && lon <= DOMAIN.lonMax && lat >= DOMAIN.latMin && lat <= DOMAIN.latMax) {
          onPlaceEpicenter?.(lat, lon);
        }
      }
    };
    labelRenderer.domElement.style.pointerEvents = 'auto';
    labelRenderer.domElement.addEventListener('click', onClick);

    // ── Interacción con el mini globo (rotar arrastrando en su zona) ──
    let draggingGlobe = false;
    let lastX = 0, lastY = 0;
    const inGlobeZone = (ev: MouseEvent): boolean => {
      const rect = labelRenderer.domElement.getBoundingClientRect();
      const gsize = Math.min(rect.width * 0.22, 150);
      const margin = 12;
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      return x >= rect.width - gsize - margin && y <= gsize + margin;
    };
    const onGlobeDown = (ev: MouseEvent) => {
      if (inGlobeZone(ev)) {
        draggingGlobe = true;
        globeUserRotating.current = true;
        lastX = ev.clientX; lastY = ev.clientY;
        controls.enabled = false; // no rotar la escena principal
        ev.stopPropagation();
      }
    };
    const onGlobeMove = (ev: MouseEvent) => {
      if (!draggingGlobe) return;
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      globeGroup.rotation.y += dx * 0.01;
      globeGroup.rotation.x += dy * 0.01;
    };
    const onGlobeUp = () => {
      if (draggingGlobe) { draggingGlobe = false; controls.enabled = true; }
    };
    labelRenderer.domElement.addEventListener('mousedown', onGlobeDown);
    window.addEventListener('mousemove', onGlobeMove);
    window.addEventListener('mouseup', onGlobeUp);

    // Estado de arribos por estación (para destello + etiqueta fija).
    const arrivalState = new Map<string, { pShown: boolean; sShown: boolean; flashUntil: number; tag: string }>();
    arrivalResetRef.current = () => arrivalState.clear();

    // ── Loop de render con monitor de FPS ──
    let raf = 0;
    const clock = new THREE.Clock();
    let fpsAccum = 0, fpsFrames = 0, fpsCheckDone = false;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const d = dataRef.current;

      // Monitor de FPS (solo informativo). NO reconstruye el terreno: hacerlo
      // en caliente dejaba un segundo bloque + un segundo eje de profundidad
      // superpuestos (etiquetas duplicadas "0 km / 0 km"). La segmentación
      // inicial ya es adecuada.
      const dt = clock.getDelta();
      if (!fpsCheckDone && dt > 0) {
        fpsAccum += dt; fpsFrames++;
        if (fpsAccum >= 2.0) {
          const fps = fpsFrames / fpsAccum;
          if (fps < 45) console.info(`[Map3D] FPS ${fps.toFixed(0)}.`);
          fpsCheckDone = true;
        }
      }

      // Actualizar frentes de onda (siguen el relieve) según elapsed
      if (d.epicenter && d.elapsed > 0) {
        const ex = lonToX(d.epicenter.lon);
        const ez = latToZ(d.epicenter.lat);
        updateWaveRings(pRings, ex, ez, d.vpKmS, d.elapsed);
        updateWaveRings(sRings, ex, ez, d.vsKmS, d.elapsed);
      } else {
        pRings.forEach(r => (r.line.visible = false));
        sRings.forEach(r => (r.line.visible = false));
      }

      // Opacidad según selección (el escalado/color lo maneja el destello abajo)
      stationMeshes.forEach((mesh, code) => {
        (mesh.material as THREE.MeshBasicMaterial).opacity = code === d.selectedStation ? 1 : 0.85;
      });

      // Destello de 600 ms al llegar cada frente + etiqueta de tiempo fija
      if (d.epicenter) {
        d.travelTimes.forEach(tt => {
          const mesh = stationMeshes.get(tt.code);
          if (!mesh) return;
          const mat = mesh.material as THREE.MeshBasicMaterial;
          const label = mesh.children.find(c => (c as CSS2DObject).element) as CSS2DObject | undefined;
          const el = label?.element as HTMLElement | undefined;

          // Detectar el instante de arribo P y S para disparar destello.
          const key = tt.code;
          const rec = arrivalState.get(key) ?? { pShown: false, sShown: false, flashUntil: 0, tag: '' };

          if (tt.tP != null && d.elapsed >= tt.tP && !rec.pShown) {
            rec.pShown = true;
            rec.flashUntil = performance.now() + 600;
            rec.tag = `P ${tt.tP.toFixed(1)} s`;
          }
          if (tt.tS != null && d.elapsed >= tt.tS && !rec.sShown) {
            rec.sShown = true;
            rec.flashUntil = performance.now() + 600;
            rec.tag = `S ${tt.tS.toFixed(1)} s`;
          }
          arrivalState.set(key, rec);

          // Destello: escala + color brillante durante 600 ms
          const flashing = performance.now() < rec.flashUntil;
          const baseScale = key === d.selectedStation ? 1.4 : 1;
          mesh.scale.setScalar(flashing ? baseScale * 1.6 : baseScale);
          mat.color.setHex(flashing ? 0xffee66 : 0xff4d4d);

          // Etiqueta fija con el último tiempo de arribo mostrado (conserva "~").
          if (el) {
            const codeTxt = tt.approx ? `${tt.code} ~` : tt.code;
            el.textContent = rec.tag ? `${codeTxt}  ${rec.tag}` : codeTxt;
            el.style.color = rec.sShown ? '#22d3ee' : rec.pShown ? '#ffe066' : '#ffb0b0';
          }
        });
      }

      controls.update();

      // Anticolisión de etiquetas: si dos se solapan en pantalla, la etiqueta
      // MÁS CERCANA a la cámara se mantiene fija; la más lejana se desplaza un
      // poco hacia arriba y baja opacidad. Evita el choque TUM/TUM3C.
      const rect = renderer.domElement.getBoundingClientRect();
      const placed: { x: number; y: number }[] = [];
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);
      const projected: { code: string; el: HTMLElement; x: number; y: number; dist: number }[] = [];
      stationMeshes.forEach((mesh, code) => {
        // La etiqueta es el hijo CSS2DObject (puede haber también una Line guía).
        const label = mesh.children.find(c => (c as CSS2DObject).element) as CSS2DObject | undefined;
        if (!label) return;
        const world = new THREE.Vector3();
        mesh.getWorldPosition(world);
        const dist = world.distanceTo(camPos);
        world.y += 0.85;
        world.project(camera);
        const x = (world.x * 0.5 + 0.5) * rect.width;
        const y = (-world.y * 0.5 + 0.5) * rect.height;
        projected.push({ code, el: label.element as HTMLElement, x, y, dist });
      });
      // Prioridad de dibujo por cercanía a la cámara (las cercanas se colocan primero).
      projected.sort((a, b) => a.dist - b.dist);
      for (const p of projected) {
        let shift = 0;
        let displaced = false;
        for (const q of placed) {
          if (Math.abs(p.x - q.x) < 44 && Math.abs((p.y + shift) - q.y) < 13) {
            shift -= 11; // desplazamiento reducido para no alejar del marcador
            displaced = true;
          }
        }
        p.el.style.transform = `translate(-50%, -50%) translateY(${shift}px)`;
        p.el.style.opacity = displaced ? '0.7' : '1';
        placed.push({ x: p.x, y: p.y + shift });
      }

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);

      // ── Render del mini globo en un viewport de la esquina sup. derecha ──
      // IMPORTANTE: setViewport/setScissor trabajan en coordenadas CSS (Three
      // multiplica internamente por el pixel ratio). Usar domElement.width/height
      // (píxeles del buffer, ya escalados por DPR) desplazaba el globo fuera de
      // la pantalla en monitores de alta densidad (portátiles), por eso solo se
      // veía en el monitor externo (DPR 1). getSize() devuelve el tamaño CSS.
      const sizeCss = renderer.getSize(new THREE.Vector2());
      const wCss = sizeCss.x, hCss = sizeCss.y;
      const gsize = Math.round(Math.min(wCss * 0.22, 150));
      renderer.clearDepth();
      renderer.setScissorTest(true);
      const margin = 12;
      const gx = wCss - gsize - margin;
      const gy = hCss - gsize - margin;
      renderer.setViewport(gx, gy, gsize, gsize);
      renderer.setScissor(gx, gy, gsize, gsize);
      // Oscila suavemente alrededor de Nariño (±25°) en vez de dar la vuelta
      // completa, para que el punto rojo siempre quede visible al frente.
      if (!globeUserRotating.current) {
        globeGroup.rotation.y = globeBaseRotY + Math.sin(performance.now() * 0.0002) * 0.44;
      }
      renderer.render(globeScene, globeCam);
      renderer.setScissorTest(false);
      // Restaurar el viewport principal en coordenadas CSS.
      renderer.setViewport(0, 0, wCss, hCss);
    };
    animate();

    // ── Resize ──
    // Ajusta canvas + cámara + etiquetas al tamaño REAL del contenedor.
    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // CAUSA DEL CLIC DESALINEADO: el canvas se dimensionaba con el ancho del
    // contenedor en el momento del montaje, pero dentro del grid de 3 columnas
    // ese ancho cambia DESPUÉS de montar (el layout se estabiliza), y
    // `window.resize` no se dispara por eso. El canvas quedaba con un tamaño
    // interno que no coincidía con su tamaño CSS → la cámara (aspect) y el
    // raycast del clic proyectaban a una posición desplazada (a veces medio
    // mapa). Un ResizeObserver reajusta ante CUALQUIER cambio de tamaño del
    // contenedor, dejando el clic alineado con lo que se dibuja.
    const resizeObserver = new ResizeObserver(() => onResize());
    resizeObserver.observe(mount);

    stateRef.current = { renderer, labelRenderer, scene, camera, controls, hypoGroup, catalogGroup, stationMeshes, raf };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      resizeObserver.disconnect();
      labelRenderer.domElement.removeEventListener('click', onClick);
      labelRenderer.domElement.removeEventListener('mousedown', onGlobeDown);
      window.removeEventListener('mousemove', onGlobeMove);
      window.removeEventListener('mouseup', onGlobeUp);
      disposed = true;
      terrain?.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (labelRenderer.domElement.parentNode) labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
      starGeo.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reconstruir marcadores de estaciones cuando cambian ──
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    // Limpiar previos
    st.stationMeshes.forEach(mesh => {
      mesh.children.slice().forEach(c => {
        if (c instanceof THREE.Line) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
        mesh.remove(c);
      });
      st.scene.remove(mesh);
      mesh.geometry.dispose();
    });
    st.stationMeshes.clear();

    // Posiciones preferidas: las que calcula el backend (/api/scene-geometry).
    // Si no están, se cae al mapeo local de domain.ts (regla técnica).
    const sceneStations = sceneGeomRef.current?.stations ?? [];
    const sceneByCode = new Map(sceneStations.map(s => [s.code, s]));

    // Offset vertical fijo de la etiqueta sobre la cima del cono (unidades escena).
    const LABEL_Y = 0.85;

    stations.forEach(station => {
      const geo = new THREE.ConeGeometry(0.5, 1.0, 4); // "triángulo" 3D
      const mat = new THREE.MeshBasicMaterial({ color: COLOR_P, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);

      // Preferir x/z del backend; el fallback recalcula con lonToX/latToZ.
      const scn = sceneByCode.get(station.code);
      const sx = scn ? scn.x : lonToX(station.longitude);
      const sz = scn ? scn.z : latToZ(station.latitude);
      const surfY = terrainRef.current ? terrainRef.current.sampleHeightAt(sx, sz) : 0;
      const markerY = surfY + (scn ? scn.marker_offset_y : 0.6);
      mesh.position.set(sx, markerY, sz);
      mesh.userData.code = station.code;

      // Ubicación aproximada (PAS2, TUM3C): pendiente de confirmar con el SGC.
      const approx = station.approx === true;

      // Línea guía delgada: de la cima del cono a la base de la etiqueta.
      const guideGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.5, 0),      // cima del cono (altura 1.0 centrado → +0.5)
        new THREE.Vector3(0, LABEL_Y, 0),  // base de la etiqueta
      ]);
      const guideMat = new THREE.LineBasicMaterial({ color: 0xffb0b0, transparent: true, opacity: 0.55 });
      const guide = new THREE.Line(guideGeo, guideMat);
      mesh.add(guide);

      // Etiqueta CSS2D anclada al cono. El sufijo "~" marca ubicación aproximada.
      const div = document.createElement('div');
      div.textContent = approx ? `${station.code} ~` : station.code;
      div.title = `${station.name}\nlat ${station.latitude}, lon ${station.longitude}` +
        (station.altitude_m != null ? `, alt ${station.altitude_m} m` : '') +
        `\nFuente: ${station.source}` +
        (approx ? '\nUbicación aproximada, pendiente de confirmar con el SGC' : '');
      div.style.cssText = 'font-family:monospace;font-size:10px;color:#ffb0b0;' +
        'text-shadow:0 0 3px #000,0 0 3px #000;' +
        'background:rgba(0,0,0,0.45);padding:1px 4px;border-radius:3px;white-space:nowrap;' +
        'pointer-events:auto;cursor:help;transition:opacity 0.15s;' +
        (approx ? 'border:1px dashed rgba(255,176,176,0.6);' : '');
      const label = new CSS2DObject(div);
      label.position.set(0, LABEL_Y, 0);
      mesh.add(label);

      st.scene.add(mesh);
      st.stationMeshes.set(station.code, mesh);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, sceneGeometry]);

  // ── Actualizar epicentro/hipocentro cuando cambia ──
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    // Limpiar grupo previo y estado de arribos (nueva fuente)
    st.hypoGroup.clear();
    arrivalResetRef.current?.();
    if (!epicenter) return;

    const ex = lonToX(epicenter.lon);
    const ez = latToZ(epicenter.lat);
    const ey = depthToY(epicenter.depthKm);

    // Epicentro (círculo blanco + aro en superficie)
    const epi = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    epi.rotation.x = -Math.PI / 2;
    epi.position.set(ex, 0.08, ez);
    st.hypoGroup.add(epi);
    const epiRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    epiRing.rotation.x = -Math.PI / 2;
    epiRing.position.set(ex, 0.07, ez);
    st.hypoGroup.add(epiRing);

    // Línea vertical epicentro→hipocentro (bien marcada)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ex, 0, ez),
      new THREE.Vector3(ex, ey, ez),
    ]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.8 }));
    st.hypoGroup.add(line);

    // Hipocentro (esfera blanca con halo, claramente por debajo de la superficie)
    const hypo = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffaa44, emissiveIntensity: 0.6 }),
    );
    hypo.position.set(ex, ey, ez);
    st.hypoGroup.add(hypo);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.18 }),
    );
    halo.position.set(ex, ey, ez);
    st.hypoGroup.add(halo);

    // Etiqueta de profundidad del hipocentro
    const hdiv = document.createElement('div');
    hdiv.textContent = `hipocentro · ${epicenter.depthKm} km`;
    hdiv.style.cssText = 'font-family:monospace;font-size:9px;color:#ffe066;text-shadow:0 0 3px #000,0 0 3px #000;background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:3px;white-space:nowrap;';
    const hlabel = new CSS2DObject(hdiv);
    hlabel.position.set(ex, ey - 0.7, ez);
    st.hypoGroup.add(hlabel);
  }, [epicenter]);

  // ── Hipocentros del catálogo (esferas por profundidad, backend) ──
  // Son los eventos del catálogo; distintos del epicentro activo. El backend
  // entrega x/y/z, radio y color; aquí solo se dibujan.
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    const group = st.catalogGroup;
    // Limpiar previos (geometrías/materiales/etiquetas).
    group.children.slice().forEach(c => {
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
      group.remove(c);
    });

    (hypocenters ?? []).forEach(hc => {
      const geo = new THREE.SphereGeometry(Math.max(0.12, hc.radius), 16, 16);
      const color = new THREE.Color(hc.color);
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.85,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.set(hc.x, hc.y, hc.z);
      group.add(sphere);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hypocenters]);

  // ── Plano de corte + rayo (epicentro → estación seleccionada) ──
  useEffect(() => {
    const group = cutGroupRef.current;
    if (!group) return;
    group.clear();
    if (!epicenter || !selectedStation) return;
    const stObj = stations.find(s => s.code === selectedStation);
    if (!stObj) return;

    const ex = lonToX(epicenter.lon), ez = latToZ(epicenter.lat);
    const sx = lonToX(stObj.longitude), sz = latToZ(stObj.latitude);
    const dx = sx - ex, dz = sz - ez;
    const horiz = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / horiz, uz = dz / horiz; // dirección epicentro→estación

    // Plano vertical semitransparente que contiene epicentro y estación.
    const planeLen = horiz + 4;
    const planeGeo = new THREE.PlaneGeometry(planeLen, BLOCK.height);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x6688cc, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    const midX = (ex + sx) / 2, midZ = (ez + sz) / 2;
    plane.position.set(midX, -BLOCK.height / 2, midZ);
    plane.rotation.y = Math.atan2(ux, uz); // orientar el plano a lo largo de la dirección
    group.add(plane);

    // Rayo: mapear (dist_km, depth_km) del backend al plano.
    // dist_km se convierte a unidades de escena; el punto va en la dirección u.
    const pts: THREE.Vector3[] = [];
    const source = rayPath?.puntos && rayPath.puntos.length >= 2
      ? rayPath.puntos
      : [{ dist_km: 0, depth_km: epicenter.depthKm }, { dist_km: rayPath?.distancia_epicentral_km ?? 0, depth_km: 0 }];
    for (const p of source) {
      const dScene = kmToSceneUnits(p.dist_km);
      const x = ex + ux * dScene;
      const z = ez + uz * dScene;
      const y = depthToY(p.depth_km);
      pts.push(new THREE.Vector3(x, y, z));
    }
    if (pts.length >= 2) {
      const rayGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const isCurved = (rayPath?.modelo_usado === 'iasp91') && rayPath.puntos.length > 2;
      const rayMat = new THREE.LineBasicMaterial({ color: isCurved ? 0x66ff99 : 0xffcc44, transparent: true, opacity: 0.95 });
      group.add(new THREE.Line(rayGeo, rayMat));

      // Etiqueta de distancia hipocentral en el punto medio del rayo.
      const mid = pts[Math.floor(pts.length / 2)];
      const dHypo = Math.hypot(rayPath?.distancia_epicentral_km ?? horiz, epicenter.depthKm);
      const rdiv = document.createElement('div');
      rdiv.textContent = `${isCurved ? 'rayo P (iasp91)' : 'rayo directo'} · ${dHypo.toFixed(0)} km`;
      rdiv.style.cssText = `font-family:monospace;font-size:9px;color:${isCurved ? '#66ff99' : '#ffcc44'};text-shadow:0 0 3px #000,0 0 3px #000;background:rgba(0,0,0,0.5);padding:1px 4px;border-radius:3px;white-space:nowrap;`;
      const rlabel = new CSS2DObject(rdiv);
      rlabel.position.copy(mid);
      group.add(rlabel);
    }

    // Animación de rotación de 400 ms al cambiar de estación (fade-in del plano).
    planeMat.opacity = 0;
    const start = performance.now();
    const animateIn = () => {
      const t = Math.min(1, (performance.now() - start) / 400);
      planeMat.opacity = 0.12 * t;
      if (t < 1 && cutGroupRef.current === group) requestAnimationFrame(animateIn);
    };
    requestAnimationFrame(animateIn);
  }, [epicenter, selectedStation, stations, rayPath]);

  // ── Transición de cámara (vistas Norte / Corte / Superior / encuadre) ──
  useEffect(() => {
    const st = stateRef.current;
    if (!st || !viewCommand) return;
    const { camera, controls } = st;

    // En vista superior ocultamos el eje de profundidad + Moho (no aportan de
    // planta); en las demás vistas se muestran de nuevo.
    terrainRef.current?.setTopView(viewCommand.view === 'top');

    // Objetivo: centro entre epicentro y estaciones (o centro del dominio).
    // Distancias amplias para dejar margen alrededor del bloque (ondas P/S).
    const target = new THREE.Vector3(0, -1.5, 0);
    let camPos = new THREE.Vector3(33, 30, 41);
    const R = 46;

    if (viewCommand.view === 'top') {
      camPos = new THREE.Vector3(target.x + 0.01, 56, target.z);
    } else if (viewCommand.view === 'north') {
      camPos = new THREE.Vector3(target.x, 24, target.z + R);
    } else if (viewCommand.view === 'cut' && epicenter && selectedStation) {
      const stObj = stations.find(s => s.code === selectedStation);
      if (stObj) {
        const ex = lonToX(epicenter.lon), ez = latToZ(epicenter.lat);
        const sx = lonToX(stObj.longitude), sz = latToZ(stObj.latitude);
        const dx = sx - ex, dz = sz - ez;
        const len = Math.hypot(dx, dz) || 1;
        // Perpendicular horizontal a la dirección del corte.
        const px = -dz / len, pz = dx / len;
        target.set((ex + sx) / 2, -1.5, (ez + sz) / 2);
        camPos = new THREE.Vector3(target.x + px * R, 22, target.z + pz * R);
      }
    } else {
      // fit: vista isométrica por defecto
      camPos = new THREE.Vector3(33, 30, 41);
    }

    // Transición suave de 800 ms.
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const t0 = performance.now();
    const dur = 800;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
      camera.position.lerpVectors(startPos, camPos, e);
      controls.target.lerpVectors(startTarget, target, e);
      controls.update();
      if (k < 1 && stateRef.current) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [viewCommand, epicenter, selectedStation, stations]);

  return <div ref={mountRef} className="relative w-full h-full" />;
}
