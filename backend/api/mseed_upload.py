"""
Carga de archivos MiniSEED por parte de investigadores.

Endpoint:
    POST /api/upload/mseed  (multipart: file, station opcional, freqmin, freqmax)

Lee el archivo con ObsPy, lista las estaciones disponibles, elige una
estación con tres componentes (o la indicada), aplica detrend, un pasabanda
opcional, normaliza a [-1, 1] y decima a un máximo de muestras. Devuelve un
``waveData`` con el mismo formato que usan el Explorador y el Simulador.

No persiste nada en disco ni en base de datos: el archivo se procesa en
memoria y el resultado vuelve al cliente.
"""
from __future__ import annotations

import io
import math
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from core.config import require_user_id
from core.rate_limit import RateLimiter, client_ip
from core.stations import ACCEPTED_STATION_CODES, is_accepted_station

# Supabase client para logging (opcional, no rompe si no existe)
try:
    import os as _os
    from supabase import create_client as _create_client
    _url = _os.getenv("SUPABASE_URL", "")
    _key = _os.getenv("SUPABASE_ANON_KEY", "")
    supabase = _create_client(_url, _key) if (_url and _key) else None
except Exception:
    supabase = None

# Archivos MiniSEED de ejemplo servidos por el backend (se incluyen en la imagen
# Docker; ver backend/Dockerfile: COPY . . y .dockerignore no excluye example_data).
_EXAMPLE_DIR = Path(__file__).resolve().parent.parent / "example_data"
EXAMPLE_MSEED_PATH = _EXAMPLE_DIR / "ejemplo_CUM_tectonico.mseed"  # compat: endpoint antiguo
# Ejemplos por tipo de fuente: tectónico (estación CUM, red SGC) y volcánico
# (estación CUFP del Galeras, OVSP).
EXAMPLE_MSEED = {
    "tectonico": (_EXAMPLE_DIR / "ejemplo_CUM_tectonico.mseed", "ejemplo_CUM_tectonico.mseed"),
    "volcanico": (_EXAMPLE_DIR / "ejemplo_CUFP_volcanico.mseed", "ejemplo_CUFP_volcanico.mseed"),
}

router = APIRouter(tags=["Importación"])

MAX_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_POINTS = 3000

# Límite de subidas por IP: procesar un MiniSEED consume CPU y memoria, así que
# se acota el ritmo para evitar abuso. Generoso para el uso real (un
# investigador sube unos pocos archivos), restrictivo frente a ráfagas.
_upload_limiter = RateLimiter(
    per_minute=10, per_hour=60,
    mensaje="Demasiadas cargas seguidas. Espera un momento e inténtalo de nuevo.",
)
# Prioridad de canal: primero VELOCÍMETROS (banda ancha HH, luego periodo corto
# EH/SH, luego banda ancha de baja tasa BH), y solo al final ACELERÓMETROS
# (HN/HL). Así, si una estación tiene velocímetro y acelerómetro, se usa el
# velocímetro (respuesta más "natural" del suelo para visualizar).
CHANNEL_PRIORITY = ("HH", "EH", "SH", "BH", "HN", "HL")

# Texto de la lista de estaciones aceptadas, para los mensajes de rechazo.
ACCEPTED_LIST_TEXT = ", ".join(ACCEPTED_STATION_CODES[:-1]) + " y Galeras"


class StationInfo(BaseModel):
    station: str
    network: str
    channels: list[str]
    sampling_rate: float
    triaxial: bool


class WaveData(BaseModel):
    time: list[float]
    north: list[float]
    east: list[float]
    vertical: list[float]


