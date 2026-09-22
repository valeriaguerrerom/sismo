"""
Compatibilidad — Motor FDM 2D.

El motor FDM ahora vive en `core/fdm.py`. Este módulo se mantiene como
capa de compatibilidad para el código existente que importa desde
`simulation` (por ejemplo `main.py` y los tests previos).

Uso recomendado en código nuevo:
    from core.fdm import run_fdm, SimulationParams, SimulationResult
"""
from core.fdm import (  # noqa: F401
    SimulationParams,
    SimulationResult,
    GridInfo,
    WaveData,
    compute_lame,
    ricker,
    detect_arrival,
    run_fdm,
)
