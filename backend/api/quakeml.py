"""
Importación de catálogos QuakeML del Servicio Geológico Colombiano (RF-16).

Recibe un archivo QuakeML (.xml) vía multipart, lo parsea con ObsPy
(``obspy.read_events``) y devuelve una lista de eventos normalizados con
el mismo esquema de la tabla ``seismic_events`` de Supabase. El frontend
(panel de administración) decide luego cuáles insertar.

No escribe en la base de datos: la inserción la hace el cliente con la
sesión del administrador, de modo que las policies RLS siguen aplicando.
"""
from __future__ import annotations

import io
from typing import Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

router = APIRouter(tags=["Importación"])

MAX_BYTES = 20 * 1024 * 1024  # 20 MB


class ImportedEvent(BaseModel):
    """Evento sísmico extraído de un catálogo QuakeML."""

    event_date: str = Field(description="Fecha UTC (YYYY-MM-DD)")
    event_time: str = Field(description="Hora UTC (HH:MM:SS)")
    magnitude: float = Field(description="Magnitud preferida")
    magnitude_type: str | None = Field(default=None, description="Tipo de magnitud (Mw, ML, ...)")
    depth_km: float = Field(description="Profundidad focal en km")
    latitude: float
    longitude: float
    location_name: str = Field(description="Descripción o región del evento")
    event_type: Literal["tectonic", "volcanic"] = "tectonic"
    source: str = Field(default="SGC", description="Agencia de origen")
    notes: str = Field(default="", description="Identificador público del catálogo")


class ImportResponse(BaseModel):
    """Respuesta de la importación QuakeML."""

    total_en_archivo: int
    importados: int
    descartados: int
    eventos: list[ImportedEvent]


VOLCANIC_TYPES = {
    "volcanic eruption",
    "volcanic",
    "long period",
    "long-period",
    "tremor",
    "tornillo",
}


def _classify(event) -> Literal["tectonic", "volcanic"]:
    """Clasifica el evento a partir de ``event_type`` o su descripción."""
    et = (event.event_type or "").lower()
    if et in VOLCANIC_TYPES:
        return "volcanic"
    for d in event.event_descriptions or []:
        txt = (d.text or "").lower()
        if any(k in txt for k in ("galeras", "cumbal", "volc", "azufral", "doña juana", "dona juana")):
            return "volcanic"
    return "tectonic"


def _describe(event) -> str:
    for d in event.event_descriptions or []:
        if d.text:
            return d.text.strip()
    return "Sin descripción"


def parse_quakeml_bytes(data: bytes) -> ImportResponse:
    """Parsea un QuakeML en memoria y devuelve eventos normalizados.

    Args:
        data: Contenido del archivo .xml.

    Returns:
        ImportResponse con los eventos válidos (con origen y magnitud).

    Raises:
        ValueError: si el archivo no es un QuakeML legible por ObsPy.
    """
    from obspy import read_events  # import diferido: ObsPy es pesado

    try:
        catalog = read_events(io.BytesIO(data), format="QUAKEML")
    except Exception as exc:  # pragma: no cover - depende del archivo
        raise ValueError(f"No se pudo leer el archivo como QuakeML: {exc}") from exc

    eventos: list[ImportedEvent] = []
    descartados = 0
    for ev in catalog:
        origin = ev.preferred_origin() or (ev.origins[0] if ev.origins else None)
        mag = ev.preferred_magnitude() or (ev.magnitudes[0] if ev.magnitudes else None)
        if origin is None or mag is None or origin.time is None:
            descartados += 1
            continue
        if origin.latitude is None or origin.longitude is None:
            descartados += 1
            continue
        depth_m = origin.depth if origin.depth is not None else 0.0
        agency = "SGC"
        if origin.creation_info and origin.creation_info.agency_id:
            agency = origin.creation_info.agency_id
        public_id = str(ev.resource_id) if ev.resource_id else ""
        eventos.append(
            ImportedEvent(
                event_date=origin.time.strftime("%Y-%m-%d"),
                event_time=origin.time.strftime("%H:%M:%S"),
                magnitude=round(float(mag.mag), 2),
                magnitude_type=mag.magnitude_type,
                depth_km=round(float(depth_m) / 1000.0, 2),
                latitude=round(float(origin.latitude), 6),
                longitude=round(float(origin.longitude), 6),
                location_name=_describe(ev),
                event_type=_classify(ev),
                source=agency,
                notes=public_id,
            )
        )

    return ImportResponse(
        total_en_archivo=len(catalog),
        importados=len(eventos),
        descartados=descartados,
        eventos=eventos,
    )


@router.post(
    "/api/import/quakeml",
    response_model=ImportResponse,
    summary="Parsear un catálogo QuakeML del SGC",
)
async def import_quakeml(file: UploadFile = File(..., description="Archivo QuakeML (.xml)")):
    """Extrae eventos de un archivo QuakeML usando ObsPy.

    Args:
        file: Archivo .xml en formato QuakeML 1.2.

    Returns:
        ImportResponse: eventos normalizados listos para insertar en
        ``seismic_events``.

    Raises:
        HTTPException 400: archivo vacío, demasiado grande o no parseable.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera los 20 MB.")
    try:
        return parse_quakeml_bytes(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
