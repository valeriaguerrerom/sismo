"""
Router de síntesis de sismogramas (FDM 2D) para el Mapa 3D.

Endpoint:
    POST /api/synthetic — ejecuta el FDM 2D con receptor a una distancia dada
    y devuelve el sismograma triaxial más las llegadas P/S y métricas.

Reutiliza core.fdm.run_fdm_synthetic (misma física que el motor del frontend).
"""
from fastapi import APIRouter, HTTPException

from core.fdm import SyntheticParams, SyntheticResult, run_fdm_synthetic

router = APIRouter(tags=["Mapa 3D"])


@router.post("/api/synthetic", response_model=SyntheticResult,
             summary="Sismograma sintético FDM 2D a una distancia dada")
def synthetic(params: SyntheticParams):
    """Genera un sismograma sintético con el FDM 2D.

    Coloca la fuente al centro del dominio y un receptor en superficie a
    `distance_km` de ella. Resuelve la ecuación de onda elástica 2D con la
    misma física del motor del frontend (Ricker doble-par/isótropa, superficie
    libre, sponge, CFL) y devuelve las tres componentes N/E/Z.

    Args:
        params: Velocidades, densidad, magnitud, profundidad, tipo de fuente,
            distancia del receptor y malla (nx, nz, dt_max_s).

    Returns:
        SyntheticResult con t, north, east, vertical, tP/tS y tiempo de cómputo.

    Raises:
        HTTPException(500): Si ocurre un error durante la simulación.
    """
    try:
        return run_fdm_synthetic(params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en síntesis FDM: {e}")
