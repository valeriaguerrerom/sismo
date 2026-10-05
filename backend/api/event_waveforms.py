"""
Obtención de waveforms reales asociados a eventos del catálogo.

Endpoint:
    GET /api/events/{event_id}/waveforms

Busca datos reales MiniSEED procesados (JSON) para un evento específico del
catálogo. Los datos pueden venir de:
  - Galeras 2006: public/data/galeras/{id}.json
  - Red CM: public/data/cm/{id}.json
  - Usuario: archivos subidos y guardados (futuro)

Si el evento tiene `mseed_available=true` y `mseed_file_path`, se sirve el JSON
procesado. Si no, se retorna 404 indicando que no hay datos reales disponibles.

Este endpoint UNIFICA el flujo de carga de datos reales entre Explorer y Map3D,
eliminando la duplicación de código en el frontend.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.config import supabase

router = APIRouter(tags=["Datos Sísmicos"])

# Ruta base donde viven los archivos JSON procesados (relativa al backend)
_PUBLIC_DIR = Path(__file__).resolve().parent.parent.parent / "public"


class WaveData(BaseModel):
    """Serie temporal triaxial de un registro sísmico real."""
    time: list[float] = Field(description="Tiempo en segundos desde el inicio")
    north: list[float] = Field(description="Componente Norte normalizada [-1, 1]")
    east: list[float] = Field(description="Componente Este normalizada [-1, 1]")
    vertical: list[float] = Field(description="Componente Vertical normalizada [-1, 1]")


class EventWaveformResponse(BaseModel):
    """Datos reales MiniSEED de un evento del catálogo."""
    event_id: str = Field(description="UUID del evento en seismic_events")
    event_label: str = Field(description="Etiqueta descriptiva del evento")
    station: str = Field(description="Código de estación (ej: CUFP, BBAC, etc.)")
    network: str | None = Field(default=None, description="Red sismológica (CM, CM2, etc.)")
    source: str = Field(description="Origen: 'galeras', 'cm', 'user'")
    
    # Metadatos temporales
    date: str = Field(description="Fecha del evento (YYYY-MM-DD)")
    time: str | None = Field(default=None, description="Hora del evento (HH:MM:SS)")
    
    # Metadatos del procesamiento
    sampling_rate: float | None = Field(default=None, description="Frecuencia de muestreo original (Hz)")
    duration: float = Field(description="Duración del registro en segundos")
    num_samples: int = Field(description="Número de puntos en el registro")
    
    # Información del evento (del catálogo)
    magnitude: float | None = Field(default=None)
    depth_km: float | None = Field(default=None)
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    event_type: str | None = Field(default=None, description="'tectonic' | 'volcanic'")
    volcanic_subtype: str | None = Field(default=None, description="LP/TO/TR/VA/HB para volcánicos")
    
    # Series temporales
    waveData: WaveData


def _load_json_waveform(file_path: Path) -> dict[str, Any]:
    """Carga un JSON procesado de waveform desde disco.
    
    Raises:
        FileNotFoundError: si el archivo no existe.
        ValueError: si el JSON está corrupto o no tiene waveData.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"Archivo no encontrado: {file_path}")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON corrupto: {e}") from e
    
    if "waveData" not in data:
        raise ValueError("El archivo JSON no contiene 'waveData'")
    
    return data


