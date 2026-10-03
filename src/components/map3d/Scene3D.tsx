/**
 * Escena 3D del "Mapa 3D" (estilo Swaves) para Nariño.
 *
 * Dibuja un bloque de subsuelo con la cara superior como terreno y una cara
 * lateral como corte, marcadores de estaciones (triángulos grises + etiqueta),
 * epicentro/hipocentro, y los frentes de onda P (terracota) y S (verde) que se
 * expanden sobre la superficie según el tiempo de animación.
 *
 * No hay física aquí: los radios de los anillos se calculan con la velocidad
 * y el tiempo que llegan por props; los tiempos de llegada provienen del backend.
 *
 * @module map3d/Scene3D
 */
import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  DOMAIN, BLOCK, DOMAIN_WIDTH_KM, lonToX, latToZ, depthToY, kmToSceneUnits,
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
  /** Modelo de velocidades activo: cambia cómo se rotulan las capas del bloque. */
  model?: 'homogeneous' | 'iasp91';
  /** Callbacks de interacción. */
  onSelectStation?: (code: string) => void;
  onPlaceEpicenter?: (lat: number, lon: number) => void;
}

// Frentes de onda: mismo código de color por tipo que en todo el sitio
// (ver src/lib/waveColors.ts). P terracota, S verde bosque.
const COLOR_P = 0xc4553a;
const COLOR_S = 0x2d6a4f;
// Marcador de estación: gris neutro (no es una onda), para no confundir con la P.
const COLOR_STATION = 0x9ca3af;

/**
 * Capas del subsuelo del bloque, con su Vp del modelo IASP91 (Kennett y
 * Engdahl, 1991). Las profundidades son los límites de cada capa en km; la Vp
 * es el valor de referencia del modelo que usa el cálculo (obspy.taup iasp91).
 */
const SUBSURFACE_LAYERS = [
  { name: 'Corteza superior', from: 0, to: 15, vp: 5.8 },
  { name: 'Corteza inferior', from: 15, to: 35, vp: 6.5 },
  { name: 'Manto superior', from: 35, to: 200, vp: 8.04 },
] as const;

/**
 * Componente de la escena 3D. Gestiona el ciclo de vida de Three.js y
 * actualiza los frentes de onda en cada cambio de `elapsed`.
 */
