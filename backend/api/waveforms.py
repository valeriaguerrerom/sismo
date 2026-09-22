"""
Router de formas de onda reales (MiniSEED) para el Mapa 3D.

Endpoint:
    GET /api/waveforms/{event_id}/{station_code}

Origen de los datos:
    - En producción (Railway): los .mseed viven en un bucket PÚBLICO de Supabase
      Storage ('mseed-raw'). Se descargan por URL pública (sin credenciales) y se
      leen en memoria con ObsPy. Un manifiesto público (manifest.json) lista todas
      las rutas del bucket para poder resolver los archivos de un evento Galeras
      (que tiene varios .mseed por carpeta) sin necesidad de listar el bucket.
    - En desarrollo: si existe backend/data_raw en disco, se lee de ahí primero
      (más rápido, sin red).

Mapeo event_id → objeto(s):
    - Eventos CM (tectónicos): Colombia/{event_id}.mseed  ·  Ecuador/{event_id}.mseed
    - Eventos Galeras (volcánicos): datos_mseed/{lp,to,tr,va}/{event_id}/*.mseed
"""
import io
import math
import os
from functools import lru_cache
from pathlib import Path

import requests
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["Mapa 3D"])

# Raíz de datos crudos en disco (solo para desarrollo local).
DATA_RAW = Path(__file__).resolve().parent.parent / "data_raw"

# Bucket público de Supabase Storage con los MiniSEED.
STORAGE_BUCKET = "mseed-raw"
_SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")


def _public_url(key: str) -> str:
    """URL pública de un objeto del bucket (lectura anónima)."""
    return f"{_SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{key}"


@lru_cache(maxsize=1)
def _manifest() -> tuple[str, ...]:
    """Lista de rutas del bucket (manifest.json público). Cacheada en memoria.

    Returns:
        Tupla con todas las keys del bucket, o vacía si no se pudo cargar.
    """
    if not _SUPABASE_URL:
        return tuple()
    try:
        r = requests.get(_public_url("manifest.json"), timeout=30)
        if r.status_code == 200:
            return tuple(r.json())
    except Exception:
        pass
    return tuple()


def _download(key: str, retries: int = 3) -> bytes | None:
    """Descarga un objeto del bucket por su key. None si no existe.

    Reintenta ante errores de red transitorios (DNS/conexión) con una espera
    corta creciente. Un 404 real no se reintenta.
    """
    import time
    for attempt in range(retries):
        try:
            r = requests.get(_public_url(key), timeout=60)
            if r.status_code == 200:
                return r.content
            if r.status_code == 404:
                return None  # no existe: no tiene sentido reintentar
        except Exception:
            pass
        if attempt < retries - 1:
            time.sleep(0.5 * (attempt + 1))
    return None


def _local_path(*parts: str) -> Path:
    return DATA_RAW.joinpath(*parts)


def _read_streams(event_id: str):
    """Localiza y lee el/los MiniSEED de un evento en un único Stream de ObsPy.

    Prioriza el disco local (desarrollo); si no está, usa Supabase Storage.

    Args:
        event_id: Identificador del evento (nombre de archivo/carpeta).

    Returns:
        obspy.Stream con todas las trazas del evento.

    Raises:
        HTTPException(404): Si el evento no se encuentra en ninguna fuente.
        HTTPException(500): Si falla la lectura/procesamiento.
    """
    from obspy import read

    # ── CM (tectónico): un solo archivo Colombia/ o Ecuador/ ──
    for region in ("Colombia", "Ecuador"):
        rel = f"{region}/{event_id}.mseed"
        # 1) disco local
        local = _local_path(region, f"{event_id}.mseed")
        if local.exists():
            return read(str(local))
        # 2) Storage
        content = _download(rel)
        if content is not None:
            return read(io.BytesIO(content))

    # ── Galeras (volcánico): varios .mseed en datos_mseed/{sub}/{event_id}/ ──
    # 1) disco local: probar las 4 subcarpetas
    base = DATA_RAW / "datos_mseed"
    if base.exists():
        for subtype in ("lp", "to", "tr", "va"):
            d = base / subtype / event_id
            if d.is_dir():
                st = None
                for f in d.glob("*.mseed"):
                    s = read(str(f))
                    st = s if st is None else st + s
                if st is not None:
                    return st

    # 2) Storage: buscar en el manifiesto las rutas de la carpeta del evento
    prefix_marker = f"/{event_id}/"
    keys = [k for k in _manifest()
            if k.startswith("datos_mseed/") and prefix_marker in f"/{k}"]
    if keys:
        st = None
        for k in keys:
            content = _download(k)
            if content is None:
                continue
            s = read(io.BytesIO(content))
            st = s if st is None else st + s
        if st is not None:
            return st

    raise HTTPException(status_code=404, detail=f"Evento '{event_id}' no encontrado")