class MseedUploadResponse(BaseModel):
    filename: str
    stations: list[StationInfo] = Field(description="Estaciones encontradas en el archivo")
    station: str = Field(description="Estación seleccionada")
    network: str
    channels: dict[str, str] = Field(description="Canal usado por componente N/E/Z")
    sensor_kind: str = Field(description="Tipo de sensor usado: 'velocimetro' o 'acelerometro'")
    sampling_rate: float
    starttime_utc: str
    duration: float
    num_samples: int
    normalization_factor: float
    filtro: dict[str, float] | None
    waveData: WaveData
    orientation_confirmed: bool = Field(
        default=True,
        description="True si las horizontales están orientadas a Norte/Este. "
                    "False si vienen como 1/2 sin azimut (no se rotaron).",
    )
    orientation_note: str | None = Field(
        default=None,
        description="Aviso cuando la orientación no está confirmada.",
    )
    horizontal_labels: dict[str, str] = Field(
        default_factory=lambda: {"north": "Norte (N)", "east": "Este (E)"},
        description="Rótulos a mostrar para las dos horizontales.",
    )
    # ── Estimación de la distancia al sismo por la diferencia S−P (una estación) ──
    sp_seconds: float | None = Field(
        default=None,
        description="Diferencia de tiempo S−P en segundos (None si no se detectó).",
    )
    distance_km_est: float | None = Field(
        default=None,
        description="Distancia aproximada al foco en km, estimada por S−P (≈ 8·(tS−tP)).",
    )
    origin_class: str = Field(
        default="desconocido",
        description="Clasificación del origen: 'local' | 'regional' | 'lejano' | 'desconocido'.",
    )
    distance_note: str = Field(
        default="",
        description="Aviso honesto sobre la estimación de distancia con una sola estación.",
    )


def _decimate(values: list[float], max_points: int = MAX_POINTS) -> list[float]:
    n = len(values)
    if n <= max_points:
        return list(values)
    step = math.ceil(n / max_points)
    return list(values[::step])


def _list_stations(st) -> list[StationInfo]:
    by_station: dict[tuple[str, str], dict] = {}
    for tr in st:
        key = (tr.stats.network, tr.stats.station)
        info = by_station.setdefault(key, {"channels": set(), "fs": float(tr.stats.sampling_rate)})
        info["channels"].add(tr.stats.channel)
    out = []
    for (net, sta), info in sorted(by_station.items(), key=lambda kv: kv[0][1]):
        comps = {_component_of(ch) for ch in info["channels"]} - {None}
        out.append(StationInfo(
            station=sta, network=net, channels=sorted(info["channels"]),
            sampling_rate=info["fs"], triaxial={"Z", "N", "E"} <= comps,
        ))
    return out


def _reject_station(code: str) -> None:
    """Lanza 422 con el mensaje estándar de estación fuera del proyecto."""
    raise HTTPException(
        status_code=422,
        detail=(
            f"Este archivo es de la estación {code}, que no hace parte de las "
            f"estaciones del proyecto en Nariño y sur del Cauca que usa SismoNariño. "
            f"Por ahora solo aceptamos registros de {ACCEPTED_LIST_TEXT}."
        ),
    )


def _pick_station(stations: list[StationInfo], requested: str | None) -> StationInfo:
    """Elige la estación a procesar, aceptando SOLO las de la red de Nariño.

    Si se pide una estación concreta, debe existir en el archivo y estar en la
    lista blanca. Si no se pide ninguna, se elige la primera estación ACEPTADA
    (con preferencia por las triaxiales). Si el archivo no trae ninguna estación
    de la red, se rechaza con un mensaje claro.
    """
    if requested:
        match = next((s for s in stations if s.station == requested), None)
        if match is None:
            raise HTTPException(status_code=404, detail=f"La estación '{requested}' no está en el archivo.")
        if not is_accepted_station(match.station, match.network):
            _reject_station(match.station)
        return match

    # Se valida por par RED.ESTACIÓN (p. ej. CM.CUM), no solo por el código.
    accepted = [s for s in stations if is_accepted_station(s.station, s.network)]
    if not accepted:
        # Ninguna estación del archivo pertenece a la red de Nariño.
        _reject_station(stations[0].station if stations else "desconocida")
    triax = [s for s in accepted if s.triaxial]
    return triax[0] if triax else accepted[0]


def _component_of(channel: str) -> str | None:
    """Componente normalizada (N/E/Z) del último carácter del canal.

    Acepta la convención alfabética (…N/…E/…Z) y la numérica (…1→N, …2→E, …3→Z)
    que usan algunos sensores. Devuelve None si no es una componente reconocida.
    """
    if not channel:
        return None
    c = channel[-1].upper()
    if c in ("N", "1"):
        return "N"
    if c in ("E", "2"):
        return "E"
    if c in ("Z", "3"):
        return "Z"
    return None