export function Scene3D({
  stations, epicenter, travelTimes, vpKmS, vsKmS, elapsed,
  selectedStation, rayPath, viewCommand, sceneGeometry, hypocenters, model,
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

  // Vista de cámara activa (para saber si estamos en "Corte" y mostrar el
  // frente de onda dentro del bloque). Se actualiza con cada viewCommand.
  const viewRef = useRef<'north' | 'cut' | 'top' | 'fit'>('fit');

  // Contador que se incrementa cuando el terreno termina de construirse, para
  // re-anclar las etiquetas de capa a la arista frontal REAL (no al fallback).
  const [terrainReady, setTerrainReady] = useState(0);

  // El usuario puede arrastrar el mini globo para rotarlo (pausa el giro auto).
  const globeUserRotating = useRef(false);
  // Terreno y segmentación (se baja si el rendimiento cae).
  const terrainRef = useRef<TerrainHandle | null>(null);
  const terrainSeg = useRef(200);
  // Grupo del plano de corte + rayo.
  const cutGroupRef = useRef<THREE.Group | null>(null);
  // Grupo de etiquetas de las capas del subsuelo (nombre + Vp del modelo).
  const layerLabelsRef = useRef<THREE.Group | null>(null);
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
    // Cámara en 3/4 (oblicua), elevada pero NO cenital, sobre el lado SUR (+Z)
    // mirando al norte: así el bloque se ve de frente (no de canto), con el
    // NORTE (−Z) hacia el fondo/arriba y el Pacífico (−X) a la izquierda.
    camera.position.set(0, 20, 44);

    // preserveDrawingBuffer permite capturar el canvas con toDataURL() para el
    // reporte PDF (sin él, la captura sale en negro). Costo de rendimiento
    // despreciable para esta escena.
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Clipping local: lo usa el frente de onda para no dibujarse por encima de
    // la superficie (plano horizontal en y≈0).
    renderer.localClippingEnabled = true;
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
    // Oculto de entrada: evita el "cuadrado" gris que parpadea antes de que
    // aparezca el relieve de Nariño. Solo se muestra si falla la carga del
    // heightmap (fallback), donde sí conviene ver algo de suelo.
    placeholder.visible = false;
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
        placeholder.visible = true; // fallback visible solo si no hay relieve
        return;
      }
      terrain = buildTerrainBlock(scene, null, hillshade, geo.coast, geo.border, heightData, terrainSeg.current, ring);
      terrainRef.current = terrain;
      setTerrainReady(r => r + 1); // dispara el reanclado de etiquetas de capa a la arista real
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

    // ── Frentes de onda ──
    // La onda nace en el HIPOCENTRO (en profundidad) y se propaga como una
    // esfera. Para que se vea correctamente la profundidad, dibujamos:
    //   (a) una SEMIESFERA semitransparente centrada en el hipocentro (crece
    //       dentro del bloque, visible en cualquier vista);
    //   (b) el ANILLO sobre la superficie, que es la INTERSECCIÓN de esa esfera
    //       con el terreno: su radio es sqrt(r² − prof²) y SOLO aparece cuando
    //       el frente esférico ya alcanzó la superficie (r > profundidad). Así,
    //       a más profundidad, el anillo aparece más tarde y nace más grande.
    // Las escalas horizontal (kmToSceneUnits) y vertical (depthToY) difieren, por
    // eso cada eje se convierte con su propio factor y la "esfera" se construye
    // en km y se escala por eje (se ve como un casquete coherente con el bloque).
    const RING_SEGMENTS = 96;
    const TRAIL = 3; // anillos de estela en superficie

    // Factores de conversión km→escena por eje (horizontal vs vertical).
    const UX_PER_KM = kmToSceneUnits(1);       // X y Z (horizontal)
    const UY_PER_KM = Math.abs(depthToY(1));   // Y (profundidad)

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

    // Casquete del frente dentro del bloque: una CÁSCARA de líneas (wireframe)
    // del HEMISFERIO INFERIOR de la esfera, con opacidad baja, para que el
    // terreno y las capas se vean a través. NO es un volumen relleno (eso
    // "tapaba" la escena de color). Un plano de recorte en y≈0 impide que se
    // dibuje por encima de la superficie (nada de cúpula sobre el terreno).
    // Plano de recorte compartido: normal hacia abajo (0,−1,0) con constante 0,
    // así solo se conserva lo que está en y ≤ 0 (bajo la superficie).
    const surfaceClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    type WaveShell = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };
    const makeWaveShell = (color: number): WaveShell => {
      // Hemisferio INFERIOR: phiStart=PI/2, phiLength=PI/2 cubre de "ecuador"
      // hacia el polo sur (hacia −Y una vez posicionado). Radio unitario; el
      // radio real se aplica por escala en cada eje. Pocas divisiones → malla de
      // líneas limpia.
      const geo = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.1, wireframe: true,
        depthWrite: false, clippingPlanes: [surfaceClip],
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      return { mesh, mat };
    };
    const pShell = makeWaveShell(COLOR_P);
    const sShell = makeWaveShell(COLOR_S);

    /**
     * Actualiza el casquete del frente, centrado en el hipocentro. El radio
     * crece con el tiempo y se escala por eje (horizontal vs profundidad). El
     * plano de recorte deja solo la parte bajo la superficie. Se deja de dibujar
     * cuando el frente ya salió por completo del bloque (su borde superior
     * superó el dominio en profundidad y en horizontal).
     */
    const updateWaveShell = (
      shell: WaveShell, ex: number, ey: number, ez: number,
      vKmS: number, elapsed: number,
    ) => {
      const rKm = vKmS * elapsed;
      const { mesh, mat } = shell;
      if (elapsed <= 0 || rKm < 1) { mesh.visible = false; return; }
      // El frente ya salió del bloque cuando su radio supera a la vez el ancho
      // del dominio (horizontal) y la profundidad máxima: deja de dibujarse.
      const outOfBlock = rKm > DOMAIN_WIDTH_KM * 0.6 && rKm > DOMAIN.depthMax;
      if (outOfBlock) { mesh.visible = false; return; }
      mesh.position.set(ex, ey, ez);
      mesh.scale.set(rKm * UX_PER_KM, rKm * UY_PER_KM, rKm * UX_PER_KM);
      // Cáscara tenue y constante (no se acumula al crecer, al ser wireframe).
      mat.opacity = 0.14;
      mesh.visible = true;
    };

    // ── Frente de onda DENTRO del bloque (vista Corte) ──
    // Circunferencias P y S que nacen en el hipocentro y crecen en el plano
    // vertical del corte (epicentro → estación), recortadas en la superficie
    // (y=0). Solo se dibujan en la vista "Corte". A diferencia de los anillos de
    // superficie, estas muestran la onda propagándose en profundidad y cruzando
    // las capas hacia la superficie y hacia la estación.
    const ARC_SEGMENTS = 64;
    const makeCutArc = (color: number): { line: THREE.Line; mat: THREE.LineBasicMaterial } => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3));
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.renderOrder = 5;
      scene.add(line);
      return { line, mat };
    };
    const pCutArc = makeCutArc(COLOR_P);
    const sCutArc = makeCutArc(COLOR_S);

    /**
     * Actualiza la circunferencia del frente de onda en el plano de corte.
     * Es un círculo centrado en el hipocentro que crece con el tiempo; los
     * puntos que superarían la superficie se recortan a y=0. Cada eje usa su
     * escala (horizontal vs profundidad). Centro = hipocentro (ex,ey,ez).
     */
    const updateCutArc = (
      arc: { line: THREE.Line; mat: THREE.LineBasicMaterial },
      ex: number, ey: number, ez: number, ux: number, uz: number,
      vKmS: number, elapsed: number,
    ) => {
      const rKm = vKmS * elapsed;
      const { line, mat } = arc;
      if (viewRef.current !== 'cut' || elapsed <= 0 || rKm < 1) { line.visible = false; return; }
      // Círculo COMPLETO del frente en el plano del corte, centrado en el
      // hipocentro. Cada eje usa su propia escala (horizontal vs profundidad),
      // así el frente cruza las capas con la misma proporción que el bloque.
      // Los puntos que quedarían sobre la superficie (y>0) se recortan a y=0,
      // de modo que, al llegar arriba, el arco "toca" la superficie.
      const rX = rKm * kmToSceneUnits(1); // escala horizontal
      const rY = rKm * Math.abs(depthToY(1)); // escala vertical (profundidad)
      const posAttr = line.geometry.attributes.position as THREE.BufferAttribute;
      for (let s = 0; s <= ARC_SEGMENTS; s++) {
        const a = (s / ARC_SEGMENTS) * Math.PI * 2; // círculo completo
        const horizComp = Math.sin(a) * rX; // a lo largo de u (horizontal del corte)
        const vertComp = Math.cos(a) * rY;  // vertical
        const x = ex + ux * horizComp;
        const z = ez + uz * horizComp;
        let y = ey + vertComp;              // puede subir o bajar desde el hipocentro
        if (y > 0) y = 0;                   // no asomar sobre la superficie
        posAttr.setXYZ(s, x, y, z);
      }
      posAttr.needsUpdate = true;
      // Atenuar cuando el frente ya llenó el bloque en profundidad.
      const maxKm = DOMAIN.depthMax;
      mat.opacity = rKm <= maxKm * 0.8 ? 0.95 : Math.max(0, 0.95 * (1 - (rKm - maxKm * 0.8) / (maxKm * 0.4)));
      line.visible = mat.opacity > 0.03;
    };

    // Radios (en unidades de escena) para el desvanecimiento de las ondas.
    // El frente llena el área del modelo (≈ ±BLOCK.width/2 desde el centro) y,
    // al salir del terreno, se vuelve claramente SEMITRANSPARENTE y se apaga,
    // para que se entienda que fuera del modelo ya no hay cálculo. Empieza a
    // atenuar justo en el borde del terreno (medio ancho del bloque).
    const WAVE_FADE_START = BLOCK.width * 0.5; // borde del terreno: empieza a atenuar
    const WAVE_FADE_END = BLOCK.width * 0.95;  // poco más allá del borde: desaparece

    /**
     * Actualiza los anillos de superficie (frente + estela). El anillo es la
     * INTERSECCIÓN del frente esférico (centrado en el hipocentro, a `depthKm`)
     * con la superficie: radio en superficie = sqrt(rHip² − depth²), definido
     * solo cuando el frente ya llegó arriba (rHip ≥ depth). Antes de eso, el
     * anillo no existe (la onda aún viaja por el subsuelo).
     */
    const updateWaveRings = (
      rings: WaveRing[], ex: number, ez: number, depthKm: number, vKmS: number, elapsed: number,
    ) => {
      const th = terrainRef.current;
      for (let k = 0; k < rings.length; k++) {
        const tLag = elapsed - k * 0.6; // estela: 0.6 s de retraso por anillo
        const rHipKm = vKmS * tLag;      // radio hipocentral recorrido (km)
        const { line, mat } = rings[k];
        // Radio del anillo en superficie (km). Si el frente aún no sube, nada.
        const surfKm2 = rHipKm * rHipKm - depthKm * depthKm;
        if (tLag <= 0 || surfKm2 <= 0.5) { line.visible = false; continue; }
        const surfKm = Math.sqrt(surfKm2);
        const r = kmToSceneUnits(surfKm);
        if (r < 0.05 || r > WAVE_FADE_END) { line.visible = false; continue; }
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

    // ── Grupo de etiquetas de capas del subsuelo (se puebla según el modelo) ──
    const layerLabels = new THREE.Group();
    scene.add(layerLabels);
    layerLabelsRef.current = layerLabels;

    const stationMeshes = new Map<string, THREE.Mesh>();

    // ── Raycaster para colocar epicentro y seleccionar estaciones ──
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Guarda anti-arrastre: OrbitControls usa el MISMO elemento para rotar. Un
    // arrastre (girar la escena) dispara igualmente un evento 'click' al soltar,
    // y eso colocaba el epicentro "solo" al terminar de girar. Registramos dónde
    // bajó el ratón y solo tratamos como clic real si casi no se movió.
    let downX = 0, downY = 0, downT = 0;
    const onPointerDownClickGuard = (ev: MouseEvent) => { downX = ev.clientX; downY = ev.clientY; downT = performance.now(); };
    labelRenderer.domElement.addEventListener('mousedown', onPointerDownClickGuard);

    const onClick = (ev: MouseEvent) => {
      // Si el ratón se movió más de 5 px (o pasó mucho tiempo) entre bajar y
      // soltar, fue un ARRASTRE para girar, no un clic: no colocar epicentro.
      const moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (moved > 5 || performance.now() - downT > 700) return;
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

      // Actualizar frentes de onda según elapsed. El frente nace en el
      // hipocentro: los anillos de superficie son su intersección con el
      // terreno, y los casquetes esféricos muestran la propagación en profundidad.
      if (d.epicenter && d.elapsed > 0) {
        const ex = lonToX(d.epicenter.lon);
        const ez = latToZ(d.epicenter.lat);
        const ey = depthToY(d.epicenter.depthKm);
        const depthKm = d.epicenter.depthKm;
        updateWaveRings(pRings, ex, ez, depthKm, d.vpKmS, d.elapsed);
        updateWaveRings(sRings, ex, ez, depthKm, d.vsKmS, d.elapsed);
        // Casquete esférico semitransparente dentro del bloque (todas las vistas).
        updateWaveShell(pShell, ex, ey, ez, d.vpKmS, d.elapsed);
        updateWaveShell(sShell, ex, ey, ez, d.vsKmS, d.elapsed);

        // Frente de onda dentro del bloque (solo en vista Corte): usa la
        // dirección epicentro→estación seleccionada como eje horizontal del corte.
        const stSel = d.selectedStation ? stations.find(s => s.code === d.selectedStation) : null;
        if (stSel) {
          const sx = lonToX(stSel.longitude), sz = latToZ(stSel.latitude);
          const dxc = sx - ex, dzc = sz - ez;
          const h = Math.hypot(dxc, dzc) || 1e-6;
          const ux = dxc / h, uz = dzc / h;
          updateCutArc(pCutArc, ex, ey, ez, ux, uz, d.vpKmS, d.elapsed);
          updateCutArc(sCutArc, ex, ey, ez, ux, uz, d.vsKmS, d.elapsed);
        } else {
          pCutArc.line.visible = false;
          sCutArc.line.visible = false;
        }
      } else {
        pRings.forEach(r => (r.line.visible = false));
        sRings.forEach(r => (r.line.visible = false));
        pShell.mesh.visible = false;
        sShell.mesh.visible = false;
        pCutArc.line.visible = false;
        sCutArc.line.visible = false;
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
          // El texto/estilo vive en el <span> INTERNO (ver creación de la
          // etiqueta): el externo lo controla el CSS2DRenderer.
          const el = (label?.element as HTMLElement | undefined)?.firstElementChild as HTMLElement | undefined;

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
          // Destello amarillo brillante (atención); en reposo, gris (color de estación).
          mat.color.setHex(flashing ? 0xffee66 : 0x9ca3af);

          // Etiqueta: SOLO el código por defecto (para no encimar textos). El
          // tiempo de arribo (P/S) se añade únicamente en la estación
          // SELECCIONADA, que es la que interesa leer; así se evita el amontonar
          // "CÓDIGO  P x.x s" en todas a la vez. El marcador de aproximada "~"
          // ya viene en el textContent base (no se duplica aquí).
          if (el) {
            const baseTxt = el.dataset.baseLabel ?? tt.code;
            if (key === d.selectedStation && rec.tag) {
              el.textContent = `${baseTxt}  ${rec.tag}`;
              el.style.color = rec.sShown ? '#3DA06F' : rec.pShown ? '#E07A5F' : '#cbd5e1';
            } else {
              el.textContent = baseTxt;
              el.style.color = key === d.selectedStation ? '#ffffff' : '#cbd5e1';
            }
          }
        });
      }

      controls.update();

      // ── Anticolisión REAL de TODAS las etiquetas en pantalla ──
      // Cada cuadro se proyectan a 2D las etiquetas (estaciones + hipocentro +
      // rayo), se calcula su rectángulo (AABB con el tamaño medido del DOM) y,
      // en orden de cercanía a la cámara, se desplazan en vertical hasta que no
      // se solapen. Si una etiqueta se desplaza, se dibuja una línea guía
      // (ancla→etiqueta) para no perder a qué punto pertenece.
      const rect = renderer.domElement.getBoundingClientRect();
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);

      type LabelBox = {
        el: HTMLElement;
        ay: number;                  // ancla (posición base vertical en pantalla)
        x: number; y: number;        // posición final (tras desplazar)
        w: number; h: number; dist: number;
        lowPriority: boolean;        // true = cede sitio (nombres de capa)
      };
      const boxes: LabelBox[] = [];

      const addLabel = (obj: THREE.Object3D, anchor: THREE.Vector3, yOffsetScene: number) => {
        const css = obj as CSS2DObject;
        const outerEl = css.element as HTMLElement | undefined;
        // El elemento que movemos es el <span> INTERNO (el externo lo reposiciona
        // el CSS2DRenderer cada cuadro y pisaría nuestro translateY).
        const el = outerEl?.firstElementChild as HTMLElement | undefined;
        if (!el) return;
        const world = anchor.clone();
        const dist = world.distanceTo(camPos);
        world.y += yOffsetScene;
        world.project(camera);
        if (world.z > 1) return; // detrás de la cámara
        const x = (world.x * 0.5 + 0.5) * rect.width;
        const y = (-world.y * 0.5 + 0.5) * rect.height;
        const w = el.offsetWidth || 40;
        const h = el.offsetHeight || 16;
        // Los nombres de capa ceden ante estaciones/hipocentro/rayo: se resuelven
        // al final, así nunca empujan a una estación de su sitio.
        const lowPriority = el.dataset.layerLabel === '1';
        boxes.push({ el, ay: y, x, y, w, h, dist, lowPriority });
      };

      // Estaciones (ancladas al cono, con un offset vertical de etiqueta).
      stationMeshes.forEach((mesh) => {
        const label = mesh.children.find(c => (c as CSS2DObject).element) as CSS2DObject | undefined;
        if (!label) return;
        const world = new THREE.Vector3();
        mesh.getWorldPosition(world);
        addLabel(label, world, 0.85);
      });
      // Hipocentro, rayo y nombres de capa (viven en hypoGroup / cutGroup /
      // layerLabels). Incluir los nombres de capa aquí garantiza que la
      // anticolisión los empuje para que NUNCA tapen una estación.
      [hypoGroup, cutGroupRef.current, layerLabelsRef.current].forEach(grp => {
        grp?.children.forEach(c => {
          if ((c as CSS2DObject).element) {
            const world = new THREE.Vector3();
            c.getWorldPosition(world);
            addLabel(c, world, 0);
          }
        });
      });

      // Resolver colisiones: primero las de ALTA prioridad (estaciones,
      // hipocentro, rayo) por cercanía a la cámara; los nombres de capa van al
      // final, así ceden sitio y nunca empujan a una estación.
      boxes.sort((a, b) => {
        if (a.lowPriority !== b.lowPriority) return a.lowPriority ? 1 : -1;
        return a.dist - b.dist;
      });
      const MARGIN = 3;
      const placed: LabelBox[] = [];
      const hits = (bx: number, by: number, w: number, h: number) =>
        placed.some(q =>
          Math.abs(bx - q.x) * 2 < (w + q.w) + MARGIN * 2 &&
          Math.abs(by - q.y) * 2 < (h + q.h) + MARGIN * 2,
        );
      for (const b of boxes) {
        let y = b.ay;
        if (hits(b.x, y, b.w, b.h)) {
          for (let k = 1; k <= 8; k++) {
            const step = k * (Math.max(b.h, 14) + MARGIN);
            if (!hits(b.x, b.ay - step, b.w, b.h)) { y = b.ay - step; break; }
            if (!hits(b.x, b.ay + step, b.w, b.h)) { y = b.ay + step; break; }
          }
        }
        b.y = y;
        const dyPx = Math.round(y - b.ay);
        // Se mueve el <span> INTERNO (no el externo que controla el CSS2DRenderer).
        // Solo un translateY vertical; sin translate(-50%,-50%) porque el inner
        // es inline-block dentro del externo ya centrado por el renderer.
        b.el.style.transform = dyPx !== 0 ? `translateY(${dyPx}px)` : '';
        b.el.style.opacity = dyPx !== 0 ? '0.95' : '1';
        placed.push(b);
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
      labelRenderer.domElement.removeEventListener('mousedown', onPointerDownClickGuard);
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
      const mat = new THREE.MeshBasicMaterial({ color: COLOR_STATION, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);

      // Preferir x/z del backend; el fallback recalcula con lonToX/latToZ.
      const scn = sceneByCode.get(station.code);
      let sx = scn ? scn.x : lonToX(station.longitude);
      let sz = scn ? scn.z : latToZ(station.latitude);

      // ── Estaciones fuera de la silueta de Nariño ──
      // Algunas estaciones de la red CM están en departamentos vecinos (p. ej.
      // CPOP2 en Popayán, Cauca). Su posición cae FUERA del polígono de Nariño,
      // así que un cono allí "flotaría" sobre el vacío. En ese caso lo pegamos
      // al borde del terreno (punto más cercano de la silueta) y lo marcamos con
      // una flecha hacia su ubicación real + la distancia aproximada.
      const th = terrainRef.current;
      let outside = false;
      let outsideKm = 0;
      let arrowAngle = 0; // ángulo en el plano XZ hacia la ubicación real
      if (th && !th.isInside(sx, sz)) {
        const nb = th.nearestBorder(sx, sz);
        const borderKm = (nb.dist / BLOCK.width) * DOMAIN_WIDTH_KM;
        // Tolerancia costera: estaciones justo en el borde (p. ej. TUM en la
        // costa de Tumaco) caen "fuera" del polígono de Natural Earth por el
        // recorte grueso de la línea de costa (~2 km). Si están a menos de
        // BORDER_TOLERANCE_KM del borde, se tratan como DENTRO y se pegan al
        // borde SIN flecha (son de Nariño). Más lejos (p. ej. Popayán) sí es
        // una estación de otro departamento y conserva su flecha.
        const BORDER_TOLERANCE_KM = 6;
        if (borderKm <= BORDER_TOLERANCE_KM) {
          // Dentro (con tolerancia): acercar ligeramente al interior para que el
          // cono quede sobre el terreno, pero sin marcarla como externa.
          sx = nb.x;
          sz = nb.z;
        } else {
          arrowAngle = Math.atan2(sx - nb.x, sz - nb.z); // dirección borde→estación
          outsideKm = borderKm;
          outside = true;
          sx = nb.x;
          sz = nb.z;
        }
      }

      const surfY = th ? th.sampleHeightAt(sx, sz) : 0;
      const markerY = surfY + (scn ? scn.marker_offset_y : 0.6);
      mesh.position.set(sx, markerY, sz);
      mesh.userData.code = station.code;

      // Ubicación aproximada (PAS2, TUM3C): casco urbano del municipio.
      const approx = station.approx === true;

      // Línea guía delgada: de la cima del cono a la base de la etiqueta.
      const guideGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.5, 0),      // cima del cono (altura 1.0 centrado → +0.5)
        new THREE.Vector3(0, LABEL_Y, 0),  // base de la etiqueta
      ]);
      const guideMat = new THREE.LineBasicMaterial({ color: 0xffb0b0, transparent: true, opacity: 0.55 });
      const guide = new THREE.Line(guideGeo, guideMat);
      mesh.add(guide);

      // Flecha que apunta hacia la ubicación real (solo estaciones fuera del
      // departamento): una pequeña línea horizontal desde el cono hacia afuera.
      if (outside) {
        const ax = Math.sin(arrowAngle), az = Math.cos(arrowAngle);
        const arrowGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.1, 0),
          new THREE.Vector3(ax * 1.6, 0.1, az * 1.6),
        ]);
        const arrowMat = new THREE.LineBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.9 });
        mesh.add(new THREE.Line(arrowGeo, arrowMat));
        // Punta de la flecha (cono pequeño) orientada hacia afuera.
        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 0.34, 10),
          new THREE.MeshBasicMaterial({ color: 0xffd27f }),
        );
        tip.position.set(ax * 1.7, 0.1, az * 1.7);
        tip.rotation.z = -arrowAngle; // orienta la punta en el plano
        tip.rotation.x = Math.PI / 2;
        mesh.add(tip);
      }

      // Etiqueta CSS2D anclada al cono. El sufijo "~" marca ubicación aproximada;
      // "↗ XX km" indica que la estación real está fuera de Nariño (en el borde).
      //
      // ESTRUCTURA EN DOS CAPAS (clave para la anticolisión): el CSS2DRenderer
      // reescribe el `transform` del elemento EXTERNO en cada cuadro con la
      // posición proyectada. Si la anticolisión escribiera ahí, se perdería. Por
      // eso el externo es un contenedor "tonto" (sin estilo) y TODO el estilo +
      // el texto van en un `<span>` INTERNO; la anticolisión mueve el interno
      // con translateY, que el CSS2DRenderer no toca.
      const outer = document.createElement('div');
      outer.style.cssText = 'display:inline-block;'; // envuelve ajustado al inner
      const inner = document.createElement('span');
      const outsideTag = outside ? ` ↗ ${outsideKm.toFixed(0)} km` : '';
      const baseLabel = (approx ? `${station.code} ~` : station.code) + outsideTag;
      inner.textContent = baseLabel;
      // Guardamos el texto base para que el loop de animación lo reutilice al
      // añadir/quitar el tiempo de arribo (evita duplicar el código, p. ej. "TU").
      inner.dataset.baseLabel = baseLabel;
      outer.title = `${station.name}\nlat ${station.latitude}, lon ${station.longitude}` +
        (station.altitude_m != null ? `, alt ${station.altitude_m} m` : '') +
        `\nFuente: ${station.source}` +
        (approx ? '\nUbicación aproximada (casco urbano del municipio)' : '') +
        (outside ? `\nFuera del departamento de Nariño; se muestra en el borde, a ~${outsideKm.toFixed(0)} km de su ubicación real` : '');
      inner.style.cssText = "display:inline-block;font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:600;color:#ffd9d9;" +
        'text-shadow:0 0 3px #000,0 0 4px #000;' +
        'background:rgba(10,14,26,0.72);padding:1px 5px;border-radius:4px;white-space:nowrap;' +
        'pointer-events:auto;cursor:help;transition:opacity 0.15s,transform 0.12s;' +
        (approx || outside ? 'border:1px dashed rgba(255,200,200,0.6);' : '');
      outer.appendChild(inner);
      const label = new CSS2DObject(outer);
      label.position.set(0, LABEL_Y, 0);
      mesh.add(label);

      st.scene.add(mesh);
      st.stationMeshes.set(station.code, mesh);
    });
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

    // Hipocentro (esfera semitransparente con halo, claramente por debajo de la
    // superficie). Semitransparente para que se vea DENTRO del bloque (el
    // terreno y las paredes quedan por delante) y se entienda que está enterrado.
    const hypo = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffaa44, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.75, depthWrite: false,
      }),
    );
    hypo.renderOrder = 6;
    hypo.position.set(ex, ey, ez);
    st.hypoGroup.add(hypo);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    halo.position.set(ex, ey, ez);
    st.hypoGroup.add(halo);

    // Etiqueta de profundidad del hipocentro, DESPLAZADA lateralmente hacia el
    // ESTE (+X) con una línea guía corta, para que no se monte con el eje de
    // profundidad (números 0/15 km), que vive en la arista frontal-OESTE.
    const labelDX = 1.4;  // desplazamiento lateral de la etiqueta (unidades escena)
    const guideGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ex, ey, ez),
      new THREE.Vector3(ex + labelDX, ey, ez),
    ]);
    const guide = new THREE.Line(guideGeo, new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6 }));
    st.hypoGroup.add(guide);

    const hdiv = document.createElement('div');
    hdiv.style.cssText = 'display:inline-block;';
    const hInner = document.createElement('span');
    hInner.textContent = `Hipocentro, ${epicenter.depthKm} km`;
    hInner.style.cssText = "display:inline-block;font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:600;color:#ffe066;text-shadow:0 0 3px #000,0 0 4px #000;background:rgba(10,14,26,0.72);padding:1px 5px;border-radius:4px;white-space:nowrap;transition:transform 0.12s;";
    hdiv.appendChild(hInner);
    const hlabel = new CSS2DObject(hdiv);
    hlabel.position.set(ex + labelDX, ey, ez);
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
  }, [hypocenters]);

  // ── Nombres de las capas del subsuelo (nombre + Vp del modelo) ──
  // Reglas de visibilidad (para no chocar con las estaciones):
  //   • Velocidad constante (homogéneo) en vista normal: NO se muestran los
  //     nombres (bastan las líneas que dibuja TerrainBlock); todo el medio tiene
  //     la misma velocidad, así que el nombre aporta poco y estorbaba.
  //   • IASP91 (cualquier vista) o vista Corte (cualquier modelo): SÍ se
  //     muestran, FUERA del bloque (más allá de la arista trasera) con una
  //     LÍNEA GUÍA hacia la capa. Además entran en la anticolisión del loop de
  //     render (marcadas con dataset.layerLabel) para no tapar estaciones.
  useEffect(() => {
    const group = layerLabelsRef.current;
    if (!group) return;
    // Limpiar etiquetas + líneas guía previas (geometrías y nodos DOM incluidos).
    group.children.slice().forEach(c => {
      if (c instanceof THREE.Line) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
      const el = (c as unknown as { element?: HTMLElement }).element;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      group.remove(c);
    });

    const isIasp = model === 'iasp91';
    const isCut = viewRef.current === 'cut';
    // Si es homogéneo y NO estamos en Corte, no se dibujan los nombres.
    if (!isIasp && !isCut) return;

    // Ancla en la arista trasera (cara opuesta al eje de profundidad) y la
    // etiqueta un poco MÁS AFUERA, unida por una línea guía a la capa.
    const edge = terrainRef.current?.backEdge ?? { x: 0, z: -BLOCK.depthXY / 2 };
    const OUT = 1.6; // cuánto se aleja la etiqueta del bloque (−Z, hacia afuera)
    for (const layer of SUBSURFACE_LAYERS) {
      const yMid = (depthToY(layer.from) + depthToY(layer.to)) / 2;

      // Línea guía: de la capa (en la arista) hacia la etiqueta (afuera).
      const guideGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(edge.x, yMid, edge.z),
        new THREE.Vector3(edge.x, yMid, edge.z - OUT),
      ]);
      const guideMat = new THREE.LineBasicMaterial({ color: 0x8894a4, transparent: true, opacity: 0.5 });
      group.add(new THREE.Line(guideGeo, guideMat));

      const div = document.createElement('div');
      div.style.cssText = 'display:inline-block;';
      const span = document.createElement('span');
      span.textContent = isIasp ? `${layer.name}, Vp ${layer.vp.toFixed(1)} km/s` : layer.name;
      span.style.cssText =
        "display:inline-block;font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:600;" +
        'color:#e2e8f0;text-shadow:0 0 3px #000,0 0 4px #000;' +
        'background:rgba(10,14,26,0.66);padding:1px 5px;border-radius:3px;white-space:nowrap;transition:transform 0.12s;';
      // Marca para que la anticolisión del loop de render incluya esta etiqueta.
      span.dataset.layerLabel = '1';
      div.appendChild(span);
      const label = new CSS2DObject(div);
      // Afuera del bloque, a la altura media de su capa.
      label.position.set(edge.x, yMid, edge.z - OUT);
      group.add(label);
    }
  }, [model, terrainReady, viewCommand]);

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
      rdiv.style.cssText = 'display:inline-block;';
      const rInner = document.createElement('span');
      rInner.textContent = `${isCurved ? 'Rayo P (IASP91)' : 'Rayo directo'}, ${dHypo.toFixed(0)} km`;
      rInner.style.cssText = `display:inline-block;font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:600;color:${isCurved ? '#66ff99' : '#ffcc44'};text-shadow:0 0 3px #000,0 0 4px #000;background:rgba(10,14,26,0.72);padding:1px 5px;border-radius:4px;white-space:nowrap;transition:transform 0.12s;`;
      rdiv.appendChild(rInner);
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
    viewRef.current = viewCommand.view;

    // En vista superior ocultamos el eje de profundidad + Moho (no aportan de
    // planta); en las demás vistas se muestran de nuevo.
    terrainRef.current?.setTopView(viewCommand.view === 'top');

    // Objetivo: centro entre epicentro y estaciones (o centro del dominio).
    // Distancias amplias para dejar margen alrededor del bloque (ondas P/S).
    //
    // ORIENTACIÓN: el norte es −Z (ver domain.ts latToZ) y el oeste/Pacífico es
    // −X. Para que el NORTE quede ARRIBA en pantalla, la cámara se ubica sobre
    // el lado SUR del bloque (+Z) mirando hacia el norte; así el norte queda al
    // fondo (arriba) y el Pacífico (−X) a la izquierda.
    const target = new THREE.Vector3(0, -1.5, 0);
    let camPos = new THREE.Vector3(0, 20, 44);
    const R = 46;

    if (viewCommand.view === 'top') {
      // Planta: cámara alta y un corrimiento al SUR (+Z) suficiente para que la
      // vista no quede degenerada y el norte (−Z) resuelva ARRIBA en pantalla.
      camPos = new THREE.Vector3(target.x, 52, target.z + 18);
    } else if (viewCommand.view === 'north') {
      // Vista de frente desde el sur mirando al norte (norte al fondo/arriba).
      camPos = new THREE.Vector3(target.x, 16, target.z + R);
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
        camPos = new THREE.Vector3(target.x + px * R, 20, target.z + pz * R);
      }
    } else {
      // fit: vista por defecto en 3/4 (oblicua) desde el sur, con el norte arriba.
      camPos = new THREE.Vector3(0, 20, 44);
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
