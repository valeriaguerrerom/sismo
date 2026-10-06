"""
Límite de peticiones por IP (rate limiting) en memoria del proceso.
===================================================================

Protege los endpoints costosos (simulación FDM, procesamiento de MiniSEED)
contra abuso y denegación de servicio por volumen de peticiones. El estado se
guarda en memoria del proceso: suficiente para un despliegue de un solo worker
(el caso de Railway). Para varios workers o réplicas haría falta un backend
compartido (Redis), pero eso excede el alcance actual.

Uso:
    limiter = RateLimiter(per_minute=30, per_hour=200)
    ...
    def endpoint(request: Request):
        limiter.check(client_ip(request))

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request

# Número de proxies de CONFIANZA delante del backend. En Railway es 1 (su edge
# proxy). Este valor determina cuántas entradas del final de X-Forwarded-For
# fueron puestas por infraestructura que controlamos (no por el cliente).
# Configurable por si cambia la topología (p. ej. un CDN extra delante).
_TRUSTED_PROXY_HOPS = int(os.getenv("TRUSTED_PROXY_HOPS", "1"))


def client_ip(request: Request) -> str:
    """IP real del cliente a prueba de falsificación (anti-spoofing).

    PROBLEMA: el cliente puede enviar un ``X-Forwarded-For`` falso para saltarse
    el rate limit. El proxy de Railway NO borra lo que mande el cliente: AÑADE
    la IP real del cliente al FINAL de la cadena. Por eso el PRIMER valor es
    controlable por el atacante y el valor confiable es el que agrega el proxy,
    contando desde la derecha.

        Cliente envía:   X-Forwarded-For: 9.9.9.9 (falso)
        Railway reescribe: X-Forwarded-For: 9.9.9.9, <IP-real-del-cliente>
                                            ^falso     ^confiable (edge Railway)

    Con ``_TRUSTED_PROXY_HOPS = 1`` (Railway) se toma el ÚLTIMO valor de la
    lista: la IP que insertó el edge de Railway. Nunca el primero (spoofeable).
    Si hubiera N proxies de confianza, se tomaría el N-ésimo desde el final.

    Respaldo: ``X-Real-IP`` (que Railway también sobrescribe con la IP real) y,
    por último, la IP de la conexión TCP. Devuelve "unknown" si nada aplica.

    Referencias:
        - Railway añade la IP real al final de XFF, sin strippear lo del cliente.
        - Guía de seguridad de XFF: usar el valor rightmost tras N hops de confianza.
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        parts = [p.strip() for p in fwd.split(",") if p.strip()]
        if parts:
            # Índice desde la derecha según los hops de confianza. Con 1 hop
            # (Railway) es el último elemento. Se acota para no salir del rango
            # si el cliente mandó MENOS entradas de las esperadas.
            idx = len(parts) - _TRUSTED_PROXY_HOPS
            if idx < 0:
                idx = 0
            return parts[idx]
    # Respaldo: X-Real-IP (Railway lo sobrescribe con la IP real del cliente).
    real = request.headers.get("x-real-ip")
    if real and real.strip():
        return real.strip()
    # Último recurso: IP de la conexión TCP (en local, sin proxy).
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """Limitador por IP con ventanas deslizantes de un minuto y una hora."""

    def __init__(self, per_minute: int, per_hour: int, mensaje: str | None = None) -> None:
        """Crea un limitador.

        Args:
            per_minute: Máximo de peticiones permitidas por IP en 60 s.
            per_hour: Máximo de peticiones permitidas por IP en 3600 s.
            mensaje: Mensaje opcional para el error 429.
        """
        self.per_minute = per_minute
        self.per_hour = per_hour
        self.mensaje = mensaje or "Demasiadas peticiones. Espera un momento e inténtalo de nuevo."
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, ip: str) -> None:
        """Registra una petición de ``ip`` y lanza 429 si supera algún límite.

        Args:
            ip: IP del cliente.

        Raises:
            HTTPException(429): si se superó el límite por minuto o por hora.
        """
        now = time.time()
        minute_ago = now - 60
        hour_ago = now - 3600
        with self._lock:
            hits = self._hits[ip]
            # Descartar timestamps de hace más de una hora.
            while hits and hits[0] < hour_ago:
                hits.popleft()
            last_minute = sum(1 for t in hits if t >= minute_ago)
            if last_minute >= self.per_minute or len(hits) >= self.per_hour:
                raise HTTPException(status_code=429, detail=self.mensaje)
            hits.append(now)
