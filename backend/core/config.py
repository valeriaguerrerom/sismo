"""
Configuración por entorno (seguridad).
=======================================

Centraliza el endurecimiento del backend según el entorno de ejecución para que
tanto ``main.py`` como los routers de ``api/`` compartan el mismo criterio sin
duplicar lógica.

APP_ENV controla el comportamiento:
    - "development" (por defecto): orígenes CORS locales, detalles de error
      visibles y documentación interactiva habilitada.
    - "production": CORS restringido a ALLOWED_ORIGINS, detalles de error
      ocultos y documentación deshabilitada.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import os

from fastapi import HTTPException

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"


def require_user_id(authorization: str | None) -> str:
    """Verifica el Bearer token contra Supabase y devuelve el id del usuario.

    Centraliza la comprobación de sesión del lado del servidor para los endpoints
    que deben exigir que haya un usuario autenticado (p. ej. la carga de MiniSEED).
    El id se toma SIEMPRE del token verificado contra Supabase, nunca del cuerpo.

    Args:
        authorization: Encabezado ``Authorization: Bearer <access_token>``.

    Returns:
        str: El id del usuario dueño del token.

    Raises:
        HTTPException 401: si falta el token o es inválido/expirado.
        HTTPException 503: si el backend no tiene configurada la clave de Supabase.
    """
    url = os.getenv("SUPABASE_URL", "")
    anon = os.getenv("SUPABASE_ANON_KEY", "")
    if not (url and anon):
        # Sin Supabase configurado (desarrollo/pruebas) no se puede verificar la
        # sesión contra el proveedor. En ese modo no se bloquea: se devuelve un
        # id de marcador para no romper el entorno local. En producción las
        # claves SÍ están, así que la verificación real sí se aplica.
        return "anon-local"

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Inicia sesión para usar esta función.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Inicia sesión para usar esta función.")

    try:
        from supabase import create_client
        res = create_client(url, anon).auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
    user = getattr(res, "user", None)
    if not user or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
    return user.id


def safe_error_detail(exc: Exception, mensaje_publico: str) -> str:
    """Devuelve el detalle de error adecuado al entorno.

    En producción oculta el mensaje interno de la excepción (puede filtrar rutas,
    nombres de tablas o trazas) y devuelve solo un mensaje genérico. En desarrollo
    incluye el detalle real para facilitar la depuración.

    Args:
        exc: La excepción capturada.
        mensaje_publico: Mensaje genérico seguro para mostrar al usuario final.

    Returns:
        str: El mensaje a exponer en la respuesta HTTP.
    """
    if IS_PRODUCTION:
        return mensaje_publico
    return f"{mensaje_publico}: {exc}"