def _sensor_kind(prefix: str) -> str:
    """Clasifica el prefijo de canal en velocímetro o acelerómetro."""
    return "acelerometro" if prefix.upper() in ("HN", "HL") else "velocimetro"


def _log_upload_attempt(
    user_id: str,
    filename: str,
    file_size: int,
    success: bool,
    error_reason: str | None = None,
    metadata: dict | None = None,
    processing_time_ms: int | None = None,
) -> None:
    """Registra un intento de carga MiniSEED en mseed_upload_logs.

    Args:
        user_id: UUID del usuario autenticado.
        filename: Nombre del archivo subido.
        file_size: Tamaño en bytes.
        success: True si se procesó correctamente, False si falló.
        error_reason: Razón del fallo (solo si success=False).
        metadata: Diccionario con metadatos extraídos (solo si success=True):
            station_count, selected_station, channels, duration_seconds,
            sample_rate_hz, start_time, end_time, detrend_applied,
            bandpass_applied, bandpass_freq_min_hz, bandpass_freq_max_hz,
            decimation_factor, final_sample_count.
        processing_time_ms: Tiempo de procesamiento en milisegundos.
    
    Si la tabla no existe (migración pendiente), solo imprime warning y continúa.
    """
    if not supabase:
        return  # Sin Supabase no se registra nada (entorno local/testing)

    try:
        log_data = {
            "user_id": user_id,
            "filename": filename,
            "file_size_bytes": file_size,
            "success": success,
            "error_reason": error_reason,
            "processing_time_ms": processing_time_ms,
        }
        if success and metadata:
            log_data.update({
                "station_count": metadata.get("station_count"),
                "selected_station": metadata.get("selected_station"),
                "channels": metadata.get("channels"),
                "duration_seconds": metadata.get("duration_seconds"),
                "sample_rate_hz": metadata.get("sample_rate_hz"),
                "start_time": metadata.get("start_time"),
                "end_time": metadata.get("end_time"),
                "detrend_applied": metadata.get("detrend_applied", True),
                "bandpass_applied": metadata.get("bandpass_applied", False),
                "bandpass_freq_min_hz": metadata.get("bandpass_freq_min_hz"),
                "bandpass_freq_max_hz": metadata.get("bandpass_freq_max_hz"),
                "decimation_factor": metadata.get("decimation_factor"),
                "final_sample_count": metadata.get("final_sample_count"),
            })
        supabase.table("mseed_upload_logs").insert(log_data).execute()
    except Exception as e:
        # Silenciar error si la tabla no existe (migración pendiente)
        # o cualquier otro problema de DB. El logging es opcional.
        import sys
        print(f"[WARNING] Failed to log mseed upload (table may not exist yet): {e}", file=sys.stderr)


# Relación de velocidades Vp/Vs ≈ 1.73 (roca de corteza). Con Vp≈6.3 km/s la
# "constante S−P" clásica es ~8 km/s: distancia ≈ 8·(tS−tP). Es una regla
# estándar de sismología para estimar la distancia con UNA sola estación.
_SP_TO_KM = 8.0


