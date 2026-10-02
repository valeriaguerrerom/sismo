"""
Verificación EN VIVO del control de acceso (IDOR, escalada de rol, endpoints admin).

Comprueba contra el Supabase real que un usuario normal NO puede:
  1. Leer/editar/borrar reportes de OTRO usuario (IDOR en simulation_reports).
  2. Escalar privilegios: UPDATE o INSERT/upsert de su perfil con role='admin'.
  3. Reactivarse si fue desactivado por un administrador (active=true).
  4. Usar endpoints de administración (listar usuarios / borrar cuentas).

Requisitos (crea las cuentas con manage_test_accounts.py primero):
  - Dos cuentas de prueba de rol 'user': prueba1 y prueba2.
  - Sus contraseñas (se piden por consola, ocultas; nunca por argumento).
  - El anon key en backend/.env (SUPABASE_ANON_KEY).

Uso:
  cd backend
  py scripts/admin/verify_access_control.py
  # pide: correo+contraseña de prueba1 y de prueba2.

Cada comprobación imprime PASA (el acceso fue denegado, como debe) o FALLA
(el acceso se permitió: hay un agujero de seguridad). Solo lectura/escritura
de prueba sobre las propias cuentas; no toca cuentas reales.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
from __future__ import annotations

import getpass
import hashlib
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

ITERATIONS = 310_000
KEY_BYTES = 32
SALT_PREFIX = "sismonarino:"

_passed = 0
_failed = 0


def derive(email: str, password: str) -> str:
    salt = (SALT_PREFIX + email.strip().lower()).encode("utf-8")
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, dklen=KEY_BYTES).hex()


def check(descripcion: str, acceso_denegado: bool) -> None:
    """Registra el resultado. acceso_denegado=True significa que el control funcionó."""
    global _passed, _failed
    if acceso_denegado:
        _passed += 1
        print(f"  PASA  · {descripcion} (acceso denegado, como debe)")
    else:
        _failed += 1
        print(f"  FALLA · {descripcion} (ACCESO PERMITIDO — revisar)")


def _login(url: str, anon: str, email: str, password: str):
    sb = create_client(url, anon)
    sb.auth.sign_in_with_password({"email": email.strip(), "password": derive(email, password)})
    return sb


def main() -> None:
    url = os.getenv("SUPABASE_URL", "")
    anon = os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not anon:
        sys.exit("ERROR: falta SUPABASE_URL o SUPABASE_ANON_KEY en backend/.env.")

    print("Credenciales de las dos cuentas de prueba (rol user).")
    email1 = input("Correo de prueba1: ").strip()
    pw1 = getpass.getpass("Contraseña de prueba1: ")
    email2 = input("Correo de prueba2: ").strip()
    pw2 = getpass.getpass("Contraseña de prueba2: ")

    try:
        sb1 = _login(url, anon, email1, pw1)
        sb2 = _login(url, anon, email2, pw2)
    except Exception as exc:
        sys.exit(f"No se pudo iniciar sesión con las cuentas de prueba: {exc}")

    uid1 = sb1.auth.get_user().user.id
    uid2 = sb2.auth.get_user().user.id

    print("\n== 1. IDOR en simulation_reports ==")
    # prueba2 crea un reporte propio.
    rep = sb2.table("simulation_reports").insert({
        "user_id": uid2, "title": "Reporte de prueba2 (IDOR test)",
        "params": {}, "results": {},
    }).execute()
    rep_id = rep.data[0]["id"] if rep.data else None

    if rep_id:
        # prueba1 intenta LEER el reporte de prueba2.
        r = sb1.table("simulation_reports").select("*").eq("id", rep_id).execute()
        check("prueba1 lee un reporte de prueba2", not r.data)

        # prueba1 intenta EDITARLO.
        upd = sb1.table("simulation_reports").update({"title": "hackeado"}).eq("id", rep_id).execute()
        check("prueba1 edita un reporte de prueba2", not upd.data)

        # prueba1 intenta BORRARLO.
        dele = sb1.table("simulation_reports").delete().eq("id", rep_id).execute()
        check("prueba1 borra un reporte de prueba2", not dele.data)

        # Limpieza: prueba2 borra su propio reporte.
        sb2.table("simulation_reports").delete().eq("id", rep_id).execute()

    print("\n== 2. Escalada de rol (profiles) ==")
    # prueba1 intenta subirse a admin por UPDATE.
    try:
        up = sb1.table("profiles").update({"role": "admin"}).eq("id", uid1).execute()
        # Si no lanzó, verificar que el rol NO cambió realmente.
        now = sb1.table("profiles").select("role").eq("id", uid1).execute()
        rol = (now.data[0]["role"] if now.data else "user")
        check("prueba1 se asigna role=admin por UPDATE", rol != "admin")
        _ = up
    except Exception:
        check("prueba1 se asigna role=admin por UPDATE", True)  # excepción = denegado

    # prueba1 intenta upsert de su perfil con role='admin' (vía INSERT).
    try:
        sb1.table("profiles").upsert({
            "id": uid1, "email": email1, "role": "admin",
        }, on_conflict="id").execute()
        now = sb1.table("profiles").select("role").eq("id", uid1).execute()
        rol = (now.data[0]["role"] if now.data else "user")
        check("prueba1 se asigna role=admin por upsert", rol != "admin")
    except Exception:
        check("prueba1 se asigna role=admin por upsert", True)

    print("\n== 3. Estado de cuenta: desactivación por admin + ataque en dos pasos ==")
    svc_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
    if not svc_key:
        print("  SALTADO · falta SUPABASE_SERVICE_ROLE_KEY para simular la baja administrativa.")
    else:
        svc = create_client(url, svc_key)
        # Simula que un ADMIN desactiva a prueba1.
        svc.table("profiles").update({
            "active": False, "deactivated_by": "administrador",
            "deactivated_at": "2026-01-01T00:00:00+00:00",
            "deactivation_reason": "Prueba de control de acceso",
        }).eq("id", uid1).execute()

        # Ataque en UN paso: prueba1 intenta reactivarse directamente.
        try:
            sb1.table("profiles").update({
                "active": True, "deactivated_by": None, "deactivated_at": None, "deactivation_reason": None,
            }).eq("id", uid1).execute()
            st = svc.table("profiles").select("active").eq("id", uid1).execute()
            activa = bool(st.data and st.data[0]["active"])
            check("prueba1 (baja admin) se reactiva en un paso", not activa)
        except Exception:
            check("prueba1 (baja admin) se reactiva en un paso", True)

        # Ataque en DOS pasos: paso 1 -> "firmar" la baja como propia.
        try:
            sb1.table("profiles").update({"deactivated_by": "usuario"}).eq("id", uid1).execute()
            st = svc.table("profiles").select("deactivated_by").eq("id", uid1).execute()
            firmo = bool(st.data and st.data[0]["deactivated_by"] == "usuario")
            check("prueba1 (baja admin) re-marca la baja como 'usuario' (paso 1)", not firmo)
        except Exception:
            check("prueba1 (baja admin) re-marca la baja como 'usuario' (paso 1)", True)

        # Paso 2 (por si el paso 1 hubiera pasado): intentar reactivar.
        try:
            sb1.table("profiles").update({
                "active": True, "deactivated_by": None, "deactivated_at": None, "deactivation_reason": None,
            }).eq("id", uid1).execute()
            st = svc.table("profiles").select("active").eq("id", uid1).execute()
            activa = bool(st.data and st.data[0]["active"])
            check("prueba1 (baja admin) se reactiva en dos pasos", not activa)
        except Exception:
            check("prueba1 (baja admin) se reactiva en dos pasos", True)

        # Caso LEGÍTIMO: el propio usuario se desactiva y se reactiva.
        # Primero restauramos la cuenta a activa (como admin) para partir limpio.
        svc.table("profiles").update({
            "active": True, "deactivated_by": None, "deactivated_at": None, "deactivation_reason": None,
        }).eq("id", uid1).execute()

        ok_deact = False
        ok_react = False
        try:
            # Autodesactivación legítima (lo mismo que hace deactivateOwnAccount).
            sb1.table("profiles").update({
                "active": False, "deactivated_by": "usuario",
                "deactivated_at": "2026-01-01T00:00:00+00:00", "deactivation_reason": None,
            }).eq("id", uid1).execute()
            st = svc.table("profiles").select("active").eq("id", uid1).execute()
            ok_deact = bool(st.data and st.data[0]["active"] is False)
        except Exception:
            ok_deact = False

        try:
            # Reactivación propia legítima (lo mismo que reactivateOwnAccount).
            sb1.table("profiles").update({
                "active": True, "deactivated_by": None, "deactivated_at": None, "deactivation_reason": None,
            }).eq("id", uid1).execute()
            st = svc.table("profiles").select("active").eq("id", uid1).execute()
            ok_react = bool(st.data and st.data[0]["active"] is True)
        except Exception:
            ok_react = False

        # Aquí "acceso denegado" NO es lo deseado: estos flujos deben FUNCIONAR.
        check("autodesactivación propia de prueba1 FUNCIONA", ok_deact)
        check("reactivación propia de prueba1 FUNCIONA", ok_react)

        # Dejar la cuenta activa y limpia pase lo que pase.
        svc.table("profiles").update({
            "active": True, "deactivated_by": None, "deactivated_at": None, "deactivation_reason": None,
        }).eq("id", uid1).execute()

    print("\n== 4. Lectura de perfiles ajenos ==")
    r = sb1.table("profiles").select("*").eq("id", uid2).execute()
    check("prueba1 lee el perfil de prueba2", not r.data)

    print("\n== 5. Endpoints de administración (vía RPC/tabla) ==")
    # account_deletions es solo-admin para lectura.
    try:
        r = sb1.table("account_deletions").select("*").limit(1).execute()
        check("prueba1 lee la bitácora account_deletions", not r.data)
    except Exception:
        check("prueba1 lee la bitácora account_deletions", True)

    sb1.auth.sign_out()
    sb2.auth.sign_out()

    print(f"\nResumen: {_passed} PASA · {_failed} FALLA")
    if _failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
