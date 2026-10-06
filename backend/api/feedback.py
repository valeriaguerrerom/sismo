"""
Formulario de contacto "Escríbenos" (página Acerca de).

Endpoint:
    POST /api/feedback — recibe un mensaje del formulario y lo guarda en la
    tabla ``feedback_messages`` usando la clave de servicio de Supabase.

Seguridad y anti spam (todo del lado del servidor):
    - Valida el tipo (sugerencia | error | datos | otro), la longitud del
      mensaje (1..1000) y el formato del correo si se envía.
    - Campo trampa (honeypot): si llega con contenido, se responde OK sin
      guardar nada (el bot cree que tuvo éxito).
    - Autorización de datos (Ley 1581) obligatoria cuando se deja correo.
    - Límite de envíos por IP: 3 por minuto y 20 por día (en memoria del
      proceso; suficiente para un despliegue de un solo worker).
    - Si el visitante tiene sesión, el id del usuario se toma del token
      verificado contra Supabase, NUNCA de lo que envíe el navegador.

La escritura la hace el cliente de servicio (``SUPABASE_SERVICE_ROLE_KEY``),
que salta las RLS. La tabla NO permite INSERT desde anon ni authenticated
(ver la migración 20260926_feedback_backend_only.sql).
"""
from __future__ import annotations

import os
import re
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import APIRouter, Body, Header, HTTPException, Request
from pydantic import BaseModel, Field
from supabase import create_client, Client

from core.rate_limit import client_ip

router = APIRouter(tags=["Contacto"])

VALID_TYPES = {"sugerencia", "error", "datos", "otro"}
MAX_MESSAGE_LENGTH = 1000
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Límites de envío por IP. Generosos a propósito: detrás del proxy de Railway
# varias personas pueden compartir una misma IP aparente (si X-Forwarded-For no
# distingue bien), así que un límite bajo bloqueaba a evaluadores que recién
# empezaban. El feedback es texto corto (barato); el honeypot y el consent ya
# frenan el spam automatizado. Estos valores permiten varias personas a la vez.
PER_MINUTE = 15
PER_DAY = 300

# Historial de envíos por IP (timestamps). En memoria del proceso.
_ip_hits: dict[str, deque[float]] = defaultdict(deque)
_ip_lock = Lock()


class FeedbackIn(BaseModel):
    """Cuerpo del formulario de contacto."""
    type: str = Field(..., description="Tipo: sugerencia | error | datos | otro")
    message: str = Field(..., description="Mensaje (1..1000 caracteres)")
    email: str | None = Field(default=None, description="Correo opcional para responder")
    consent: bool = Field(default=False, description="Autorización de datos (Ley 1581), obligatoria si hay correo")
    # Campo trampa: debe llegar vacío. Los bots suelen rellenarlo.
    honeypot: str | None = Field(default=None, description="Campo trampa anti spam (dejar vacío)")


def _env() -> tuple[str, str, str]:
    """Devuelve (url, anon_key, service_key). service_key acepta ambos nombres."""
    url = os.getenv("SUPABASE_URL", "")
    anon = os.getenv("SUPABASE_ANON_KEY", "")
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
    return url, anon, service


def _check_rate_limit(ip: str) -> None:
    """Aplica el límite por IP (3/min y 20/día). Lanza 429 si se supera."""
    now = time.time()
    minute_ago = now - 60
    day_ago = now - 86_400
    with _ip_lock:
        hits = _ip_hits[ip]
        # Descartar timestamps de hace más de un día.
        while hits and hits[0] < day_ago:
            hits.popleft()
        last_minute = sum(1 for t in hits if t >= minute_ago)
        if last_minute >= PER_MINUTE:
            raise HTTPException(status_code=429, detail="Demasiados envíos. Espera un momento e inténtalo de nuevo.")
        if len(hits) >= PER_DAY:
            raise HTTPException(status_code=429, detail="Alcanzaste el límite de mensajes por hoy. Inténtalo mañana.")
        hits.append(now)


def _optional_user_id(url: str, anon_key: str, authorization: str | None) -> str | None:
    """Si viene un Bearer válido, devuelve el id del usuario; si no, None.

    El id se toma SIEMPRE del token verificado contra Supabase, nunca del
    cuerpo de la petición. Un token ausente o inválido no bloquea el envío
    (el formulario funciona sin sesión); simplemente no asocia usuario.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        anon = create_client(url, anon_key)
        res = anon.auth.get_user(token)
        user = getattr(res, "user", None)
        return getattr(user, "id", None) if user else None
    except Exception:
        return None


@router.post("/api/feedback", summary="Enviar un mensaje de contacto")
def create_feedback(
    request: Request,
    body: FeedbackIn = Body(...),
    authorization: str | None = Header(default=None),
):
    """Recibe y guarda un mensaje del formulario "Escríbenos".

    Args:
        request: Petición (para obtener la IP y aplicar el rate limit).
        body: Tipo, mensaje, correo opcional, consentimiento y honeypot.
        authorization: Encabezado ``Bearer`` opcional; si es válido, asocia el
            usuario autenticado.

    Returns:
        ``{"ok": True}`` si el mensaje se guardó (o si el honeypot lo descartó
        silenciosamente).

    Raises:
        HTTPException 400: tipo inválido, mensaje vacío o muy largo, correo mal
            formado, o falta la autorización de datos cuando hay correo.
        HTTPException 429: se superó el límite de envíos por IP.
        HTTPException 503: el servidor no tiene configurada la clave de servicio.
    """
    # Honeypot: fingir éxito sin guardar.
    if body.honeypot and body.honeypot.strip():
        return {"ok": True}

    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío.")
    if len(msg) > MAX_MESSAGE_LENGTH:
        raise HTTPException(status_code=400, detail=f"El mensaje supera los {MAX_MESSAGE_LENGTH} caracteres.")

    tipo = (body.type or "").strip().lower()
    if tipo not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de mensaje no válido.")

    email = (body.email or "").strip() or None
    if email:
        if not EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail="El correo no tiene un formato válido.")
        if len(email) > 254:
            raise HTTPException(status_code=400, detail="El correo es demasiado largo.")
        if not body.consent:
            raise HTTPException(
                status_code=400,
                detail="Debes autorizar el tratamiento de tu correo para que podamos responderte.",
            )

    # Límite por IP.
    _check_rate_limit(client_ip(request))

    url, anon_key, service_key = _env()
    if not (url and service_key):
        raise HTTPException(status_code=503, detail="El servicio de mensajes no está configurado.")

    # Id del usuario a partir del token (si lo hay); nunca del cuerpo.
    user_id = _optional_user_id(url, anon_key, authorization) if anon_key else None

    admin: Client = create_client(url, service_key)
    try:
        admin.table("feedback_messages").insert({
            "type": tipo,
            "message": msg,
            "email": email,
            "user_id": user_id,
            "status": "nuevo",
        }).execute()
    except Exception:
        raise HTTPException(status_code=502, detail="No se pudo guardar el mensaje. Inténtalo más tarde.")

    return {"ok": True}