def _estimate_distance_sp(
    vertical: list[float], north: list[float], east: list[float], fs: float,
) -> tuple[float | None, float | None, str, str]:
    """Estima la distancia al foco por la diferencia S−P en una sola estación.

    Detecta la P en la componente vertical (donde la P es fuerte) y la S en la
    envolvente horizontal (donde domina la S, y llega después). Con una sola
    estación NO se puede ubicar el epicentro; solo estimar la DISTANCIA, y de
    forma aproximada. Devuelve (sp_seconds, distance_km, origin_class, note).

    origin_class:
        'local'    (< ~70 km, S−P < ~9 s): probablemente de Nariño/entorno.
        'regional' (~70–300 km): sur de Colombia / Ecuador / costa.
        'lejano'   (> ~300 km): epicentro FUERA de Nariño (telesismo o lejano).
        'desconocido': no se pudieron detectar P y S de forma fiable.
    """
    import numpy as np
    from core.fdm import detect_arrival

    dt = 1.0 / fs if fs > 0 else 0.0
    note_fail = (
        "No se pudieron detectar con fiabilidad las llegadas P y S en este "
        "registro, así que no se estima la distancia. (Con una sola estación "
        "la distancia es siempre aproximada y el epicentro no se puede ubicar.)"
    )
    if dt <= 0 or len(vertical) < 10:
        return None, None, "desconocido", note_fail

    v = np.asarray(vertical, dtype=float)
    # Envolvente horizontal: magnitud del vector (N, E) muestra a muestra.
    n = np.asarray(north, dtype=float)
    e = np.asarray(east, dtype=float)
    m = min(len(n), len(e))
    horiz = np.sqrt(n[:m] ** 2 + e[:m] ** 2) if m > 0 else np.zeros(0)

    tP = detect_arrival(v, dt, threshold=0.08)
    tS = detect_arrival(horiz, dt, threshold=0.12) if len(horiz) else 0.0

    # Validación física: ambas detectadas, S después de P, y S−P en rango
    # razonable (0.5 s a 120 s → ~4 km a ~960 km).
    if tP <= 0 or tS <= 0 or tS <= tP:
        return None, None, "desconocido", note_fail
    sp = tS - tP
    if sp < 0.5 or sp > 120.0:
        return None, None, "desconocido", note_fail

    dist = round(sp * _SP_TO_KM, 1)
    if dist < 70:
        origin = "local"
    elif dist < 300:
        origin = "regional"
    else:
        origin = "lejano"
    note = (
        f"Distancia estimada por S−P (una sola estación): ≈ {dist:.0f} km. "
        "Es aproximada; con una estación no se puede ubicar el epicentro, solo "
        "estimar la distancia. La dirección y el punto exacto no se determinan."
    )
    return round(sp, 2), dist, origin, note


def _pick_traces(st, station: str) -> tuple[dict[str, object], dict[str, str], str]:
    """Elige una traza por componente (N/E/Z) de UN SOLO sensor.

    Recorre los prefijos por prioridad (velocímetros antes que acelerómetros) y
    se queda con el PRIMER prefijo que dé las tres componentes; así no mezcla un
    velocímetro con un acelerómetro. Reconoce la nomenclatura alfabética
    (N/E/Z) y la numérica (1/2/Z).

    Returns:
        (traces, raw_last_char, sensor_kind):
          traces: {'N': Trace, 'E': Trace, 'Z': Trace} (las que encontró),
          raw_last_char: último carácter real del canal por componente
            (para saber si las horizontales venían como 1/2),
          sensor_kind: 'velocimetro' | 'acelerometro' del prefijo elegido.
    """
    sub = st.select(station=station)
    best: dict[str, object] = {}
    best_raw: dict[str, str] = {}
    best_kind = "velocimetro"
    for prefix in CHANNEL_PRIORITY:
        chosen: dict[str, object] = {}
        raw: dict[str, str] = {}
        for tr in sub:
            ch = tr.stats.channel
            if not ch.startswith(prefix):
                continue
            comp = _component_of(ch)
            if comp and comp not in chosen:
                chosen[comp] = tr
                raw[comp] = ch[-1].upper()
        # Nos quedamos con el mejor set alcanzado hasta ahora.
        if len(chosen) > len(best):
            best, best_raw, best_kind = chosen, raw, _sensor_kind(prefix)
        if {"Z", "N", "E"} <= set(chosen):
            return chosen, raw, _sensor_kind(prefix)
    # Ningún prefijo dio las tres; devolvemos el mejor set parcial (para el
    # mensaje de "faltan componentes") o, en última instancia, cualquier canal.
    if not best:
        for tr in sub:
            comp = _component_of(tr.stats.channel)
            if comp and comp not in best:
                best[comp] = tr
                best_raw[comp] = tr.stats.channel[-1].upper()
    return best, best_raw, best_kind


