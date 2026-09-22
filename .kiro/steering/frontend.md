---
inclusion: always
---

# SismoNariño — Convenciones Frontend

## Estructura de Carpetas

```
src/
├── App.tsx                    # Componente raíz: rutas, transiciones, estado global
├── main.tsx                   # Entry point de React
├── index.css                  # Estilos globales, animaciones, variables
├── components/
│   ├── layout/                # Navbar.tsx, Footer.tsx
│   ├── simulation/            # ParametersPanel, ResultsPanel, WaveChart, TriaxialPlane, ProgressBar
│   ├── education/             # FdmMethodology, Glossary (+ glossaryData), References
│   ├── explorer/              # SeismicMap (Leaflet), MseedUpload (carga de .mseed propios)
│   ├── map3d/                 # Scene3D, RecordSection, Legend, TerrainBlock
│   └── ui/                    # Badge.tsx, Tooltip.tsx, Logo.tsx (Logo/LogoMark, marca de la app)
├── lib/
│   ├── types.ts               # Todas las interfaces compartidas (Page, SeismicEvent, SimulationParams, etc.)
│   ├── simulation.ts          # Motor FDM en JavaScript (fallback del backend)
│   ├── simulation.worker.ts   # Web Worker que ejecuta simulation.ts en hilo separado
│   ├── supabase.ts            # Cliente Supabase (exporta null si no hay credenciales)
│   ├── educationData.ts       # Funciones de carga: quiz, wave facts, timeline (Supabase + fallback)
│   ├── api.ts                 # Cliente HTTP genérico del backend FastAPI
│   ├── api3d.ts               # Cliente del Mapa 3D
│   ├── auth.tsx               # AuthProvider con Supabase Auth (email + Google)
│   ├── adminData.ts           # Consultas/mutaciones del panel admin
│   ├── adminExport.ts         # Reportes administrativos Excel/PDF
│   ├── interpretation.ts      # Texto interpretativo compartido (RF-12)
│   ├── reportPdf.ts           # Reporte PDF de simulación (jsPDF)
│   ├── quakeml.ts             # Importación de catálogos QuakeML
│   └── useInView.ts           # Hook de Intersection Observer para animaciones scroll
└── pages/
    ├── Home.tsx               # Inicio: solo hero; botones según sesión (ingresar/registrarse o módulos)
    ├── Simulation.tsx         # Módulo de simulación FDM + visualización
    ├── Explorer.tsx           # Explorador de datos + registros reales Galeras
    ├── Education.tsx          # Centro educativo: ondas, magnitud, profundidad, FDM, timeline, glosario, referencias, quiz
    ├── Map3D.tsx              # Mapa 3D de propagación regional
    ├── About.tsx              # Acerca del proyecto (HU021)
    ├── Auth.tsx               # Login/registro con Supabase Auth
    ├── MyReports.tsx          # Reportes del usuario: JSON + PDF
    └── AdminDashboard.tsx     # Panel admin: usuarios, eventos, contenido educativo, reportes
```

## Comunicación con el backend

- `src/lib/api3d.ts`: cliente del Mapa 3D (`/api/stations`, `/api/travel-times`, `/api/synthetic`, `/api/waveforms`)
- `src/lib/quakeml.ts`: importación QuakeML (`POST /api/import/quakeml`) con parser local (`DOMParser`) de respaldo
- `src/lib/api.ts`: cliente genérico (eventos, quiz, simulate); las páginas educativas siguen leyendo Supabase directo
- En desarrollo Vite hace proxy de `/api` a `:8000`; en producción se usa `VITE_API_URL` o el proxy de Nginx

## Convenciones de Nombres

- Componentes React: **PascalCase** — `TriaxialPlane.tsx`, `WaveChart.tsx`
- Hooks: **camelCase** con prefijo `use` — `useInView.ts`, `useAuth()`
- Archivos de utilidad/lib: **camelCase** — `simulation.ts`, `educationData.ts`
- Interfaces: **PascalCase** sin prefijo `I` — `SimulationParams`, `WaveData`
- Tipos union: **PascalCase** — `type Page = 'home' | 'simulation' | ...`
- Props de componentes: interfaz `Props` local (no exportada) o `NombreComponenteProps` si se exporta

## Tipado (src/lib/types.ts)

Todas las interfaces compartidas están centralizadas en `types.ts`. No se definen tipos inline en los componentes salvo props locales. Las interfaces clave:

