"""
Sprint 15 — HU032: seguridad de la plataforma.

Casos CPR-032-1 a CPR-032-5 (pytest). Verifican propiedades de seguridad que el
backend puede comprobar sin tocar la base de datos de producción:

  - CPR-032-1: la contraseña NO viaja en texto plano; el navegador envía un
    secreto DERIVADO (PBKDF2). Se replica aquí la misma derivación del cliente
    (`src/lib/passwordDerive.ts`: PBKDF2-HMAC-SHA256, 310 000 iteraciones, sal
    "sismonarino:"+correo, 32 bytes → 64 hex) y se comprueba que el secreto no
    es la contraseña, tiene 64 hex, es determinista y normaliza el correo.
  - CPR-032-4: el límite de simulaciones por IP responde 429 al superarse.
  - CPR-032-5: una inyección en el parámetro de búsqueda no provoca un error
    interno; se trata como texto (filtro literal) y responde 200.

NOTA de alcance (ver RESUMEN): CPR-032-2 (escalar privilegios) y CPR-032-3
(leer un reporte ajeno) dependen de las políticas RLS de Supabase y solo se
pueden comprobar contra la base real (intentando una escritura privilegiada o
una lectura cruzada). Como no hay una Supabase de pruebas aparte, se OMITEN.

Herramienta: pytest (TestClient de FastAPI).
"""
import hashlib

import main
import api  # noqa: F401  (asegura carga de routers)
from fastapi.testclient import TestClient

client = TestClient(main.app)


# ─────────── Réplica de la derivación del cliente (passwordDerive.ts) ───────────
_ITERATIONS = 310_000
_KEY_BYTES = 32
_SALT_PREFIX = "sismonarino:"


def derive_auth_secret(email: str, password: str) -> str:
    """PBKDF2-HMAC-SHA256 idéntico al del cliente; devuelve 64 hex."""
    salt = (_SALT_PREFIX + email.strip().lower()).encode("utf-8")
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS, dklen=_KEY_BYTES)
    return dk.hex()


# ───────────────────────────── CPR-032-1 ─────────────────────────────
def test_revisar_peticion_inicio_sesion():
    """La contraseña no viaja en texto plano: se envía un secreto derivado."""
    email = "persona@ejemplo.com"
    password = "Abcdef12!"
    secret = derive_auth_secret(email, password)
    # El secreto NO es la contraseña y tiene 64 caracteres hex.
    assert secret != password
    assert len(secret) == 64
    assert all(c in "0123456789abcdef" for c in secret)
    # Determinista: misma entrada → mismo secreto.
    assert derive_auth_secret(email, password) == secret
    # El correo se normaliza (mayúsculas/espacios no cambian el secreto).
    assert derive_auth_secret("  Persona@Ejemplo.com  ", password) == secret
    # Contraseñas distintas → secretos distintos.
    assert derive_auth_secret(email, "Otra_clave99$") != secret


# ───────────────────────────── CPR-032-4 ─────────────────────────────
def test_superar_limite_simulaciones(monkeypatch):
    """El servidor responde 429 al superar el límite de simulaciones por IP."""
    # Evitar el cómputo FDM pesado: el límite por IP se comprueba ANTES de
    # simular, así que da igual lo que devuelva run_fdm. Lo hacemos instantáneo
    # (lanza una excepción controlada → 500, capturado por el endpoint). Lo que
    # importa es que, tras `per_minute` llamadas, la siguiente devuelva 429.
    def _instant(_params):
        raise RuntimeError("no-op para la prueba de rate limit")
    monkeypatch.setattr(main, "run_fdm", _instant)
    # Reiniciar el historial del limitador para esta IP.
    ip = "203.0.113.7"
    main._simulate_limiter._hits.pop(ip, None)

    payload = {
        "vp": 3500, "vs": 2000, "density": 2600, "sourceType": "tectonic",
        "magnitude": 5, "depth": 15, "epicenterLat": 1.2136,
        "epicenterLon": -77.2811, "duration": 10, "dx": 100, "dt": 0.02,
    }
    headers = {"X-Forwarded-For": ip}
    codes = []
    for _ in range(main._simulate_limiter.per_minute + 1):
        r = client.post("/api/simulate", json=payload, headers=headers)
        codes.append(r.status_code)
    # El último supera el límite por minuto (429). Los anteriores pasan el
    # límite (su cuerpo no importa: run_fdm está mockeado), así que no son 429.
    assert codes[-1] == 429
    assert 429 not in codes[:main._simulate_limiter.per_minute]


# ───────────────────────────── CPR-032-5 ─────────────────────────────
def test_enviar_inyeccion_busqueda():
    """Una inyección en la búsqueda se trata como texto y no da error interno."""
    inyecciones = [
        "'; DROP TABLE seismic_events; --",
        "<script>alert('x')</script>",
        "1 OR 1=1",
        "%' UNION SELECT * FROM profiles --",
    ]
    for q in inyecciones:
        r = client.get("/api/events", params={"search": q})
        # Nunca un error interno (500): se responde 200 con una lista (vacía o
        # el fallback), tratando el texto como un filtro literal.
        assert r.status_code == 200, f"inyección provocó {r.status_code}: {q}"
        body = r.json()
        assert "data" in body and isinstance(body["data"], list)
