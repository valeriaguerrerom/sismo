"""
Autogestión y administración de cuentas.

Endpoints:
    DELETE /api/account            — el usuario elimina su propia cuenta.
    DELETE /api/admin/users/{id}   — un administrador elimina otra cuenta.

Ambos ELIMINAN con ANONIMIZACIÓN de reportes (habeas data, Ley 1581):
    - Verifican el JWT contra Supabase (clave anon).
    - Anonimizan las simulaciones del usuario: quitan textos identificables y
      dejan user_id en NULL (la FK es ON DELETE SET NULL), conservando solo los
      parámetros y resultados técnicos con fines estadísticos.
    - Eliminan al usuario de ``auth.users`` (cascada al perfil).
    - Registran la baja en ``account_deletions`` SIN datos personales del
      eliminado (solo origen, admin ejecutor, motivo y nº de reportes).
    - Impiden eliminar al único administrador.

La clave de servicio (``SUPABASE_SERVICE_ROLE_KEY``) NUNCA se expone al
frontend: vive solo como variable de entorno del servidor.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Body, Header, HTTPException
from supabase import create_client, Client

from core.config import safe_error_detail

router = APIRouter(tags=["Cuenta"])

# Las variables se leen en tiempo de request (dentro de las funciones), no al
# importar el módulo: así no dependen de que load_dotenv() ya se haya ejecutado.
def _env() -> tuple[str, str, str]:
    """Devuelve (url, anon_key, service_key). service_key acepta ambos nombres."""
    url = os.getenv("SUPABASE_URL", "")
    anon = os.getenv("SUPABASE_ANON_KEY", "")
    # En Railway crea SUPABASE_SERVICE_ROLE_KEY. Como respaldo local se acepta
    # SUPABASE_SERVICE_KEY (nombre usado por el script de subida a Storage).
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
    return url, anon, service


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
    url, anon_key, service_key = _env()
    if not (url and anon_key):
        raise HTTPException(status_code=503, detail="Servicio no configurado.")
    if not service_key:
        raise HTTPException(
            status_code=503,
            detail="Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.",
        )
    return (
        create_client(url, anon_key),
        create_client(url, service_key),
    )


def _anonymize_reports(admin: Client, user_id: str) -> int:
    """
    Anonimiza los reportes del usuario ANTES de borrarlo: quita cualquier texto
    que pueda identificar a la persona y conserva solo parámetros y resultados
    técnicos. Devuelve cuántos reportes se anonimizaron.

    Campos que se limpian:
      - title  -> 'Simulación anonimizada'
      - notes  -> ''
      - results.map3d.options.title / .author / .institution -> '' (si existen)
    Se conservan: params (Vp, Vs, densidad, magnitud, etc.) y results técnicos
    (amplitud, llegadas P/S, frecuencia dominante, gridInfo).
    """
    rows = (
        admin.table("simulation_reports")
        .select("id, results")
        .eq("user_id", user_id)
        .execute()
    )
    reports = rows.data or []
    for r in reports:
        results = r.get("results")
        # Limpiar posibles textos libres dentro de results (reportes del Mapa 3D).
        if isinstance(results, dict):
            opts = (results.get("map3d") or {}).get("options") if isinstance(results.get("map3d"), dict) else None
            if isinstance(opts, dict):
                for k in ("title", "author", "institution", "notes"):
                    if k in opts:
                        opts[k] = ""
        admin.table("simulation_reports").update({
            "user_id": None,
            "title": "Simulación anonimizada",
            "notes": "",
            "results": results,
        }).eq("id", r["id"]).execute()
    return len(reports)


def _log_deletion(admin: Client, origin: str, admin_id: str | None, reason: str | None, count: int) -> None:
    """Registra la eliminación en la bitácora SIN datos personales del eliminado."""
    try:
        admin.table("account_deletions").insert({
            "origin": origin,
            "admin_id": admin_id,
            "reason": reason,
            "anonymized_reports_count": count,
        }).execute()
    except Exception:  # pragma: no cover - la bitácora no debe bloquear el borrado
        pass


def _delete_account(admin: Client, user_id: str, origin: str, admin_id: str | None, reason: str | None) -> int:
    """
    Anonimiza los reportes, elimina al usuario de auth.users (cascada al perfil;
    los reportes quedan con user_id NULL por ON DELETE SET NULL) y registra la
    eliminación en la bitácora. Devuelve el nº de reportes anonimizados.
    """
    # Anonimizar reportes. Si la migración 20260920 no está aplicada (user_id
    # sigue NOT NULL o la FK es ON DELETE CASCADE), este UPDATE falla; damos un
    # mensaje claro para no dejar un 500 opaco.
    try:
        count = _anonymize_reports(admin, user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "No se pudieron anonimizar los reportes del usuario. "
                "Verifica que la migración 20260920 esté aplicada en la base. "
                f"Detalle: {exc}"
            ),
        )
    try:
        admin.auth.admin.delete_user(user_id)
    except Exception as exc:  # pragma: no cover - depende del servicio remoto
        raise HTTPException(status_code=500, detail=safe_error_detail(exc, "No se pudo eliminar la cuenta"))
    _log_deletion(admin, origin, admin_id, reason, count)
    return count


def _is_sole_admin(admin: Client, user_id: str) -> bool:
    """True si el usuario es administrador y es el único de la plataforma."""
    try:
        row = admin.table("profiles").select("role").eq("id", user_id).single().execute()
        if (row.data or {}).get("role") != "admin":
            return False
    except Exception:
        return False
    admins = admin.table("profiles").select("id", count="exact").eq("role", "admin").execute()
    admin_count = admins.count if admins.count is not None else len(admins.data or [])
    return admin_count <= 1


@router.delete("/api/admin/users/{target_id}", summary="Eliminar una cuenta (admin)")
def admin_delete_user(
    target_id: str,
    authorization: str | None = Header(default=None),
    reason: str | None = Body(default=None, embed=True),
):
    """
    Un administrador elimina la cuenta de otro usuario, anonimizando sus
    reportes (se conservan sin datos personales) y registrando la eliminación.

    Args:
        target_id: id del usuario a eliminar.
        authorization: encabezado ``Bearer`` con el access token del admin.
        reason: motivo de la eliminación (opcional).

    Raises:
        HTTPException 401: token ausente o inválido.
        HTTPException 403: quien llama no es administrador.
        HTTPException 409: se intenta eliminar al único administrador.
    """
    token = _bearer_token(authorization)
    anon, admin = _admin_clients()
    caller_id = _verified_user_id(anon, token)

    caller = admin.table("profiles").select("role").eq("id", caller_id).single().execute()
    if (caller.data or {}).get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo un administrador puede eliminar cuentas.")

    if _is_sole_admin(admin, target_id):
        raise HTTPException(
            status_code=409,
            detail="No puedes eliminar al único administrador de la plataforma.",
        )

    count = _delete_account(admin, target_id, origin="administrador", admin_id=caller_id, reason=reason)
    return {"deleted": True, "anonymized_reports": count}


@router.delete("/api/account", summary="Eliminar la propia cuenta")
def delete_own_account(authorization: str | None = Header(default=None)):
    """
    El usuario elimina su propia cuenta: anonimiza sus reportes (se conservan
    sin datos personales), borra su perfil/credenciales y registra la baja.

    Args:
        authorization: Encabezado ``Bearer`` con el access token del usuario.

    Raises:
        HTTPException 401: token ausente o inválido.
        HTTPException 409: el usuario es el único administrador.
        HTTPException 503: el servidor no tiene configurada la clave de servicio.
    """
    token = _bearer_token(authorization)
    anon, admin = _admin_clients()
    user_id = _verified_user_id(anon, token)

    if _is_sole_admin(admin, user_id):
        raise HTTPException(
            status_code=409,
            detail=(
                "Eres el único administrador. Asigna otro administrador "
                "antes de eliminar tu cuenta."
            ),
        )

    count = _delete_account(admin, user_id, origin="usuario", admin_id=None, reason=None)
    return {"deleted": True, "anonymized_reports": count}
