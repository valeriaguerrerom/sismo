"""
Obtención de waveforms reales asociados a eventos del catálogo.

Endpoints:
    GET /api/events/{event_id}/waveforms?source=galeras|cm&station=CUFP

Busca datos reales MiniSEED procesados (JSON) para un evento específico del
catálogo. Los datos pueden venir de:
  - Galeras 2006: public/data/galeras/{event_id}.json
  - Red CM: public/data/cm/{event_id}/{station}.json

El endpoint NO requiere Supabase: la ruta se construye desde los parámetros
enviados por el frontend (que sí tiene los metadatos del evento).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(tags=["Datos Sísmicos"])

# Ruta base donde viven los archivos JSON procesados
_PUBLIC_DIR = Path(__file__).resolve().parent.parent.parent / "public"


class WaveDataModel(BaseModel):
    """Serie temporal triaxial de un registro sísmico real."""
    time: list[float] = Field(description="Tiempo en segundos desde el inicio")
    north: list[float] = Field(description="Componente Norte normalizada [-1, 1]")
    east: list[float] = Field(description="Componente Este normalizada [-1, 1]")
    vertical: list[float] = Field(description="Componente Vertical normalizada [-1, 1]")


class EventWaveformResponse(BaseModel):
    """Datos reales MiniSEED de un evento del catálogo."""
    event_id: str
    station: str
    source: str
    duration: float
    num_samples: int
    sampling_rate: float | None = None
    waveData: WaveDataModel


def _load_galeras(event_id: str) -> dict:
    """Carga el JSON de un evento Galeras desde public/data/galeras/{event_id}.json"""
    path = _PUBLIC_DIR / "data" / "galeras" / f"{event_id}.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Archivo Galeras no encontrado: data/galeras/{event_id}.json",
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_cm(event_id: str, station: str) -> dict:
    """Carga el JSON de una estación CM desde public/data/cm/{event_id}/{station}.json"""
    path = _PUBLIC_DIR / "data" / "cm" / event_id / f"{station}.json"
    if not path.exists():
        # Intentar con la primera estación disponible en la carpeta
        folder = _PUBLIC_DIR / "data" / "cm" / event_id
        if folder.exists():
            jsons = sorted(folder.glob("*.json"))
            if jsons:
                with open(jsons[0], "r", encoding="utf-8") as f:
                    data = json.load(f)
                data["_station_used"] = jsons[0].stem
                return data
        raise HTTPException(
            status_code=404,
            detail=f"Archivo CM no encontrado: data/cm/{event_id}/{station}.json",
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get(
    "/api/events/{event_id}/waveforms",
    response_model=EventWaveformResponse,
    summary="Obtener waveforms reales de un evento del catálogo",
)
async def get_event_waveforms(
    event_id: str,
    source: str = Query(..., description="Origen de datos: 'galeras' o 'cm'"),
    station: str = Query(default="BBAC", description="Código de estación"),
):
    """Devuelve los datos reales MiniSEED de un evento sin requerir Supabase.

    Args:
        event_id: ID del evento (ej: '0602081159GVA' para Galeras,
                  'CM_M2.5_2023-01-09T00-24-00' para CM).
        source: Origen de los datos ('galeras' o 'cm').
        station: Código de estación a cargar (solo aplica para CM).

    Returns:
        EventWaveformResponse con waveData triaxial y metadatos.

    Raises:
        HTTPException 404: El archivo de datos no existe.
        HTTPException 400: source inválido.
    """
    if source == "galeras":
        data = _load_galeras(event_id)
        station_code = data.get("station", "CUFP")
    elif source == "cm":
        data = _load_cm(event_id, station)
        station_code = data.get("_station_used", station)
    else:
        raise HTTPException(status_code=400, detail=f"source inválido: '{source}'. Use 'galeras' o 'cm'.")

    # Extraer waveData del JSON
    wave_raw = data.get("waveData")
    if not wave_raw:
        raise HTTPException(status_code=500, detail="El archivo JSON no contiene 'waveData'.")

    time_arr = wave_raw.get("time", [])
    north_arr = wave_raw.get("north", [])
    east_arr = wave_raw.get("east", [])
    vertical_arr = wave_raw.get("vertical", [])

    if not time_arr:
        raise HTTPException(status_code=500, detail="El campo 'time' está vacío en waveData.")

    duration = float(time_arr[-1]) if time_arr else 0.0
    num_samples = len(time_arr)
    sampling_rate = data.get("samplingRate") or data.get("sampling_rate")
    if not sampling_rate and num_samples > 1:
        dt = time_arr[1] - time_arr[0]
        sampling_rate = round(1.0 / dt, 2) if dt > 0 else None

    return EventWaveformResponse(
        event_id=event_id,
        station=station_code,
        source=source,
        duration=round(duration, 3),
        num_samples=num_samples,
        sampling_rate=sampling_rate,
        waveData=WaveDataModel(
            time=time_arr,
            north=north_arr,
            east=east_arr,
            vertical=vertical_arr,
        ),
    )
