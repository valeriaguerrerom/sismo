"""
SismoNariño — Backend FastAPI
=============================

API REST para el Simulador Triaxial de Pseudo-Sismogramas.

Endpoints:
    - POST /api/simulate: Ejecuta simulación FDM 2D
    - GET /api/lame: Calcula parámetros de Lamé
    - GET /api/events: Consulta eventos sísmicos históricos
    - GET /api/events/{id}: Obtiene evento por ID
    - GET /api/quiz: Preguntas aleatorias del quiz
    - GET /api/wave-facts: Datos curiosos sobre ondas
    - GET /api/timeline: Línea de tiempo histórica
    - GET /api/stats: Estadísticas generales
    - POST /api/import/quakeml: Parsear catálogo QuakeML del SGC (RF-16)
    - POST /api/upload/mseed: Procesar MiniSEED subido por un investigador

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from supabase import create_client, Client

from core.config import IS_PRODUCTION, safe_error_detail
from core.rate_limit import RateLimiter, client_ip
from simulation import (
    SimulationParams, SimulationResult, SimulationFullResult,
    run_fdm, run_fdm_full, compute_lame, warmup_fdm,
)
from api.travel_times import router as travel_times_router
from api.scene import router as scene_router
from api.synthetic import router as synthetic_router
from api.waveforms import router as waveforms_router
from api.ray_path import router as ray_path_router
from api.stats_home import router as stats_home_router
from api.quakeml import router as quakeml_router
from api.mseed_upload import router as mseed_upload_router
from api.account import router as account_router
from api.feedback import router as feedback_router
from api.event_waveforms import router as event_waveforms_router

load_dotenv()

# ─── Configuración por entorno (seguridad) ───
# IS_PRODUCTION y safe_error_detail viven en core.config para compartirse con
# los routers. En producción se restringe CORS, se ocultan los detalles de las
# excepciones y se deshabilita la documentación interactiva.
# Orígenes permitidos para CORS. En producción se toman de ALLOWED_ORIGINS
# (lista separada por comas con los dominios del frontend). En desarrollo se
# permiten los orígenes locales de Vite.
_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
_env_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if IS_PRODUCTION:
    # Sin ALLOWED_ORIGINS en producción no se habilita ningún origen (fallo seguro).
    ALLOWED_ORIGINS = _env_origins
else:
    ALLOWED_ORIGINS = _env_origins + _DEV_ORIGINS

# Límite de peticiones por IP para las simulaciones FDM (cómputo intensivo). Es
# generoso para el uso normal (el panel lanza una simulación por clic) pero
# frena ráfagas automatizadas que podrían saturar la CPU del servidor.
_simulate_limiter = RateLimiter(
    per_minute=20, per_hour=200,
    mensaje="Demasiadas simulaciones seguidas. Espera unos segundos e inténtalo de nuevo.",
)


# ─── Fallback data when Supabase is unavailable ───

FALLBACK_EVENTS = [
    {"id": "1", "event_date": "1979-12-12", "event_time": "07:59:00", "magnitude": 8.1, "depth_km": 24.0, "latitude": 1.5982, "longitude": -79.3582, "location_name": "Costa Pacífica — Tumaco", "event_type": "tectonic", "source": "USGS", "notes": "Gran terremoto con tsunami, destrucción en Tumaco"},
    {"id": "2", "event_date": "1906-01-31", "event_time": "15:36:00", "magnitude": 8.8, "depth_km": 25.0, "latitude": 1.0, "longitude": -81.5, "location_name": "Costa Pacífica", "event_type": "tectonic", "source": "Histórico", "notes": "Gran terremoto del Pacífico colombiano"},
    {"id": "3", "event_date": "1993-01-14", "event_time": "20:17:00", "magnitude": 4.8, "depth_km": 8.0, "latitude": 1.2216, "longitude": -77.3742, "location_name": "Cráter Galeras", "event_type": "volcanic", "source": "OVSP", "notes": "Erupción del Volcán Galeras"},
    {"id": "4", "event_date": "2016-04-16", "event_time": "23:58:00", "magnitude": 7.8, "depth_km": 20.0, "latitude": 0.3543, "longitude": -79.9219, "location_name": "Costa Pacífica Ecuador-Nariño", "event_type": "tectonic", "source": "SGC", "notes": "Terremoto Ecuador sentido en Nariño"},
]

FALLBACK_QUIZ = [
    {"id": "1", "question": "¿Cuál es la onda sísmica más rápida?", "options": ["Onda S", "Onda P", "Onda Love", "Onda Rayleigh"], "correct_index": 1, "explanation": "Las ondas P son las más rápidas (3-8 km/s).", "category": "ondas", "difficulty": "facil"},
    {"id": "2", "question": "¿Qué volcán de Nariño es uno de los más activos?", "options": ["Cumbal", "Azufral", "Galeras", "Doña Juana"], "correct_index": 2, "explanation": "El Galeras es uno de los más activos de Colombia.", "category": "volcanes", "difficulty": "facil"},
    {"id": "3", "question": "¿Las ondas S viajan por líquidos?", "options": ["Sí", "Solo agua salada", "No, nunca", "A altas presiones"], "correct_index": 2, "explanation": "Las ondas S no se propagan en líquidos.", "category": "ondas", "difficulty": "medio"},
    {"id": "4", "question": "¿Qué placa se subduce bajo Nariño?", "options": ["Caribe", "Cocos", "Nazca", "Antártica"], "correct_index": 2, "explanation": "La Placa de Nazca se subduce bajo la Sudamericana.", "category": "tectonica", "difficulty": "medio"},
]

FALLBACK_FACTS: dict[str, list[str]] = {
    "P": ["Pueden atravesar el núcleo líquido de la Tierra.", "Viajan a ~6 km/s en la corteza."],
    "S": ["Su ausencia en el núcleo demostró que es líquido.", "Son las principales causantes de daño."],
    "Love": ["Nombradas por Augustus Love en 1911.", "Destructivas para edificios altos."],
    "Rayleigh": ["Predijo Lord Rayleigh en 1885.", "Movimiento elíptico como olas del mar."],
}

FALLBACK_TIMELINE = [
    {"id": "1", "year": 1979, "magnitude": "8.1", "title": "Sismo de Tumaco", "description": "Tsunami devastador en la costa pacífica.", "event_type": "tectonic"},
    {"id": "2", "year": 1993, "magnitude": None, "title": "Erupción del Galeras", "description": "Erupción durante conferencia de vulcanólogos.", "event_type": "volcanic"},
]

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

supabase: Client | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
            # Test connection
            supabase.table("seismic_events").select("id").limit(1).execute()
            print(f"[API] Supabase connected: {SUPABASE_URL}")
        except Exception as e:
            print(f"[API] WARNING: Supabase connection failed: {e}")
            supabase = None
    else:
        print("[API] WARNING: Supabase not configured")

    # Precompila el kernel Numba del FDM AL ARRANCAR (no en la 1ª petición de un
    # usuario). Se ejecuta en un hilo para no bloquear el loop async del startup.
    try:
        import asyncio
        elapsed = await asyncio.to_thread(warmup_fdm)
        if elapsed > 0:
            print(f"[API] Numba FDM kernel precompilado en {elapsed:.1f}s")
        else:
            print("[API] Numba no disponible o ya precompilado (motor NumPy de respaldo)")
    except Exception as e:
        print(f"[API] WARNING: warmup del kernel FDM fallo: {e}")
    yield


# En producción se deshabilita la documentación interactiva (/docs, /redoc) y el
# esquema OpenAPI (/openapi.json) para no exponer la superficie de la API. En
# desarrollo quedan habilitados en sus rutas por defecto.
app = FastAPI(
    title="SismoNariño API",
    description="Simulador Triaxial de Pseudo-Sismogramas — Backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# CORS: la API no usa cookies (la sesión viaja en el header Authorization:
# Bearer), así que allow_credentials debe ser False. Con credentials=True el
# navegador RECHAZA la combinación con allow_origins=["*"] (spec CORS) y las
# peticiones fallan con "Failed to fetch", sobre todo en los DELETE (preflight).
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compresión gzip de las respuestas (clave para /api/simulate/full, cuyos
# fotogramas del corte son varios MB de JSON: gzip los reduce ~4-6×).
app.add_middleware(GZipMiddleware, minimum_size=1024)


# Cabeceras de seguridad en TODAS las respuestas del backend. La API devuelve
# JSON (no HTML navegable), así que la CSP es restrictiva: nada de scripts ni
# marcos. HSTS solo se envía en producción (en local es HTTP y no aplica).
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# Manejador global de errores no controlados. Sin esto, una excepción cruda
# produce un 500 SIN headers CORS, y el navegador lo reporta como "bloqueado por
# CORS / Failed to fetch" ocultando el error real. Aquí devolvemos un JSON con
# el detalle y con Access-Control-Allow-Origin, para que el frontend lo lea.
def _cors_header_for(request: Request) -> dict[str, str]:
    """Calcula el header Access-Control-Allow-Origin para respuestas de error.

    Los exception_handler globales de Starlette se saltan el CORSMiddleware, así
    que debemos reflejar el header manualmente. Solo se refleja el origen de la
    petición si está en la lista de orígenes permitidos; en caso contrario no se
    añade ningún header (fallo seguro).
    """
    origin = request.headers.get("origin")
    if origin and origin in ALLOWED_ORIGINS:
        return {"Access-Control-Allow-Origin": origin}
    return {}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": safe_error_detail(exc, "Error interno del servidor")},
        headers=_cors_header_for(request),
    )


# Errores de validación de parámetros (fuera de rango o combinación física
# inválida): FastAPI devuelve 422 con un cuerpo genérico en inglés. Aquí lo
# traducimos a un mensaje claro en español para que el frontend lo muestre. El
# backend NUNCA confía en la validación del navegador: valida siempre lo mismo.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errores = []
    for err in exc.errors():
        campo = err.get("loc", ["?"])[-1]
        msg = err.get("msg", "valor inválido")
        # Los mensajes de nuestros validadores (ValueError) ya vienen en español.
        msg = msg.replace("Value error, ", "")
        errores.append(f"{campo}: {msg}")
    detalle = "Parámetros inválidos. " + " · ".join(errores)
    return JSONResponse(
        status_code=422,
        content={"detail": detalle},
        headers=_cors_header_for(request),
    )

# Routers del Mapa 3D (cálculo geo, geometría de escena, tiempos, síntesis, MiniSEED)
app.include_router(travel_times_router)
app.include_router(scene_router)
app.include_router(synthetic_router)
app.include_router(waveforms_router)
app.include_router(ray_path_router)
app.include_router(stats_home_router)
# Importación de catálogos QuakeML (RF-16)
app.include_router(quakeml_router)
# Carga de MiniSEED por investigadores
app.include_router(mseed_upload_router)
# Waveforms reales de eventos del catálogo
app.include_router(event_waveforms_router)
# Autogestión de la cuenta (eliminación por el propio usuario)
app.include_router(account_router)

# Formulario de contacto "Escríbenos" (guarda con la clave de servicio)
app.include_router(feedback_router)


# ─── Health ───

@app.get("/", tags=["Health"], summary="Estado del servicio")
def root():
    """Verifica que el servicio esté activo.

    Returns:
        dict: Estado del servicio con nombre y versión.
    """
    return {"status": "ok", "service": "SismoNariño API", "version": "1.0.0"}


@app.get("/health", tags=["Health"], summary="Health check detallado")
def health():
    """Verifica el estado del servicio y la conexión con Supabase.

    Returns:
        dict: Estado de salud incluyendo conectividad con la base de datos.
    """
    return {"status": "healthy", "supabase": supabase is not None}


# ─── Simulación FDM ───

@app.post("/api/simulate", response_model=SimulationResult, tags=["Simulación"], summary="Ejecutar simulación FDM 2D")
def simulate(params: SimulationParams, request: Request):
    """Ejecuta una simulación de propagación de ondas sísmicas usando el Método de Diferencias Finitas (FDM) 2D.

    Resuelve la ecuación de onda elástica en un medio isótropo con:
    - Fuente Ricker wavelet (doble-cupla para tectónico, isótropa para volcánico)
    - Condiciones de frontera absorbentes (sponge layer)
    - Superficie libre en z=0
    - Registro triaxial (N, E, Z) en un receptor en superficie

    Args:
        params: Parámetros de simulación incluyendo velocidades, densidad, magnitud, profundidad y configuración de malla.

    Returns:
        SimulationResult: Sismogramas triaxiales, métricas de amplitud, llegadas P/S y metadatos de la malla.

    Raises:
        HTTPException(429): Si se supera el límite de peticiones por IP.
        HTTPException(500): Si ocurre un error durante la simulación.
    """
    _simulate_limiter.check(client_ip(request))
    try:
        result = run_fdm(params)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=safe_error_detail(e, "Error en simulación"))


@app.post("/api/simulate/full", response_model=SimulationFullResult, tags=["Simulación"],
          summary="Ejecutar simulación FDM 2D con snapshots del campo (mapa de calor)")
def simulate_full(params: SimulationParams, request: Request):
    """Ejecuta el FDM 2D y devuelve además los snapshots del campo de ondas.

    Igual que ``/api/simulate`` pero incluye ``snapshots`` (frames del campo
    submuestreado, codificados en base64 Float32) y ``snapshotGrid`` para que el
    navegador dibuje el mapa de calor sin recomputar nada. El cómputo pesado
    ocurre íntegramente en el backend.

    Args:
        params: Parámetros de simulación (velocidades, densidad, fuente, malla).

    Returns:
        SimulationFullResult: Sismogramas, métricas, llegadas P/S, snapshots y grid.

    Raises:
        HTTPException(429): Si se supera el límite de peticiones por IP.
        HTTPException(500): Si ocurre un error durante la simulación.
    """
    _simulate_limiter.check(client_ip(request))
    try:
        return run_fdm_full(params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=safe_error_detail(e, "Error en simulación"))


@app.get("/api/lame", tags=["Simulación"], summary="Calcular parámetros de Lamé")
def lame_params(
    vp: float = Query(default=3500, description="Velocidad de onda P (m/s)"),
    vs: float = Query(default=2000, description="Velocidad de onda S (m/s)"),
    density: float = Query(default=2600, description="Densidad del medio (kg/m³)"),
):
    """Calcula los parámetros elásticos de Lamé (λ y μ) a partir de velocidades sísmicas.

    Relaciones utilizadas:
        μ = ρ · Vs²
        λ = ρ · Vp² - 2μ

    Args:
        vp: Velocidad de onda P en m/s.
        vs: Velocidad de onda S en m/s.
        density: Densidad del medio en kg/m³.

    Returns:
        dict: Parámetros de Lamé (lambda, mu) y valores de entrada.
    """
    lam, mu = compute_lame(vp, vs, density)
    return {"lambda": lam, "mu": mu, "vp": vp, "vs": vs, "density": density}


# ─── Eventos Sísmicos ───

@app.get("/api/events", tags=["Datos Sísmicos"], summary="Consultar eventos sísmicos")
def get_events(
    type: str | None = Query(default=None, description="Tipo de evento: tectonic | volcanic"),
    min_mag: float | None = Query(default=None, description="Magnitud mínima"),
    max_mag: float | None = Query(default=None, description="Magnitud máxima"),
    start_year: int | None = Query(default=None, description="Año de inicio del rango"),
    end_year: int | None = Query(default=None, description="Año de fin del rango"),
    search: str | None = Query(default=None, description="Búsqueda por nombre de ubicación"),
    sort_by: str = Query(default="event_date", description="Campo de ordenamiento"),
    sort_dir: str = Query(default="desc", description="Dirección: asc | desc"),
    limit: int = Query(default=100, le=500, description="Máximo de resultados"),
):
    """Consulta eventos sísmicos históricos de Nariño (1827–2023).

    Permite filtrar por tipo de evento, rango de magnitud, rango de años
    y búsqueda textual por ubicación. Los resultados se ordenan según
    el campo y dirección especificados.

    Fuentes de datos: SGC, OVSP, USGS.

    Returns:
        dict: Lista de eventos y conteo total.
    """
    if not supabase:
        return {"data": FALLBACK_EVENTS, "count": len(FALLBACK_EVENTS)}

    try:
        query = supabase.table("seismic_events").select("*")

        if type and type != "all":
            query = query.eq("event_type", type)
        if min_mag is not None:
            query = query.gte("magnitude", min_mag)
        if max_mag is not None:
            query = query.lte("magnitude", max_mag)
        if start_year is not None:
            query = query.gte("event_date", f"{start_year}-01-01")
        if end_year is not None:
            query = query.lte("event_date", f"{end_year}-12-31")
        if search:
            query = query.ilike("location_name", f"%{search}%")

        ascending = sort_dir == "asc"
        query = query.order(sort_by, desc=not ascending).limit(limit)

        response = query.execute()
        return {"data": response.data, "count": len(response.data)}
    except Exception as e:
        print(f"[API] Events error: {e}")
        return {"data": FALLBACK_EVENTS, "count": len(FALLBACK_EVENTS)}


@app.get("/api/events/{event_id}", tags=["Datos Sísmicos"], summary="Obtener evento por ID")
def get_event(event_id: str):
    """Obtiene los detalles completos de un evento sísmico específico.

    Args:
        event_id: UUID del evento sísmico.

    Returns:
        dict: Datos completos del evento (fecha, magnitud, profundidad, ubicación, etc.).

    Raises:
        HTTPException(404): Si el evento no existe.
    """
    if not supabase:
        ev = next((e for e in FALLBACK_EVENTS if e["id"] == event_id), None)
        if not ev:
            raise HTTPException(status_code=404, detail="Evento no encontrado")
        return ev
    try:
        response = supabase.table("seismic_events").select("*").eq("id", event_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Evento no encontrado")
        return response.data
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] Event by ID error: {e}")
        raise HTTPException(status_code=404, detail="Evento no encontrado")


# ─── Quiz ───

@app.get("/api/quiz", tags=["Educación"], summary="Obtener preguntas del quiz")
def get_quiz(count: int = Query(default=8, le=20, description="Número de preguntas a retornar")):
    """Retorna preguntas aleatorias del quiz educativo sobre sismología.

    Las preguntas cubren categorías: ondas sísmicas, volcanes de Nariño,
    tectónica de placas y conceptos generales de sismología.

    Args:
        count: Número de preguntas deseadas (máximo 20).

    Returns:
        dict: Lista de preguntas con opciones, índice correcto y explicación.
    """
    import random

    if not supabase:
        q = FALLBACK_QUIZ[:]
        random.shuffle(q)
        return {"data": q[:count]}

    try:
        response = supabase.table("quiz_questions").select("*").eq("active", True).execute()
        if not response.data:
            return {"data": FALLBACK_QUIZ[:count]}
        questions = response.data
        random.shuffle(questions)
        return {"data": questions[:count]}
    except Exception as e:
        print(f"[API] Quiz error: {e}")
        q = FALLBACK_QUIZ[:]
        random.shuffle(q)
        return {"data": q[:count]}


# ─── Wave Facts ───

@app.get("/api/wave-facts", tags=["Educación"], summary="Datos curiosos sobre ondas")
def get_wave_facts():
    """Retorna datos curiosos sobre ondas sísmicas agrupados por tipo.

    Tipos disponibles: P (primarias), S (secundarias), Love y Rayleigh.
    Cada tipo incluye múltiples datos curiosos seleccionados aleatoriamente
    en el frontend para variedad educativa.

    Returns:
        dict: Diccionario con tipo de onda como clave y lista de facts como valor.
    """
    if not supabase:
        return {"data": FALLBACK_FACTS}

    try:
        response = supabase.table("wave_facts").select("*").eq("active", True).execute()
        if not response.data:
            return {"data": FALLBACK_FACTS}
        grouped: dict[str, list[str]] = {}
        for row in response.data:
            wtype = row["wave_type"]
            if wtype not in grouped:
                grouped[wtype] = []
            grouped[wtype].append(row["fact"])
        return {"data": grouped}
    except Exception as e:
        print(f"[API] Facts error: {e}")
        return {"data": FALLBACK_FACTS}


# ─── Timeline ───

@app.get("/api/timeline", tags=["Educación"], summary="Línea de tiempo histórica")
def get_timeline():
    """Retorna eventos históricos sísmicos y volcánicos de Nariño para la línea de tiempo.

    Incluye eventos desde 1834 hasta 2023, ordenados cronológicamente.
    Cada evento tiene año, magnitud (si aplica), título, descripción y tipo.

    Returns:
        dict: Lista de eventos históricos ordenados por año.
    """
    if not supabase:
        return {"data": FALLBACK_TIMELINE}

    try:
        response = (
            supabase.table("timeline_events")
            .select("*")
            .eq("active", True)
            .order("year", desc=False)
            .execute()
        )
        return {"data": response.data if response.data else FALLBACK_TIMELINE}
    except Exception as e:
        print(f"[API] Timeline error: {e}")
        return {"data": FALLBACK_TIMELINE}


# ─── Stats ───

@app.get("/api/stats", tags=["Datos Sísmicos"], summary="Estadísticas generales")
def get_stats():
    """Retorna conteos generales de registros en la base de datos.

    Returns:
        dict: Conteo de eventos sísmicos, preguntas del quiz, datos curiosos y eventos de timeline.
    """
    if not supabase:
        return {"events": len(FALLBACK_EVENTS), "quiz_questions": len(FALLBACK_QUIZ), "wave_facts": sum(len(v) for v in FALLBACK_FACTS.values()), "timeline_events": len(FALLBACK_TIMELINE)}

    try:
        events = supabase.table("seismic_events").select("*", count="exact").execute()
        quiz = supabase.table("quiz_questions").select("*", count="exact").execute()
        facts = supabase.table("wave_facts").select("*", count="exact").execute()
        timeline = supabase.table("timeline_events").select("*", count="exact").execute()
        return {
            "events": events.count or 0,
            "quiz_questions": quiz.count or 0,
            "wave_facts": facts.count or 0,
            "timeline_events": timeline.count or 0,
        }
    except Exception as e:
        print(f"[API] Stats error: {e}")
        return {"events": 0, "quiz_questions": 0, "wave_facts": 0, "timeline_events": 0}
