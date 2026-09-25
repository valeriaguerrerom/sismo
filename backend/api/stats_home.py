"""
Router de estadísticas del Home.

Endpoint:
    GET /api/stats/home — cifras reales para la página de inicio.

Fuente de verdad: la tabla `seismic_events` de Supabase (misma que usan el
Explorer y el Mapa 3D tras la carga del catálogo). Si Supabase no responde o
la tabla está vacía, cae a los índices JSON de public/data como respaldo.
Calcula total de eventos, rango de años y magnitud máxima observada.
"""
import json
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Datos Sísmicos"])

# public/data está en la raíz del proyecto, un nivel arriba de backend/.
PUBLIC_DATA = Path(__file__).resolve().parent.parent.parent / "public" / "data"


class HomeStats(BaseModel):
    """Estadísticas reales para el Home.

    Attributes:
        total_eventos: Número total de eventos (CM + Galeras).
        anio_min: Año del evento más antiguo.
        anio_max: Año del evento más reciente.
        anios_registro: Cantidad de años cubiertos (anio_max - anio_min + 1).
        magnitud_maxima: Mayor magnitud observada en los datos (o None si ninguno la trae).
        magnitud_minima: Menor magnitud observada (para la escala del mini gráfico).
        eventos_cm: Conteo de eventos de la red CM (tectónicos).
        eventos_galeras: Conteo de eventos del Volcán Galeras (volcánicos).
        anio_cm_min: Año más antiguo de la red CM (inicio del tramo reciente).
        anio_cm_max: Año más reciente de la red CM.
    """
    total_eventos: int
    anio_min: int | None
    anio_max: int | None
    anios_registro: int | None
    magnitud_maxima: float | None
    magnitud_minima: float | None
    eventos_cm: int
    eventos_galeras: int
    anio_cm_min: int | None
    anio_cm_max: int | None


def _load_index(path: Path) -> list[dict]:
    """Carga el arreglo 'events' de un index.json, o [] si no existe."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("events", [])
    except Exception:
        return []


def _year_of(ev: dict) -> int | None:
    """Extrae el año de un evento (campo 'date' en CM o 'event_date' en Galeras)."""
    raw = ev.get("date") or ev.get("event_date") or ""
    # Formato ISO 'YYYY-MM-DD'
    if len(raw) >= 4 and raw[:4].isdigit():
        return int(raw[:4])
    return None


def _stats_from_supabase() -> HomeStats | None:
    """Calcula las cifras leyendo la tabla seismic_events de Supabase.

    Returns:
        HomeStats si Supabase responde con eventos; None si no hay cliente,
        la tabla está vacía o falla (para caer al fallback JSON).
    """
    import main  # import diferido para evitar ciclos y usar el cliente ya inicializado
    sb = getattr(main, "supabase", None)
    if sb is None:
        return None
    try:
        resp = sb.table("seismic_events").select(
            "event_date, magnitude, event_type"
        ).execute()
        rows = resp.data or []
        if not rows:
            return None
        years = [int(r["event_date"][:4]) for r in rows
                 if r.get("event_date") and str(r["event_date"])[:4].isdigit()]
        cm_years = [int(r["event_date"][:4]) for r in rows
                    if r.get("event_type") == "tectonic"
                    and r.get("event_date") and str(r["event_date"])[:4].isdigit()]
        mags = [float(r["magnitude"]) for r in rows if r.get("magnitude") is not None]
        anio_min = min(years) if years else None
        anio_max = max(years) if years else None
        return HomeStats(
            total_eventos=len(rows),
            anio_min=anio_min,
            anio_max=anio_max,
            anios_registro=(anio_max - anio_min + 1) if (anio_min and anio_max) else None,
            magnitud_maxima=round(max(mags), 1) if mags else None,
            magnitud_minima=round(min(mags), 1) if mags else None,
            eventos_cm=sum(1 for r in rows if r.get("event_type") == "tectonic"),
            eventos_galeras=sum(1 for r in rows if r.get("event_type") == "volcanic"),
            anio_cm_min=min(cm_years) if cm_years else None,
            anio_cm_max=max(cm_years) if cm_years else None,
        )
    except Exception as e:
        print(f"[stats_home] Supabase falló, usando fallback JSON: {e}")
        return None


def _stats_from_json() -> HomeStats:
    """Calcula las cifras a partir de los índices JSON (fallback)."""
    cm = _load_index(PUBLIC_DATA / "cm" / "index.json")
    galeras = _load_index(PUBLIC_DATA / "galeras" / "index.json")
    all_events = cm + galeras
    years = [y for y in (_year_of(e) for e in all_events) if y is not None]
    cm_years = [y for y in (_year_of(e) for e in cm) if y is not None]
    mags = [float(e["magnitude"]) for e in all_events
            if isinstance(e.get("magnitude"), (int, float))]
    anio_min = min(years) if years else None
    anio_max = max(years) if years else None
    return HomeStats(
        total_eventos=len(all_events),
        anio_min=anio_min,
        anio_max=anio_max,
        anios_registro=(anio_max - anio_min + 1) if (anio_min and anio_max) else None,
        magnitud_maxima=round(max(mags), 1) if mags else None,
        magnitud_minima=round(min(mags), 1) if mags else None,
        eventos_cm=len(cm),
        eventos_galeras=len(galeras),
        anio_cm_min=min(cm_years) if cm_years else None,
        anio_cm_max=max(cm_years) if cm_years else None,
    )


@router.get("/api/stats/home", response_model=HomeStats,
            summary="Cifras reales para la página de inicio")
def stats_home():
    """Calcula las cifras del Home.

    Fuente de verdad: la tabla seismic_events de Supabase (misma que usan el
    Explorer y el Mapa 3D). Si Supabase no está disponible o la tabla aún no
    tiene datos, cae a los índices JSON para no romper el Home.

    Returns:
        HomeStats con total de eventos, rango de años y magnitud máxima.
    """
    return _stats_from_supabase() or _stats_from_json()
