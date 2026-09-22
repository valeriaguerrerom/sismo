# SismoNariño — Simulador Triaxial de Pseudo-Sismogramas

Plataforma educativa para la generación, procesamiento y visualización triaxial de ondas sísmicas del subsuelo de Nariño, Colombia.

**Autores:** Valeria Guerrero · Luisa Basante — Universidad Mariana, Nariño (2026)

## Arquitectura

```
Frontend (React + TypeScript + Vite)
    ↓ HTTP/JSON                 ↓ supabase-js (Auth + RLS)
Backend (FastAPI + NumPy + ObsPy)   Base de Datos (Supabase PostgreSQL)
```

## Funcionalidades

| Módulo | Funcionalidades | RF |
|--------|-----------------|----|
| Simulador | Variables elásticas (Vp, Vs, ρ → λ, μ), fuente tectónica/volcánica, FDM 2D en Web Worker, sismogramas N/E/Z, propagación 3D, interpretación automática | RF-06 a RF-12 |
| Explorador | 134 eventos de la red CM (SGC) y 33 del Galeras (LP, tornillo, tremor, VT) con mapa y formas de onda; carga al simulador | RF-13, RF-14 |
| Mapa 3D | Frentes P/S sobre bloque regional, tiempos de viaje (homogéneo/iasp91), sección de registro por estación | — |
| Educación | Tipos de ondas, magnitud, profundidad, metodología FDM, línea de tiempo, glosario, referencias, quiz | RF-24 |
| Cuenta (Investigador) | Registro con datos de investigador, login (email y Google), carga de MiniSEED propios, guardar simulaciones, historial, reporte PDF, exportar CSV/PNG/JSON | RF-01 a RF-04, RF-17 a RF-21 |
| Administración | Dashboard con indicadores, gestión de usuarios (rol, activar/desactivar), CRUD de eventos + importación QuakeML, CRUD de contenido educativo, reportes Excel/PDF | RF-05, RF-15, RF-16, RF-22, RF-23, RF-25 |
| Acerca de | Información del proyecto, autoras, asesores, tecnologías, fuentes y licencia | HU021 |

## Requisitos

- Node.js 18+
- Python 3.11+
- npm

## Instalación

### Frontend
```bash
npm install
```

### Backend
```bash
cd backend
pip install -r requirements.txt
```

## Ejecución

Se necesitan 2 terminales:

### Terminal 1 — Backend (puerto 8000)
```bash
cd backend
py -m uvicorn main:app --reload --port 8000
```

### Terminal 2 — Frontend (puerto 5173)
```bash
npm run dev
```

Abrir http://localhost:5173 en el navegador.

## Roles y acceso

La plataforma es de acceso restringido: sin sesión solo se ven Inicio, Acerca de y el formulario de ingreso/registro.

| Rol | Cómo se obtiene | Permisos |
|-----|-----------------|----------|
| Investigador (`user`) | Registro público con nombre, institución, ocupación, área, ciudad, país y propósito | Simulador, explorador, mapa 3D, educación, carga de MiniSEED propios, reportes propios |
| Administrador (`admin`) | Lo asigna otro administrador desde el panel | Todo lo anterior + gestión de usuarios, eventos, contenido educativo y reportes administrativos |

## Base de datos (Supabase)

