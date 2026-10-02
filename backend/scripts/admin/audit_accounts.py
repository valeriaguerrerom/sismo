"""
Inventario de cuentas (solo lectura) para la auditoría.

Lista las cuentas de ``auth.users`` cruzadas con ``profiles`` para ver, de cada
una: correo, proveedor(es) de login, rol en el servidor (profiles.role) y si
está activa. Sirve para:
    - Confirmar qué cuentas tienen rol 'admin' validado en el SERVIDOR.
    - Detectar si dos "cuentas" son en realidad un mismo usuario con varias
      identidades vinculadas (mismo id de auth.users con varios providers).

NO modifica nada. Solo corre en local con la service key de backend/.env.

Uso:
    cd backend
    py scripts/admin/audit_accounts.py

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# backend/ está tres niveles arriba (scripts/admin/este_archivo.py).
BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


def _mask(email: str) -> str:
    """Enmascara el correo para no imprimirlo completo (p. ej. v***@gmail.com)."""
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    head = local[0] if local else "?"
    return f"{head}***@{domain}"


def _list_auth_users(sb) -> list:
    """Devuelve todas las cuentas de auth.users (API de administración)."""
    out = []
    page = 1
    while True:
        res = sb.auth.admin.list_users(page=page, per_page=200)
        users = res if isinstance(res, list) else getattr(res, "users", res)
        if not users:
            break
        out.extend(users)
        if len(users) < 200:
            break
        page += 1
    return out


def main() -> None:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        sys.exit(
            "ERROR: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.\n"
            "Este script solo se ejecuta en local con la service key; nunca en producción."
        )

    sb = create_client(url, key)
    users = _list_auth_users(sb)

    # Perfiles (rol y estado) por id.
    prof_rows = sb.table("profiles").select("id,email,role,active").execute().data or []
    profiles = {r["id"]: r for r in prof_rows}

    print(f"\n{'CORREO':<28} {'PROVEEDORES':<18} {'ROL (servidor)':<16} {'ACTIVO':<7} ID")
    print("─" * 100)
    for u in users:
        uid = getattr(u, "id", "")
        email = getattr(u, "email", "") or ""
        # Providers vinculados a ESTA cuenta de auth.users.
        identities = getattr(u, "identities", None) or []
        provs = ",".join(sorted({getattr(i, "provider", "?") for i in identities})) or "?"
        prof = profiles.get(uid, {})
        role = prof.get("role", "(sin perfil)")
        active = prof.get("active", "?")
        print(f"{_mask(email):<28} {provs:<18} {str(role):<16} {str(active):<7} {uid}")

    print("\nNotas:")
    print("- 'PROVEEDORES' con más de un valor = una sola cuenta con varias identidades.")
    print("- Dos filas con el mismo correo pero distinto ID = dos cuentas separadas.")
    print(f"- Total de cuentas en auth.users: {len(users)}")


if __name__ == "__main__":
    main()
