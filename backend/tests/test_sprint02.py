"""Sprint 2 — HU007: Generar una simulación FDM y ver el pseudo-sismograma.

Casos CPR-007-1 a CPR-007-6 (pytest). Verifican el contrato del servicio de
simulación: ejecuta diferencias finitas y devuelve el pseudo-sismograma
triaxial, ajusta dt por estabilidad (CFL) e informa, entrega las métricas,
acota la duración por el rebote de borde, y maneja los errores con mensajes en
español sin tumbar el servicio.

Herramienta: pytest. Entorno: TestClient de FastAPI + motor run_fdm directo.
"""
import pytest
from fastapi.testclient import TestClient

import main
from core.fdm import SimulationParams, run_fdm, compute_lame

client = TestClient(main.app)


def _payload(**kw):
    """Parámetros por defecto equivalentes a los del Simulador (Pasto)."""
    p = {
        "vp": 3500, "vs": 2000, "density": 2600, "sourceType": "tectonic",
        "magnitude": 5.0, "depth": 15, "epicenterLat": 1.2136,
        "epicenterLon": -77.2811, "duration": 10, "dx": 100, "dt": 0.02,
    }
    p.update(kw)
    return p


# ── CPR-007-1 ──
def test_generar_simulacion_valores_defecto():
    """Envía los parámetros, ejecuta el FDM y devuelve el pseudo-sismograma
    triaxial (tres componentes N, E, Z con la misma longitud y señal real)."""
    r = client.post("/api/simulate", json=_payload())
    assert r.status_code == 200, r.text
    data = r.json()
    wave = data["waveData"]
    # Tres componentes presentes y del mismo largo que el eje de tiempo.
    assert len(wave["time"]) > 0
    assert len(wave["north"]) == len(wave["time"])
    assert len(wave["east"]) == len(wave["time"])
    assert len(wave["vertical"]) == len(wave["time"])
    # Hay señal (no es una traza plana).
    assert data["maxAmplitude"] > 0


# ── CPR-007-2 ──
def test_observar_interfaz_mientras_calcula():
    """El cálculo es una única petición síncrona: mientras el servidor procesa,
    la interfaz deshabilita el botón y muestra progreso, y solo responde cuando
    el resultado está completo. Se verifica el contrato: una respuesta 200 con
    el resultado íntegro (la señal del "procesando" vive en que la respuesta no
    llega hasta tener todos los campos)."""
    r = client.post("/api/simulate", json=_payload())
    assert r.status_code == 200, r.text
    data = r.json()
    # El resultado llega COMPLETO en una sola respuesta (no por partes): la UI
    # puede quitar el "procesando" y habilitar el botón solo al recibir esto.
    for campo in ("waveData", "maxAmplitude", "duration", "dominantFrequency",
                  "gridInfo", "pArrival", "sArrival"):
        assert campo in data, f"falta {campo} en el resultado"


# ── CPR-007-3 ──
def test_solicitar_paso_tiempo_inestable():
    """Si se pide un dt que viola la condición CFL, el servidor lo reduce
    automáticamente y lo informa en los datos de la malla (dtAdjusted=True y el
    dt devuelto es menor al solicitado)."""
    dt_pedido = 0.2  # groseramente inestable para Vp alto / dx dado
    r = client.post("/api/simulate", json=_payload(dt=dt_pedido))
    assert r.status_code == 200, r.text
    grid = r.json()["gridInfo"]
    assert grid["dtAdjusted"] is True, "no marcó el ajuste de dt"
    assert grid["dt"] < dt_pedido, "el dt devuelto no se redujo"


# ── CPR-007-4 ──
def test_consultar_metricas_terminar():
    """Al terminar, el resultado trae las métricas: amplitud máxima, duración,
    frecuencia dominante, arribos P y S, y datos de la malla (Vp/Vs vienen en
    params; los fotogramas en snapshotCount)."""
    r = client.post("/api/simulate", json=_payload())
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["maxAmplitude"] > 0
    assert d["duration"] > 0
    assert d["dominantFrequency"] > 0
    assert d["pArrival"] > 0
    assert d["sArrival"] > d["pArrival"], "S debe llegar después de P"
    assert d["params"]["vp"] > d["params"]["vs"], "Vp/Vs en los parámetros"
    assert d["snapshotCount"] >= 0  # número de fotogramas del campo


# ── CPR-007-5 ──
def test_pedir_duracion_mayor_limite_malla():
    """Si se pide una duración muy larga, el backend la acota al primer rebote
    de borde (durationCappedByBounce=True) para no mostrar reflexiones
    artificiales de los bordes de la malla, y la duración devuelta es menor a la
    solicitada."""
    r = client.post("/api/simulate", json=_payload(duration=60))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["gridInfo"]["durationCappedByBounce"] is True, "no acotó la duración"
    assert d["duration"] < 60, "no redujo la duración pedida"
    # El rebote de borde queda al final de la ventana devuelta (coherencia).
    assert d["gridInfo"]["firstBounceP"] > 0


# ── CPR-007-6 ──
def test_generar_simulacion_servidor_detenido():
    """Si la petición es inválida (simula una condición de error del servicio),
    el servidor responde con un mensaje claro en español y NO se cae: sigue
    atendiendo peticiones después (la página sigue disponible)."""
    # Parámetros físicamente imposibles (Vs ~ Vp): el servicio debe rechazar
    # con 422 y un mensaje en español, sin un 500 ni caerse.
    r = client.post("/api/simulate", json=_payload(vp=3000, vs=2950))
    assert r.status_code == 422, r.text
    detalle = str(r.json().get("detail", ""))
    # Mensaje en español, no un stack trace genérico.
    assert any(t in detalle for t in ("Par", "Vs", "λ", "Lam")), detalle
    # El servicio sigue vivo: una petición válida posterior responde 200.
    r2 = client.post("/api/simulate", json=_payload())
    assert r2.status_code == 200, "el servicio dejó de responder tras el error"