Ejecutar las migraciones de `supabase/migrations/` en orden en el SQL Editor (la última,
`20260911_admin_features.sql` habilita cuentas activas/inactivas, último acceso y las
policies de escritura de administrador; `20260911b_researcher_profile.sql` agrega los
campos del perfil de investigador). Luego promover la cuenta admin:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'tu-email@ejemplo.com';
```

## Pruebas

```bash
npm run test            # vitest: 21 pruebas (parser QuakeML, PDF, interpretación, Mapa 3D)
cd backend
py -m pytest -q         # pytest: 25 pruebas (geo, tiempos de viaje, síntesis FDM, waveforms, QuakeML)
npm run typecheck && npm run lint
```

## Despliegue

```bash
docker compose up --build   # frontend http://localhost:8080 · backend http://localhost:8000
```

También hay configuración lista para Vercel/Netlify (frontend) y Render/Railway (backend).
Ver [docs/despliegue.md](docs/despliegue.md).

## Documentación

### Swagger UI (API Backend)
Con el backend corriendo, abrir:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Documentación del Frontend (TypeDoc)
```bash
npm run docs:frontend
```
Genera HTML en `docs/frontend/`. Abrir `docs/frontend/index.html`.

### Documentación del Backend (pdoc)
```bash
cd backend
py -m pdoc main simulation --output-dir ../docs/backend --html --force
```
Genera HTML en `docs/backend/`. Abrir `docs/backend/main.html`.

## Estructura del Proyecto

```
├── backend/                  # API REST (FastAPI + Python)
│   ├── main.py              # Endpoints de la API + routers
│   ├── core/                # geo.py, fdm.py (motor FDM 2D NumPy), stations.py
│   ├── api/                 # travel_times, synthetic, waveforms, quakeml
│   ├── tests/               # pytest
│   ├── process_*.py         # Procesamiento MiniSEED (ObsPy) → public/data
│   ├── Dockerfile           # Imagen del backend
│   ├── requirements.txt     # Dependencias Python
│   └── .env                 # Credenciales Supabase
├── src/                     # Frontend (React + TypeScript)
│   ├── components/          # Componentes reutilizables
│   │   ├── layout/          # Navbar, Footer
│   │   ├── simulation/      # ParametersPanel, WaveChart, TriaxialPlane, ResultsPanel
│   │   ├── education/       # FdmMethodology, Glossary, References
│   │   ├── explorer/        # SeismicMap (Leaflet)
│   │   ├── map3d/           # Scene3D, RecordSection, TerrainBlock
│   │   └── ui/              # Badge, Tooltip
│   ├── lib/                 # Lógica y utilidades
│   │   ├── simulation.ts    # Motor FDM en TypeScript (Web Worker)
│   │   ├── auth.tsx         # Supabase Auth (email + Google)
│   │   ├── adminData.ts     # Consultas del panel admin
│   │   ├── adminExport.ts   # Reportes admin Excel/PDF
│   │   ├── reportPdf.ts     # Reporte PDF de simulación
│   │   ├── quakeml.ts       # Importación QuakeML
│   │   ├── interpretation.ts# Interpretación educativa
│   │   ├── types.ts         # Interfaces TypeScript
│   │   └── educationData.ts # Carga de datos educativos
│   └── pages/               # Páginas de la SPA
│       ├── Home.tsx         # Página principal
│       ├── Simulation.tsx   # Módulo de simulación
│       ├── Explorer.tsx     # Explorador de datos sísmicos
│       ├── Map3D.tsx        # Mapa 3D regional
│       ├── Education.tsx    # Centro de aprendizaje
│       ├── About.tsx        # Acerca del proyecto
│       ├── Auth.tsx         # Login / registro
│       ├── MyReports.tsx    # Reportes del usuario
│       └── AdminDashboard.tsx # Panel de administración
├── supabase/migrations/     # Scripts SQL para la base de datos
├── docs/                    # Documentación generada
│   ├── frontend/            # TypeDoc (HTML)
│   ├── backend/             # pdoc (HTML)
│   └── arquitectura.dsl     # Modelo C4 (Structurizr DSL)
└── public/images/           # Imágenes de volcanes de Nariño
```

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Three.js, Leaflet |
| Backend | FastAPI, Python 3.11+, NumPy, SciPy, ObsPy, Uvicorn |
| Base de datos | Supabase (PostgreSQL + Auth + RLS) |
| Simulación | FDM 2D — Ecuación de onda elástica (TypeScript y NumPy) |
| Exportación | CSV, PNG (html2canvas), PDF (jsPDF), Excel (SheetJS) |
| Pruebas | Vitest, pytest |
| Despliegue | Docker Compose, Vercel/Netlify, Render/Railway |
| Documentación | Swagger/OpenAPI, TypeDoc, pdoc |