def process_mseed_bytes(
    data: bytes,
    filename: str,
    station: str | None = None,
    freqmin: float | None = None,
    freqmax: float | None = None,
) -> MseedUploadResponse:
    """Procesa un MiniSEED en memoria y devuelve el registro triaxial.

    Raises:
        ValueError: si el archivo no es MiniSEED legible.
        HTTPException 404: si no hay componente vertical.
    """
    from obspy import read

    try:
        st = read(io.BytesIO(data))
    except Exception as exc:
        raise ValueError(f"No se pudo leer el archivo como MiniSEED: {exc}") from exc
    if len(st) == 0:
        raise ValueError("El archivo no contiene trazas.")

    try:
        st.merge(method=1, fill_value="interpolate")
    except Exception:
        pass

    stations = _list_stations(st)
    info = _pick_station(stations, station)  # valida que sea de la red de Nariño
    traces, raw_last, sensor_kind = _pick_traces(st, info.station)

    # Deben estar las TRES componentes (N, E, Z o 1, 2, Z). Si falta alguna, se
    # rechaza con el mismo estilo de mensaje que las estaciones no aceptadas.
    missing = [c for c in ("N", "E", "Z") if c not in traces]
    if missing:
        nombres = {"N": "Norte (N)", "E": "Este (E)", "Z": "Vertical (Z)"}
        faltan = ", ".join(nombres[c] for c in missing)
        raise HTTPException(
            status_code=422,
            detail=(
                f"El registro de la estación {info.station} no trae las tres componentes: "
                f"falta {faltan}. SismoNariño necesita las tres (Norte, Este y Vertical) "
                f"para simular el movimiento del suelo."
            ),
        )

    # ── Orientación de las horizontales ──
    # Si las horizontales vienen como 1/2 (no N/E), su orientación real no se
    # conoce a partir del MiniSEED (el azimut vive en el StationXML, que no se
    # sube). ObsPy solo puede rotar 1/2→N/E si hay azimut en el inventario. Sin
    # ese dato, NO las rotamos ni las presentamos como Norte/Este: se muestran
    # como "Horizontal 1" y "Horizontal 2" con un aviso, y el Simulador no debe
    # usarlas como N/E.
    horiz_numeric = raw_last.get("N") in ("1",) or raw_last.get("E") in ("2",)
    azimuth_available = False  # el MiniSEED subido no trae azimut de sensores
    orientation_confirmed = not horiz_numeric or azimuth_available
    if orientation_confirmed:
        orientation_note = None
        horizontal_labels = {"north": "Norte (N)", "east": "Este (E)"}
    else:
        orientation_note = (
            "Orientación no confirmada; no se rotaron a norte y este. "
            "El archivo trae componentes 1 y 2 sin azimut de los sensores."
        )
        horizontal_labels = {"north": "Horizontal 1", "east": "Horizontal 2"}

    # Alinear inicio y duración común
    start = max(tr.stats.starttime for tr in traces.values())
    end = min(tr.stats.endtime for tr in traces.values())
    if end <= start:
        raise HTTPException(status_code=400, detail="Las componentes no se traslapan en el tiempo.")

    fs = float(traces["Z"].stats.sampling_rate)
    filtro = None
    processed: dict[str, list[float]] = {}
    for comp, tr in traces.items():
        tr = tr.copy().trim(start, end)
        tr.detrend("demean")
        tr.detrend("linear")
        if freqmin is not None and freqmax is not None and freqmin > 0:
            nyq = tr.stats.sampling_rate / 2.0
            fmax = min(freqmax, nyq * 0.95)
            if freqmin < fmax:
                tr.filter("bandpass", freqmin=freqmin, freqmax=fmax, corners=4, zerophase=True)
                filtro = {"freqmin": freqmin, "freqmax": fmax}
        processed[comp] = tr.data.astype(float).tolist()

    # Normalización global (misma escala para las tres componentes)
    peak = max((max(abs(v) for v in vals) if vals else 0.0) for vals in processed.values())
    if peak <= 0:
        peak = 1.0
    n_total = min(len(v) for v in processed.values())
    step = max(1, math.ceil(n_total / MAX_POINTS))
    n_out = len(range(0, n_total, step))

    def series(comp: str) -> list[float]:
        vals = processed.get(comp)
        if not vals:
            return [0.0] * n_out
        return [round(v / peak, 6) for v in _decimate(vals[:n_total], MAX_POINTS)][:n_out]

    dt_eff = step / fs
    wave = WaveData(
        time=[round(i * dt_eff, 5) for i in range(n_out)],
        north=series("N"),
        east=series("E"),
        vertical=series("Z"),
    )

    # Estimación de la distancia al sismo por S−P, con las series procesadas a su
    # fs ORIGINAL (mejor resolución temporal que las decimadas de la vista).
    sp_seconds, distance_km_est, origin_class, distance_note = _estimate_distance_sp(
        processed.get("Z", []), processed.get("N", []), processed.get("E", []), fs,
    )

    return MseedUploadResponse(
        filename=filename,
        stations=stations,
        station=info.station,
        network=info.network,
        channels={c: t.stats.channel for c, t in traces.items()},
        sensor_kind=sensor_kind,
        sampling_rate=fs,
        starttime_utc=str(start),
        duration=round(float(end - start), 3),
        num_samples=n_out,
        normalization_factor=float(peak),
        filtro=filtro,
        waveData=wave,
        orientation_confirmed=orientation_confirmed,
        orientation_note=orientation_note,
        horizontal_labels=horizontal_labels,
        sp_seconds=sp_seconds,
        distance_km_est=distance_km_est,
        origin_class=origin_class,
        distance_note=distance_note,
    )