- `Page` — unión literal de las rutas SPA (`home | simulation | explorer | education | map3d | about | auth | reports | admin`)
- `SeismicEvent` — evento sísmico (coincide con columnas de Supabase)
- `SimulationParams` — entrada del FDM (13 campos numéricos + sourceType)
- `WaveData` — series temporales {time, north, east, vertical}
- `WavefieldSnapshot` — snapshot del campo para 3D {time, field: Float32Array, nx, nz}
- `GridInfo` — metadatos de la malla FDM
- `SimulationResult` — resultado completo de una simulación
- `SimProgress` — progreso {step, totalSteps, percent}

## Paleta de Colores

Colores hardcodeados en los componentes (no hay variables CSS custom ni extensión de Tailwind):

| Nombre | Hex | Uso |
|--------|-----|-----|
| Terracotta | `#C4553A` | Color primario, botones, acentos, ondas P |
| Forest Green | `#2D6A4F` | Secundario, ondas S, badges tectónico |
| Gold | `#D4A853` | Terciario, ondas Rayleigh, highlights |
| Purple | `#6B5B95` | Cuaternario, badges, tabs |
| Background | `#FAFAF8` | Fondo global body |
| Text | `#1A1A2E` | Color de texto principal |
| Stone-50/100/200 | Tailwind `stone-*` | Fondos secundarios, bordes, inputs |

Los colores se aplican directamente con clases inline `bg-[#C4553A]`, `text-[#2D6A4F]`, etc. No hay tema Tailwind extendido.

## Marca e íconos

- **Isotipo**: `src/components/ui/Logo.tsx` exporta `LogoMark` (solo el sello: volcán Galeras + traza sísmica sobre fondo tinta) y `Logo` (isotipo + nombre). Es un asset de marca con colores fijos, no depende del tema. Se usa en `Navbar`, `Footer`, `Auth` y `About`.
- **Favicon**: `public/favicon.svg` replica el mismo diseño del isotipo (referenciado desde `index.html`).
- **Set de íconos**: **Bootstrap Icons** vía `react-bootstrap-icons`, reexportados con nombres semánticos desde `src/lib/icons.ts` (p. ej. `Activity`, `Database`, `ShieldCheck`). Los componentes importan siempre desde `../lib/icons`, nunca directo de `react-bootstrap-icons`, para poder cambiar el set completo desde un solo archivo.

## Animaciones y Estilos Globales (index.css)

- `animate-fade-in-up` — entrada desde abajo (secciones al hacer scroll)
- `animate-fade-in` — fade simple (transiciones entre secciones educativas)
- `animate-slide-left` / `animate-slide-right` — slides laterales (hero)
- `.card-hover` — lift + shadow en hover para tarjetas
- `.btn-hover` — scale + lift en hover para botones
- `.delay-100` a `.delay-600` — delays para animaciones escalonadas
- Font: Inter (Google Fonts via system stack)
- `overscroll-behavior-x: none` en body
- `overflow-x: hidden` en html y body
- Scrollbar custom con `scrollbar-thin`
- Range inputs personalizados con thumb `#C4553A`

## Patrón de Navegación

- SPA sin router — `App.tsx` mantiene `page` en estado
- `navigate(page)` aplica transición fade (200ms opacity → cambia página → 30ms show)
- Siempre `window.scrollTo({ top: 0, behavior: 'instant' })` al cambiar página
- Protección de rutas: todo excepto `home`, `about` y `auth` requiere sesión; `admin` requiere role === 'admin'
- `navigate(page, { register: true })` abre el formulario de registro directamente

## Patrón de Estados de Carga

Todos los componentes que cargan datos siguen:
1. `const [loading, setLoading] = useState(true)`
2. `useEffect` con `async function load()` que hace la query
3. `try/catch` con `console.error` en el catch
4. `setLoading(false)` siempre en el finally/después
5. Mientras `loading`: spinner (`div` con `animate-spin` + `border-t-[color]`)
6. Si no hay datos: estado vacío con ícono + texto descriptivo

## Patrón de Scroll Animations

- Hook `useInView(threshold)` en `src/lib/useInView.ts`
- Retorna `{ ref, inView }` — una sola vez (no se revierte)
- Se aplica con `style={{ opacity: inView ? 1 : 0, transform: inView ? 'none' : 'translateY(40px)', transition: '...' }}`
- Componente wrapper `Section` en `Home.tsx` que encapsula este patrón