def _decimate_list(values, max_points: int = 2000):
    """Submuestrea una lista a un máximo de puntos (paso entero)."""
    n = len(values)
    if n <= max_points:
        return list(values)
    step = math.ceil(n / max_points)
    return list(values[::step])


@router.get("/api/waveforms/{event_id}/{station_code}",
            summary="Forma de onda real (MiniSEED) de una estación")
def waveforms(
    event_id: str,
    station_code: str,
    freqmin: float = Query(default=1.0, gt=0, description="Frecuencia mínima del pasabanda (Hz)"),
    freqmax: float = Query(default=10.0, gt=0, description="Frecuencia máxima del pasabanda (Hz)"),
):
    """Devuelve la forma de onda real triaxial de una estación para un evento.

    Lee el MiniSEED (desde disco local o Supabase Storage), filtra por estación,
    aplica detrend y un pasabanda (freqmin–freqmax Hz), decima a máx. 2000
    muestras por canal y devuelve las componentes Z, N, E disponibles.

    Args:
        event_id: Identificador del evento (nombre de archivo/carpeta).
        station_code: Código de la estación (p.ej. 'PAS2').
        freqmin: Frecuencia mínima del pasabanda (Hz).
        freqmax: Frecuencia máxima del pasabanda (Hz).

    Returns:
        dict con t, canales {Z, N, E}, fs y starttime_utc.

    Raises:
        HTTPException(404): Si no hay archivo o no hay señal para esa estación.
        HTTPException(500): Si falla la lectura/procesamiento.
    """
    try:
        from obspy import read  # noqa: F401  (verifica que ObsPy está disponible)
    except ImportError:
        raise HTTPException(status_code=500, detail="ObsPy no está instalado en el backend")

    try:
        st = _read_streams(event_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo MiniSEED: {e}")

    # Filtrar por estación
    st = st.select(station=station_code)
    if len(st) == 0:
        raise HTTPException(
            status_code=404,
            detail=f"El evento '{event_id}' no tiene señal para la estación '{station_code}'",
        )

    # Elegir una traza por componente (Z, N, E) según el último carácter del canal
    channels: dict[str, object] = {}
    for tr in st:
        comp = tr.stats.channel[-1].upper()
        if comp in ("Z", "N", "E") and comp not in channels:
            channels[comp] = tr

    if "Z" not in channels:
        raise HTTPException(status_code=404, detail="Sin componente vertical (Z) para esa estación")

    # Procesar: detrend + pasabanda + decimación
    fs = float(channels["Z"].stats.sampling_rate)
    starttime = str(channels["Z"].stats.starttime)

    out_channels: dict[str, list] = {}
    npts_ref = None
    for comp, tr in channels.items():
        tr = tr.copy()
        tr.detrend("demean")
        tr.detrend("linear")
        nyq = tr.stats.sampling_rate / 2.0
        fmax = min(freqmax, nyq * 0.95)
        if freqmin < fmax:
            tr.filter("bandpass", freqmin=freqmin, freqmax=fmax, corners=4, zerophase=True)
        data = _decimate_list(tr.data.tolist(), max_points=2000)
        out_channels[comp] = data
        if npts_ref is None or len(data) < npts_ref:
            npts_ref = len(data)

    for comp in out_channels:
        out_channels[comp] = out_channels[comp][:npts_ref]

    total_original = channels["Z"].stats.npts
    decim_step = max(1, math.ceil(total_original / 2000))
    dt_eff = decim_step / fs
    t = [i * dt_eff for i in range(npts_ref)]

    return {
        "event_id": event_id,
        "station": station_code,
        "t": t,
        "canales": out_channels,
        "fs": round(1.0 / dt_eff, 4),
        "starttime_utc": starttime,
        "filtro": {"freqmin": freqmin, "freqmax": freqmax},
    }
