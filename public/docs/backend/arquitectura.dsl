workspace "SismoNariño" "Plataforma educativa para la generación, procesamiento y visualización triaxial de pseudo-sismogramas del subsuelo de Nariño, Colombia." {

    !identifiers hierarchical

    model {

        // ═══ Personas ═══
        visitante = person "Visitante" "Navega la plataforma sin registro. Puede explorar datos sísmicos, consultar información educativa, realizar quiz y ejecutar simulaciones."
        usuario = person "Usuario Registrado" "Se registra e inicia sesión. Puede guardar reportes de simulaciones, exportarlos y gestionar su perfil."
        administrador = person "Administrador" "Gestiona usuarios, contenido educativo, eventos sísmicos y reportes desde el panel de administración."

        // ═══ Sistemas externos ═══
        supabaseCloud = softwareSystem "Supabase (BaaS)" "Plataforma Backend-as-a-Service: base de datos PostgreSQL, autenticación con JWT, Row Level Security y API REST automática." {
            tags "External"
        }

        // ═══ Sistema principal ═══
        sismoNarino = softwareSystem "SismoNariño" "Simulador triaxial de pseudo-sismogramas basado en el método de diferencias finitas (FDM 2D) para la ecuación de onda elástica, con visualización 3D, explorador de datos históricos y módulo educativo interactivo." {

            // ──────────────────────────────
            // CONTENEDOR: Frontend
            // ──────────────────────────────
            frontend = container "Frontend (React + TypeScript)" "Interfaz web SPA responsiva con visualización de sismogramas triaxiales, propagación 3D de ondas y módulo educativo interactivo." "React 18 + Vite + Tailwind CSS + Three.js" {
                tags "Frontend"

                // Componentes de navegación y layout
                appComponent = component "App" "Componente raíz: gestiona rutas, transiciones de página, estado global y protección de rutas por rol." "React Component"
                navbar = component "Navbar" "Barra de navegación principal con enlaces a páginas, estado de autenticación y menú de usuario." "React Component"
                footer = component "Footer" "Pie de página con información de desarrolladores y fuentes de datos." "React Component"

                // Páginas principales
                homePage = component "Home" "Página principal: hero con sismógrafo animado, carrusel de volcanes de Nariño, estadísticas y CTA." "React Component"
                simulationPage = component "Simulation" "Módulo de simulación: panel de parámetros, ejecución FDM, visualización 2D/3D y resultados." "React Component"
                explorerPage = component "Explorer" "Explorador de datos sísmicos históricos (1827–2023) con filtros, tabla, mapa de epicentros y carga al simulador." "React Component"
                educationPage = component "Education" "Centro de aprendizaje: tipos de ondas animadas, escala de magnitud, profundidad, línea de tiempo y quiz." "React Component"

                // Páginas de autenticación y usuario
                authPage = component "Auth" "Página de inicio de sesión y registro con formulario, validación y manejo de errores." "React Component"
                myReportsPage = component "MyReports" "Página de reportes del usuario: lista, exportación JSON y eliminación de simulaciones guardadas." "React Component"

                // Página de administración
                adminDashboard = component "AdminDashboard" "Panel de administración: resumen estadístico, gestión de usuarios (roles), eventos, quiz y reportes." "React Component"

                // Componentes de simulación
                parametersPanel = component "ParametersPanel" "Panel lateral de configuración: Vp, Vs, densidad, magnitud, profundidad, tipo de fuente, duración, dx, dt." "React Component"
                resultsPanel = component "ResultsPanel" "Panel de resultados: métricas, llegadas P/S, exportación PNG y descarga de datos." "React Component"
                triaxialPlane = component "TriaxialPlane" "Visualización 3D de propagación de ondas con Three.js: campos Ux, Uz, |u|, auto-rotación y controles." "React + Three.js"
                waveChart = component "WaveChart" "Gráficos 2D de sismogramas triaxiales (N, E, Z) con animación temporal, cursor y marcadores P/S." "React + SVG Canvas"
                progressBar = component "ProgressBar" "Barra de progreso durante la ejecución de la simulación FDM." "React Component"

                // Componentes educativos
                waveExplorer = component "WaveExplorer" "Explorador interactivo de ondas P, S, Love y Rayleigh con animación, propiedades y datos curiosos." "React Component"
                magnitudeScale = component "MagnitudeScale" "Visualizador interactivo de escala de magnitud con energía, equivalente TNT y clasificación." "React Component"
                depthVisualizer = component "DepthVisualizer" "Visualizador de profundidad sísmica con capas terrestres, slider y clasificación de intensidad." "React Component"
                historicalTimeline = component "HistoricalTimeline" "Línea de tiempo horizontal de eventos sísmicos y volcánicos históricos de Nariño." "React Component"
                seismicQuiz = component "SeismicQuiz" "Quiz interactivo con preguntas aleatorias, puntuación y retroalimentación." "React Component"

                // Servicios y utilidades
                apiClient = component "API Client" "Módulo HTTP que realiza peticiones al backend FastAPI para datos y simulaciones." "TypeScript Fetch"
                authContext = component "AuthProvider" "Contexto de autenticación: estado de usuario, login, registro, logout y protección de rutas." "React Context"
                webWorker = component "Simulation Worker" "Web Worker que ejecuta el motor FDM JavaScript en hilo separado como fallback si el backend no responde." "Web Worker"
                useInView = component "useInView" "Hook de Intersection Observer para animaciones de scroll (fade-in al entrar en viewport)." "React Hook"
            }

            // ──────────────────────────────
            // CONTENEDOR: Backend
            // ──────────────────────────────
            backend = container "Backend (FastAPI + Python)" "API REST que expone endpoints para simulación FDM con NumPy, consulta de datos sísmicos, quiz educativo y línea de tiempo." "FastAPI + Uvicorn + NumPy" {
                tags "Backend"

                // Endpoints de simulación
                simulateEndpoint = component "POST /api/simulate" "Recibe parámetros sísmicos, ejecuta simulación FDM 2D y retorna pseudo-sismogramas triaxiales con métricas." "FastAPI Route"
                lameEndpoint = component "GET /api/lame" "Calcula parámetros de Lamé (λ, μ) a partir de Vp, Vs y densidad." "FastAPI Route"

                // Endpoints de datos
                eventsEndpoint = component "GET /api/events" "Consulta eventos sísmicos históricos con filtros por tipo, magnitud, año y ubicación." "FastAPI Route"
                eventByIdEndpoint = component "GET /api/events/{id}" "Obtiene un evento sísmico específico por su UUID." "FastAPI Route"
                quizEndpoint = component "GET /api/quiz" "Retorna N preguntas aleatorias del quiz educativo desde la base de datos." "FastAPI Route"
                factsEndpoint = component "GET /api/wave-facts" "Retorna datos curiosos sobre ondas sísmicas agrupados por tipo (P, S, Love, Rayleigh)." "FastAPI Route"
                timelineEndpoint = component "GET /api/timeline" "Retorna eventos históricos ordenados cronológicamente para la línea de tiempo." "FastAPI Route"
                statsEndpoint = component "GET /api/stats" "Retorna conteos generales: eventos, preguntas, facts y timeline." "FastAPI Route"

                // Motor de simulación
                fdmEngine = component "FDM Engine" "Motor de simulación numérica: ecuación de onda elástica 2D por diferencias finitas. Incluye fuente Ricker, condiciones de frontera absorbentes (sponge), superficie libre y detección de llegadas P/S." "Python + NumPy"

                // Cliente de datos
                supabaseClient = component "Supabase Client" "Cliente Python que conecta con Supabase PostgreSQL para lectura y escritura de datos." "supabase-py"
            }

            // ──────────────────────────────
            // CONTENEDOR: Base de Datos
            // ──────────────────────────────
            postgresDB = container "Base de Datos PostgreSQL" "Almacena eventos sísmicos históricos, perfiles de usuario, preguntas del quiz, datos curiosos de ondas, línea de tiempo y reportes de simulación." "Supabase PostgreSQL + RLS" {
                tags "Database"
            }
        }

        // ═══════════════════════════════════
        // RELACIONES DE CONTEXTO (Nivel 1)
        // ═══════════════════════════════════
        visitante -> sismoNarino "Explora datos, ejecuta simulaciones y realiza quiz educativos"
        usuario -> sismoNarino "Ejecuta simulaciones, guarda reportes y gestiona su perfil"
        administrador -> sismoNarino "Gestiona usuarios, contenido educativo, eventos y reportes"
        sismoNarino -> supabaseCloud "Almacena y consulta datos vía API REST + autenticación JWT"

        // ═══════════════════════════════════
        // RELACIONES DE CONTENEDORES (Nivel 2)
        // ═══════════════════════════════════
        visitante -> sismoNarino.frontend "Navega la interfaz web"
        usuario -> sismoNarino.frontend "Inicia sesión, ejecuta simulaciones y guarda reportes"
        administrador -> sismoNarino.frontend "Accede al panel de administración"
        sismoNarino.frontend -> sismoNarino.backend "Consume API REST [HTTP/JSON, puerto 8000]"
        sismoNarino.backend -> sismoNarino.postgresDB "Lee y escribe datos [SQL vía Supabase REST]"
        sismoNarino.postgresDB -> supabaseCloud "Alojada y gestionada en Supabase Cloud (us-east-1)"

        // ═══════════════════════════════════
        // RELACIONES INTERNAS FRONTEND (Nivel 3)
        // ═══════════════════════════════════

        // App → Páginas
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.navbar "Renderiza barra de navegación"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.footer "Renderiza pie de página"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.homePage "Renderiza página principal"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.simulationPage "Renderiza módulo de simulación"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.explorerPage "Renderiza explorador de datos"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.educationPage "Renderiza centro de aprendizaje"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.authPage "Renderiza login/registro"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.myReportsPage "Renderiza reportes del usuario"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.adminDashboard "Renderiza panel de administración"
        sismoNarino.frontend.appComponent -> sismoNarino.frontend.authContext "Provee contexto de autenticación"

        // Navbar
        sismoNarino.frontend.navbar -> sismoNarino.frontend.authContext "Lee estado de usuario y rol"

        // Simulación
        sismoNarino.frontend.simulationPage -> sismoNarino.frontend.parametersPanel "Configura parámetros sísmicos"
        sismoNarino.frontend.simulationPage -> sismoNarino.frontend.resultsPanel "Muestra métricas y exportación"
        sismoNarino.frontend.simulationPage -> sismoNarino.frontend.triaxialPlane "Muestra propagación 3D"
        sismoNarino.frontend.simulationPage -> sismoNarino.frontend.waveChart "Muestra sismogramas 2D"
        sismoNarino.frontend.simulationPage -> sismoNarino.frontend.progressBar "Muestra progreso de simulación"
        sismoNarino.frontend.simulationPage -> sismoNarino.frontend.apiClient "Solicita simulación al backend"
        sismoNarino.frontend.simulationPage -> sismoNarino.frontend.webWorker "Ejecuta FDM en navegador (fallback)"

        // Explorador
        sismoNarino.frontend.explorerPage -> sismoNarino.frontend.apiClient "Solicita eventos sísmicos filtrados"

        // Educación
        sismoNarino.frontend.educationPage -> sismoNarino.frontend.waveExplorer "Renderiza explorador de ondas"
        sismoNarino.frontend.educationPage -> sismoNarino.frontend.magnitudeScale "Renderiza escala de magnitud"
        sismoNarino.frontend.educationPage -> sismoNarino.frontend.depthVisualizer "Renderiza visualizador de profundidad"
        sismoNarino.frontend.educationPage -> sismoNarino.frontend.historicalTimeline "Renderiza línea de tiempo"
        sismoNarino.frontend.educationPage -> sismoNarino.frontend.seismicQuiz "Renderiza quiz interactivo"
        sismoNarino.frontend.educationPage -> sismoNarino.frontend.apiClient "Solicita quiz, facts y timeline"

        // Auth y reportes
        sismoNarino.frontend.authPage -> sismoNarino.frontend.authContext "Ejecuta login/registro"
        sismoNarino.frontend.myReportsPage -> sismoNarino.frontend.apiClient "Consulta y elimina reportes"
        sismoNarino.frontend.adminDashboard -> sismoNarino.frontend.apiClient "Gestiona usuarios, eventos, quiz y reportes"

        // API Client → Backend
        sismoNarino.frontend.apiClient -> sismoNarino.backend.simulateEndpoint "POST /api/simulate [JSON]"
        sismoNarino.frontend.apiClient -> sismoNarino.backend.eventsEndpoint "GET /api/events [query params]"
        sismoNarino.frontend.apiClient -> sismoNarino.backend.quizEndpoint "GET /api/quiz"
        sismoNarino.frontend.apiClient -> sismoNarino.backend.factsEndpoint "GET /api/wave-facts"
        sismoNarino.frontend.apiClient -> sismoNarino.backend.timelineEndpoint "GET /api/timeline"
        sismoNarino.frontend.apiClient -> sismoNarino.backend.statsEndpoint "GET /api/stats"
        sismoNarino.frontend.apiClient -> sismoNarino.backend.lameEndpoint "GET /api/lame"

        // ═══════════════════════════════════
        // RELACIONES INTERNAS BACKEND (Nivel 3)
        // ═══════════════════════════════════
        sismoNarino.backend.simulateEndpoint -> sismoNarino.backend.fdmEngine "Invoca motor FDM con parámetros"
        sismoNarino.backend.lameEndpoint -> sismoNarino.backend.fdmEngine "Calcula constantes elásticas"
        sismoNarino.backend.eventsEndpoint -> sismoNarino.backend.supabaseClient "SELECT seismic_events con filtros"
        sismoNarino.backend.eventByIdEndpoint -> sismoNarino.backend.supabaseClient "SELECT seismic_events WHERE id="
        sismoNarino.backend.quizEndpoint -> sismoNarino.backend.supabaseClient "SELECT quiz_questions WHERE active=true"
        sismoNarino.backend.factsEndpoint -> sismoNarino.backend.supabaseClient "SELECT wave_facts WHERE active=true"
        sismoNarino.backend.timelineEndpoint -> sismoNarino.backend.supabaseClient "SELECT timeline_events ORDER BY year"
        sismoNarino.backend.statsEndpoint -> sismoNarino.backend.supabaseClient "COUNT(*) en todas las tablas"
        sismoNarino.backend.supabaseClient -> sismoNarino.postgresDB "Queries SQL vía Supabase REST API"
    }

    views {

        systemContext sismoNarino "Contexto" {
            include *
            autolayout lr
        }

        container sismoNarino "Contenedores" {
            include *
            autolayout lr
        }

        component sismoNarino.backend "ComponentesBackend" {
            include *
            autolayout lr
        }

        component sismoNarino.frontend "ComponentesFrontend" {
            include *
            autolayout lr
        }

        styles {
            element "Person" {
                shape person
                color #7DB167
                stroke #7DB167
                strokeWidth 4
            }
            element "Software System" {
                shape roundedbox
                color #1168BD
                stroke #1168BD
                strokeWidth 4
            }
            element "External" {
                shape roundedbox
                color #999999
                stroke #999999
                strokeWidth 4
            }
            element "Container" {
                shape roundedbox
                stroke #1168BD
                strokeWidth 4
            }
            element "Frontend" {
                shape webbrowser
                stroke #C4553A
                strokeWidth 4
            }
            element "Backend" {
                stroke #2D6A4F
                strokeWidth 7
            }
            element "Component" {
                shape component
                stroke #1168BD
                strokeWidth 4
            }
            element "Database" {
                shape cylinder
                color #6B5B95
                strokeWidth 4
            }
            element "FastAPI Route" {
                color #A3D2CA
            }
            element "Python + NumPy" {
                color #F7D6BF
            }
            element "supabase-py" {
                color #BDE0FE
            }
            element "React Component" {
                color #D8E2DC
            }
            element "React + Three.js" {
                color #F7D6BF
            }
            element "React + SVG Canvas" {
                color #F7D6BF
            }
            element "TypeScript Fetch" {
                color #BDE0FE
            }
            element "Web Worker" {
                color #E8DAEF
            }
            element "React Context" {
                color #FFE5D9
            }
            element "React Hook" {
                color #E8DAEF
            }
        }
    }
}