@router.post("/api/upload/mseed", response_model=MseedUploadResponse,
             summary="Procesar un archivo MiniSEED subido por un investigador")
async def upload_mseed(
    request: Request,
    file: UploadFile = File(..., description="Archivo MiniSEED (.mseed/.msd/.seed)"),
    station: str | None = Form(default=None, description="Código de estación a extraer"),
    freqmin: float | None = Form(default=None, description="Pasabanda: frecuencia mínima (Hz)"),
    freqmax: float | None = Form(default=None, description="Pasabanda: frecuencia máxima (Hz)"),
    authorization: str | None = Header(default=None),
):
    """Devuelve el registro triaxial normalizado de una estación del archivo.

    Requiere sesión: la carga de MiniSEED es una función para investigadores
    autenticados, así que el token se verifica contra Supabase del lado del
    servidor (no basta con que la interfaz oculte el botón sin sesión).

    Registra cada intento de carga (éxito o fallo) en mseed_upload_logs para
    análisis de uso y debugging.

    Raises:
        HTTPException 401: sin sesión o token inválido.
        HTTPException 400: archivo vacío, demasiado grande o ilegible.
        HTTPException 404: estación inexistente o sin componente vertical.
        HTTPException 422: estación fuera del proyecto o falta componente.
        HTTPException 429: si se supera el límite de cargas por IP.
    """
    start_time = time.perf_counter()
    user_id = require_user_id(authorization)  # exige sesión válida; lanza 401 si no la hay
    _upload_limiter.check(client_ip(request))
    
    # Se lee por bloques y se aborta en cuanto se supera el límite, para no
    # cargar en memoria un archivo gigante antes de rechazarlo (DoS por memoria).
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)  # 1 MB por iteración
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_BYTES:
            _log_upload_attempt(
                user_id, file.filename or "unknown", total, False,
                error_reason="file_too_large",
                processing_time_ms=int((time.perf_counter() - start_time) * 1000),
            )
            raise HTTPException(status_code=400, detail="El archivo supera los 50 MB.")
        chunks.append(chunk)
    
    data = b"".join(chunks)
    file_size = len(data)
    
    if not data:
        _log_upload_attempt(
            user_id, file.filename or "unknown", 0, False,
            error_reason="empty_file",
            processing_time_ms=int((time.perf_counter() - start_time) * 1000),
        )
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    
    try:
        result = process_mseed_bytes(data, file.filename or "archivo.mseed", station, freqmin, freqmax)
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        
        # Registrar carga exitosa con metadatos completos
        metadata = {
            "station_count": len(result.stations),
            "selected_station": result.station,
            "channels": list(result.channels.values()),
            "duration_seconds": float(result.duration),
            "sample_rate_hz": float(result.sampling_rate),
            "start_time": result.starttime_utc,
            "end_time": None,  # Se puede calcular: start + duration
            "detrend_applied": True,
            "bandpass_applied": result.filtro is not None,
            "bandpass_freq_min_hz": float(result.filtro["freqmin"]) if result.filtro else None,
            "bandpass_freq_max_hz": float(result.filtro["freqmax"]) if result.filtro else None,
            "decimation_factor": None,  # Se calcula internamente en _decimate
            "final_sample_count": result.num_samples,
        }
        _log_upload_attempt(
            user_id, result.filename, file_size, True,
            metadata=metadata, processing_time_ms=processing_time_ms,
        )
        return result
        
    except HTTPException as http_exc:
        # Errores controlados (422 estación no aceptada, 404 sin componente, etc.)
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        error_map = {
            422: "station_not_accepted_or_missing_component",
            404: "station_not_found",
            400: "invalid_format",
        }
        error_reason = error_map.get(http_exc.status_code, "http_error")
        _log_upload_attempt(
            user_id, file.filename or "unknown", file_size, False,
            error_reason=f"{error_reason}: {http_exc.detail}",
            processing_time_ms=processing_time_ms,
        )
        raise
        
    except ValueError as val_exc:
        # Error de lectura de ObsPy (formato inválido, corrupto, etc.)
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        _log_upload_attempt(
            user_id, file.filename or "unknown", file_size, False,
            error_reason=f"invalid_format: {str(val_exc)}",
            processing_time_ms=processing_time_ms,
        )
        raise HTTPException(status_code=400, detail=str(val_exc)) from val_exc
        
    except Exception as exc:
        # Error inesperado en procesamiento
        processing_time_ms = int((time.perf_counter() - start_time) * 1000)
        _log_upload_attempt(
            user_id, file.filename or "unknown", file_size, False,
            error_reason=f"processing_error: {type(exc).__name__}",
            processing_time_ms=processing_time_ms,
        )
        raise HTTPException(status_code=500, detail="Error interno procesando el archivo.") from exc