@router.get(
    "/api/events/{event_id}/waveforms",
    response_model=EventWaveformResponse,
    summary="Obtener waveforms reales de un evento del catálogo",
)
async def get_event_waveforms(event_id: str):
    """Devuelve los datos reales MiniSEED de un evento si están disponibles.
    
    Args:
        event_id: UUID del evento en la tabla seismic_events.
    
    Returns:
        EventWaveformResponse con waveData triaxial y metadatos.
    
    Raises:
        HTTPException 404: El evento no existe, o no tiene datos reales.
        HTTPException 500: Error leyendo el archivo (JSON corrupto, permisos, etc.).
        HTTPException 503: Base de datos no disponible.
    """
    # 1. Consultar el evento en seismic_events para obtener mseed_file_path
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible. Los datos reales requieren conexión a Supabase.",
        )
    
    try:
        response = supabase.table("seismic_events").select("*").eq("event_id", event_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando evento: {e}") from e
    
    if not response.data or len(response.data) == 0:
        raise HTTPException(status_code=404, detail=f"Evento {event_id} no encontrado en el catálogo.")
    
    event = response.data[0]
    
    # 2. Verificar que el evento tenga datos reales asociados
    # Si las columnas nuevas no existen (migración pendiente), asumimos que no hay datos
    mseed_available = event.get("mseed_available", False)
    if not mseed_available:
        raise HTTPException(
            status_code=404,
            detail=f"El evento {event_id} no tiene datos reales MiniSEED disponibles. "
                   "Solo eventos del Galeras (2006) y de la red CM tienen datos procesados.",
        )
    
    mseed_file_path = event.get("mseed_file_path")
    if not mseed_file_path:
        raise HTTPException(
            status_code=404,
            detail=f"El evento {event_id} tiene mseed_available=true pero no tiene mseed_file_path configurado.",
        )
    
    # 3. Cargar el JSON procesado desde public/
    file_full_path = _PUBLIC_DIR / mseed_file_path
    
    try:
        data = _load_json_waveform(file_full_path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Archivo de datos no encontrado: {mseed_file_path}. "
                   "El archivo puede haber sido movido o eliminado.",
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo datos: {e}")
    
    # 4. Construir la respuesta con metadatos del evento + waveData del JSON
    source = event.get("mseed_data_source", "unknown")
    station = event.get("mseed_station") or data.get("station", "unknown")
    network = data.get("network")
    
    # Metadatos temporales
    event_date = str(event.get("event_date", ""))
    event_time = str(event.get("event_time", "")) if event.get("event_time") else None
    
    # Label descriptivo
    event_type = event.get("event_type", "tectonic")
    if event_type == "volcanic":
        subtype = event.get("volcanic_subtype", "")
        subtype_labels = {
            "lp": "Long Period (LP)",
            "to": "Tornillo (TO)",
            "tr": "Tremor (TR)",
            "va": "Volcano-Tectónico (VA)",
            "hb": "Hybrid (HB)",
        }
        subtype_text = subtype_labels.get(subtype.lower(), subtype.upper()) if subtype else ""
        event_label = f"Galeras · {subtype_text} · {event_date}".replace("·  ·", "·").strip()
    else:
        mag = event.get("magnitude")
        region = event.get("region", "")
        event_label = f"M{mag} · {event_date} · {region}".strip()
    
    # WaveData del JSON
    wave_data_raw = data["waveData"]
    wave_data = WaveData(
        time=wave_data_raw["time"],
        north=wave_data_raw["north"],
        east=wave_data_raw["east"],
        vertical=wave_data_raw["vertical"],
    )
    
    # Duración y muestras
    duration = wave_data.time[-1] if wave_data.time else 0.0
    num_samples = len(wave_data.time)
    
    # Sampling rate (si está en el JSON, si no se estima de time)
    sampling_rate = data.get("samplingRate")
    if not sampling_rate and num_samples > 1:
        dt = wave_data.time[1] - wave_data.time[0] if wave_data.time[1] > wave_data.time[0] else 0.01
        sampling_rate = 1.0 / dt if dt > 0 else None
    
    return EventWaveformResponse(
        event_id=event_id,
        event_label=event_label,
        station=station,
        network=network,
        source=source,
        date=event_date,
        time=event_time,
        sampling_rate=sampling_rate,
        duration=round(duration, 3),
        num_samples=num_samples,
        magnitude=event.get("magnitude"),
        depth_km=event.get("depth_km"),
        latitude=event.get("latitude"),
        longitude=event.get("longitude"),
        event_type=event_type,
        volcanic_subtype=event.get("volcanic_subtype"),
        waveData=wave_data,
    )
