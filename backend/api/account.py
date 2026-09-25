"""
Autogestión de la cuenta del usuario autenticado.

Endpoint:
    DELETE /api/account  (requiere Authorization: Bearer <access_token>)

Elimina de forma permanente la cuenta del propio usuario:
    - Verifica el JWT del usuario contra Supabase (con la clave anon).
    - Impide eliminar la cuenta si es el único administrador de la plataforma.
    - Elimina al usuario de ``auth.users`` usando la clave de servicio
      (service_role). Por las claves foráneas ``ON DELETE CASCADE`` esto
      arrastra su perfil (``profiles``) y sus reportes (``simulation_reports``).

La clave de servicio (``SUPABASE_SERVICE_ROLE_KEY``) NUNCA se expone al
frontend: vive solo como variable de entorno del servidor.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException
from supabase import create_client, Client

router = APIRouter(tags=["Cuenta"])

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
# En Railway crea SUPABASE_SERVICE_ROLE_KEY. Como respaldo local se acepta
# SUPABASE_SERVICE_KEY (nombre usado por el script de subida a Storage).
SUPABASE_SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    or os.getenv("SUPABASE_SERVICE_KEY", "")
)


def _bearer_token(authorization: str | None) -> str:
    """Extrae el token del encabezado ``Authorization: Bearer <token>``."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Falta el token de autenticación.")
    return authorization.split(" ", 1)[1].strip()


def _verified_user_id(anon: Client, token: str) -> str:
    """Devuelve el id del usuario dueño del token, o lanza 401."""
    try:
        auth_res = anon.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
    user = getattr(auth_res, "user", None)
    if not user or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
    return user.id


def _admin_clients() -> tuple[Client, Client]:
    """Crea los clientes anon y de servicio, validando la configuración."""
    if not (SUPABASE_URL and SUPABASE_ANON_KEY):
        raise HTTPException(status_code=503, detail="Servicio no configurado.")
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=503,
            detail="Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.",
        )
    return (
        create_client(SUPABASE_URL, SUPABASE_ANON_KEY),
        create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    )


def _delete_user_cascade(admin: Client, user_id: str) -> None:
    """Elimina al usuario de auth.users (cascada a perfil y reportes)."""
    try:
        admin.auth.admin.delete_user(user_id)
    except Exception as exc:  # pragma: no cover - depende del servicio remoto
        raise HTTPException(status_code=500, detail=f"No se pudo eliminar la cuenta: {exc}")


@router.delete("/api/admin/users/{target_id}", summary="Eliminar una cuenta (admin)")
def admin_delete_user(target_id: str, authorization: str | None = Header(default=None)):
    """
    Un administrador elimina la cuenta de otro usuario.

    Verifica que quien llama tenga rol de administrador, impide eliminar al
    único administrador y elimina al usuario objetivo con la clave de servicio
    (arrastra perfil y reportes por las claves foráneas en cascada).

    Args:
        target_id: id del usuario a eliminar.
        authorization: encabezado ``Bearer`` con el access token del admin.

    Raises:
        HTTPException 401: token ausente o inválido.
        HTTPException 403: quien llama no es administrador.
        HTTPException 409: se intenta eliminar al único administrador.
    """
    token = _bearer_token(authorization)
    anon, admin = _admin_clients()
    caller_id = _verified_user_id(anon, token)

    # Quien llama debe ser administrador.
    caller = admin.table("profiles").select("role").eq("id", caller_id).single().execute()
    if (caller.data or {}).get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo un administrador puede eliminar cuentas.")

    # No permitir eliminar al único administrador de la plataforma.
    target = admin.table("profiles").select("role").eq("id", target_id).single().execute()
    if (target.data or {}).get("role") == "admin":
        admins = admin.table("profiles").select("id", count="exact").eq("role", "admin").execute()
        admin_count = admins.count if admins.count is not None else len(admins.data or [])
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="No puedes eliminar al único administrador de la plataforma.",
            )

    _delete_user_cascade(admin, target_id)
    return {"deleted": True}


@router.delete("/api/account", summary="Eliminar la propia cuenta")
def delete_own_account(authorization: str | None = Header(default=None)):
    """
    Elimina la cuenta del usuario autenticado (perfil, reportes y credenciales).

    Args:
        authorization: Encabezado ``Bearer`` con el access token del usuario.

    Returns:
        dict: ``{"deleted": True}`` cuando la cuenta se elimina.

    Raises:
        HTTPException 401: token ausente o inválido.
        HTTPException 409: el usuario es el único administrador.
        HTTPException 503: el servidor no tiene configurada la clave de servicio.
    """
    token = _bearer_token(authorization)
    anon, admin = _admin_clients()
    user_id = _verified_user_id(anon, token)

    # Regla de negocio: no permitir eliminar al ÚNICO administrador.
    try:
        me = admin.table("profiles").select("role").eq("id", user_id).single().execute()
        my_role = (me.data or {}).get("role")
    except Exception:
        my_role = None

    if my_role == "admin":
        admins = admin.table("profiles").select("id", count="exact").eq("role", "admin").execute()
        admin_count = admins.count if admins.count is not None else len(admins.data or [])
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Eres el único administrador. Asigna otro administrador "
                    "antes de eliminar tu cuenta."
                ),
            )

    _delete_user_cascade(admin, user_id)
    return {"deleted": True}