@router.get("/api/examples/mseed", summary="Descargar el MiniSEED de ejemplo (estación CUM)")
def download_example_mseed():
    """Sirve el archivo MiniSEED de ejemplo (registro real corto de CUM).

    Es un registro tectónico de la estación CUM (Cumbal, Nariño) con velocímetro
    y acelerómetro, para probar la carga. Se sirve como descarga desde el propio
    backend (no depende de Supabase Storage).

    Raises:
        HTTPException 404: si el archivo no está en la imagen.
    """
    if not EXAMPLE_MSEED_PATH.exists():
        raise HTTPException(status_code=404, detail="El archivo de ejemplo no está disponible.")
    return FileResponse(
        EXAMPLE_MSEED_PATH,
        media_type="application/vnd.fdsn.mseed",
        filename="ejemplo_CUM_tectonico.mseed",
        content_disposition_type="attachment",
    )


@router.get("/api/examples/mseed/{kind}", summary="Descargar un MiniSEED de ejemplo por tipo")
def download_example_mseed_by_kind(kind: str):
    """Sirve un MiniSEED de ejemplo según el tipo de fuente.

    Args:
        kind: 'tectonico' (estación CUM, red del SGC) o 'volcanico' (estación
            CUFP del Volcán Galeras, OVSP). Ambos son registros reales cortos y
            triaxiales para probar la carga.

    Raises:
        HTTPException 404: tipo desconocido o archivo no disponible.
    """
    entry = EXAMPLE_MSEED.get(kind.lower())
    if not entry:
        raise HTTPException(status_code=404, detail="Tipo de ejemplo desconocido (usa 'tectonico' o 'volcanico').")
    path, filename = entry
    if not path.exists():
        raise HTTPException(status_code=404, detail="El archivo de ejemplo no está disponible.")
    return FileResponse(
        path,
        media_type="application/vnd.fdsn.mseed",
        filename=filename,
        content_disposition_type="attachment",
    )
