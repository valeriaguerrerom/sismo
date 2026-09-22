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

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

router = APIRouter(tags=["Importación"])

MAX_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_POINTS = 3000
CHANNEL_PRIORITY = ("HH", "BH", "HN", "EH", "EL", "SH")


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
    sampling_rate: float
    starttime_utc: str
    duration: float
    num_samples: int
    normalization_factor: float
    filtro: dict[str, float] | None
    waveData: WaveData


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
        comps = {ch[-1].upper() for ch in info["channels"]}
        out.append(StationInfo(
            station=sta, network=net, channels=sorted(info["channels"]),
            sampling_rate=info["fs"], triaxial={"Z", "N", "E"} <= comps,
        ))
    return out


def _pick_station(stations: list[StationInfo], requested: str | None) -> StationInfo:
    if requested:
        for s in stations:
            if s.station == requested:
                return s
        raise HTTPException(status_code=404, detail=f"La estación '{requested}' no está en el archivo.")
    triax = [s for s in stations if s.triaxial]
    return triax[0] if triax else stations[0]


def _pick_traces(st, station: str) -> dict[str, object]:
    """Elige una traza por componente priorizando canales de banda ancha."""
    sub = st.select(station=station)
    chosen: dict[str, object] = {}
    for prefix in CHANNEL_PRIORITY + ("",):
        for tr in sub:
            ch = tr.stats.channel
            if prefix and not ch.startswith(prefix):
                continue
            comp = ch[-1].upper()
            if comp in ("Z", "N", "E") and comp not in chosen:
                chosen[comp] = tr
        if "Z" in chosen and ("N" in chosen or "E" in chosen):
            break
    return chosen


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
    info = _pick_station(stations, station)
    traces = _pick_traces(st, info.station)
    if "Z" not in traces:
        raise HTTPException(status_code=404, detail=f"La estación '{info.station}' no tiene componente vertical (Z).")

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

    return MseedUploadResponse(
        filename=filename,
        stations=stations,
        station=info.station,
        network=info.network,
        channels={c: t.stats.channel for c, t in traces.items()},
        sampling_rate=fs,
        starttime_utc=str(start),
        duration=round(float(end - start), 3),
        num_samples=n_out,
        normalization_factor=float(peak),
        filtro=filtro,
        waveData=wave,
    )


@router.post("/api/upload/mseed", response_model=MseedUploadResponse,
             summary="Procesar un archivo MiniSEED subido por un investigador")
async def upload_mseed(
    file: UploadFile = File(..., description="Archivo MiniSEED (.mseed/.msd/.seed)"),
    station: str | None = Form(default=None, description="Código de estación a extraer"),
    freqmin: float | None = Form(default=None, description="Pasabanda: frecuencia mínima (Hz)"),
    freqmax: float | None = Form(default=None, description="Pasabanda: frecuencia máxima (Hz)"),
):
    """Devuelve el registro triaxial normalizado de una estación del archivo.

    Raises:
        HTTPException 400: archivo vacío, demasiado grande o ilegible.
        HTTPException 404: estación inexistente o sin componente vertical.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera los 50 MB.")
    try:
        return process_mseed_bytes(data, file.filename or "archivo.mseed", station, freqmin, freqmax)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
