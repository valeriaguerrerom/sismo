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

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request


def client_ip(request: Request) -> str:
    """IP real del cliente, respetando el proxy (Railway/Nginx).

    Detrás de un proxy inverso (Railway) la IP de la conexión TCP
    (``request.client.host``) es la del proxy, igual para TODOS los clientes.
    Para distinguir usuarios se usa ``X-Forwarded-For``, cuyo PRIMER valor es la
    IP del cliente original (el proxy añade su propia IP al final):
        X-Forwarded-For: <ip-cliente>, <ip-proxy-1>, <ip-proxy-2>
    Se toma el primer valor. Si el encabezado no viene, se cae a la IP de la
    conexión. Como respaldo adicional (p. ej. clientes móviles tras CGNAT que
    comparten IP), se combina con el User-Agent para no agrupar a usuarios muy
    distintos bajo una misma IP aparente.

    Args:
        request: La petición entrante.

    Returns:
        La IP del cliente como texto, o "unknown" si no se puede determinar.
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        ip = fwd.split(",")[0].strip()
        if ip:
            return ip
    # Algunos proxies usan X-Real-IP en vez de X-Forwarded-For.
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
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
